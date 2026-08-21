import 'server-only';

import { getAdminSupabase } from '@/lib/supabase/admin';
import { AuditActor } from '@/lib/services/volunteer-audit-writer';
import { MutationResult } from '@/lib/services/volunteer-mutation.service';
import { formatDateShort, getOperationalEventDays } from '@/lib/dates';

const SHIFT_KEYS = new Set(['T1', 'T2', 'T3', 'T4']);

export interface CommitteeAreaSummary {
  id: string;
  committeeId: string;
  name: string;
  description?: string | null;
  status: 'active' | 'archived';
}

export interface CommitteeAreaInput {
  committeeId: string;
  name: string;
  description?: string | null;
}

export interface AreaRequirementInput {
  dayKey: string;
  shiftKey: 'T1' | 'T2' | 'T3' | 'T4';
  requiredCount: number;
}

interface AreaMutationResult extends MutationResult {
  area?: CommitteeAreaSummary;
  retainedAssignments?: number;
}

export interface ShiftAreaAssignmentScope {
  committeeId: string;
  shiftIds: string[];
  assignments: Array<{
    id: string;
    volunteerId: string;
    dayKey: string;
    shiftKey: string;
    areaId: string | null;
  }>;
}

interface ShiftAreaAssignmentResult extends MutationResult {
  assignedCount?: number;
}

function cleanSingleLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function errorMessage(error: { code?: string; message?: string } | null, fallback: string): string {
  if (error?.code === '23505') return 'Ya existe un área activa con este nombre en el comité.';
  return error?.message ? `${fallback}: ${error.message}` : fallback;
}

export class CommitteeAreaService {
  static async getAreaScope(areaId: string): Promise<CommitteeAreaSummary | null> {
    if (!areaId) return null;
    const supabase = await getAdminSupabase();
    const { data } = await supabase
      .from('committee_areas')
      .select('id, committee_id, name, description, status')
      .eq('id', areaId)
      .maybeSingle();

    if (!data) return null;
    return {
      id: data.id,
      committeeId: data.committee_id,
      name: data.name,
      description: data.description,
      status: data.status,
    };
  }

  static async getShiftAssignmentScope(shiftIds: string[]): Promise<ShiftAreaAssignmentScope | null> {
    const uniqueShiftIds = Array.from(new Set(shiftIds.filter(Boolean)));
    if (uniqueShiftIds.length === 0 || uniqueShiftIds.length > 250) return null;

    const supabase = await getAdminSupabase();
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('id, volunteer_id, day_key, shift_key, area_id')
      .in('id', uniqueShiftIds);
    if (shiftsError || !shifts || shifts.length !== uniqueShiftIds.length) return null;

    const volunteerIds = Array.from(new Set(shifts.map((shift) => shift.volunteer_id).filter(Boolean)));
    if (volunteerIds.length === 0) return null;
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, committee_id, status')
      .in('id', volunteerIds);
    if (volunteersError || !volunteers || volunteers.length !== volunteerIds.length) return null;

    const committeeId = volunteers[0]?.committee_id as string | null;
    if (
      !committeeId
      || volunteers.some((volunteer) => volunteer.status === 'archived' || volunteer.committee_id !== committeeId)
    ) return null;

    return {
      committeeId,
      shiftIds: uniqueShiftIds,
      assignments: shifts.map((shift) => ({
        id: shift.id,
        volunteerId: shift.volunteer_id,
        dayKey: shift.day_key,
        shiftKey: shift.shift_key,
        areaId: shift.area_id || null,
      })),
    };
  }

  static async createArea(input: CommitteeAreaInput, actor: AuditActor & { id: string }): Promise<AreaMutationResult> {
    const name = cleanSingleLine(input.name || '');
    const description = input.description?.trim() || null;
    if (!input.committeeId) return { success: false, error: 'Selecciona un comité.' };
    if (name.length < 2 || name.length > 80) {
      return { success: false, error: 'El nombre debe tener entre 2 y 80 caracteres.' };
    }
    if (description && description.length > 240) {
      return { success: false, error: 'La descripción no puede superar 240 caracteres.' };
    }

    const supabase = await getAdminSupabase();
    const { data: committee } = await supabase
      .from('committees')
      .select('id, name, status')
      .eq('id', input.committeeId)
      .maybeSingle();
    if (!committee || committee.status === 'archived') {
      return { success: false, error: 'El comité no existe o está archivado.' };
    }

    const { data: lastArea } = await supabase
      .from('committee_areas')
      .select('sort_order')
      .eq('committee_id', input.committeeId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('committee_areas')
      .insert({
        committee_id: input.committeeId,
        name,
        description,
        sort_order: Number(lastArea?.sort_order || 0) + 1,
        created_by: actor.id,
        updated_by: actor.id,
      })
      .select('id, committee_id, name, status')
      .single();
    if (error || !data) return { success: false, error: errorMessage(error, 'No se pudo crear el área') };

    await this.writeAudit(actor, data.id, 'Creación', `Creó el área "${name}"`, {
      operation: 'committee_area_create',
      committeeId: input.committeeId,
      committeeName: committee.name,
    }, [
      { field: 'name', label: 'Nombre del área', oldValue: null, newValue: name },
      ...(description ? [{ field: 'description', label: 'Descripción', oldValue: null, newValue: description }] : []),
    ]);

    return {
      success: true,
      area: { id: data.id, committeeId: data.committee_id, name: data.name, status: data.status },
    };
  }

  static async updateArea(
    areaId: string,
    input: Pick<CommitteeAreaInput, 'name' | 'description'>,
    actor: AuditActor & { id: string }
  ): Promise<AreaMutationResult> {
    const current = await this.getAreaScope(areaId);
    if (!current) return { success: false, error: 'El área no existe.' };
    if (current.status !== 'active') return { success: false, error: 'Restaura el área antes de editarla.' };

    const name = cleanSingleLine(input.name || '');
    const description = input.description?.trim() || null;
    if (name.length < 2 || name.length > 80) {
      return { success: false, error: 'El nombre debe tener entre 2 y 80 caracteres.' };
    }
    if (description && description.length > 240) {
      return { success: false, error: 'La descripción no puede superar 240 caracteres.' };
    }

    const supabase = await getAdminSupabase();
    const { data, error } = await supabase
      .from('committee_areas')
      .update({ name, description, updated_by: actor.id })
      .eq('id', areaId)
      .eq('status', 'active')
      .select('id, committee_id, name, status')
      .single();
    if (error || !data) return { success: false, error: errorMessage(error, 'No se pudo actualizar el área') };

    await this.writeAudit(actor, areaId, 'Edición', `Actualizó el área "${current.name}"`, {
      operation: 'committee_area_update',
      committeeId: current.committeeId,
      previousName: current.name,
      name,
    }, [
      ...(current.name !== name
        ? [{ field: 'name', label: 'Nombre del área', oldValue: current.name, newValue: name }]
        : []),
      ...((current.description || null) !== description
        ? [{ field: 'description', label: 'Descripción', oldValue: current.description || null, newValue: description }]
        : []),
    ]);
    return {
      success: true,
      area: { id: data.id, committeeId: data.committee_id, name: data.name, status: data.status },
    };
  }

  static async archiveArea(areaId: string, actor: AuditActor & { id: string }): Promise<AreaMutationResult> {
    const current = await this.getAreaScope(areaId);
    if (!current) return { success: false, error: 'El área no existe.' };
    if (current.status === 'archived') return { success: true, area: current, retainedAssignments: 0 };

    const supabase = await getAdminSupabase();
    const { count } = await supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', areaId);
    const { error } = await supabase
      .from('committee_areas')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: actor.id,
        updated_by: actor.id,
      })
      .eq('id', areaId)
      .eq('status', 'active');
    if (error) return { success: false, error: errorMessage(error, 'No se pudo archivar el área') };

    await this.writeAudit(actor, areaId, 'Eliminación', `Archivó el área "${current.name}"`, {
      operation: 'committee_area_archive',
      committeeId: current.committeeId,
      retainedAssignments: count || 0,
    }, [{ field: 'status', label: 'Estado', oldValue: 'Activa', newValue: 'Archivada' }]);
    return { success: true, area: { ...current, status: 'archived' }, retainedAssignments: count || 0 };
  }

  static async restoreArea(areaId: string, actor: AuditActor & { id: string }): Promise<AreaMutationResult> {
    const current = await this.getAreaScope(areaId);
    if (!current) return { success: false, error: 'El área no existe.' };
    if (current.status === 'active') return { success: true, area: current };

    const supabase = await getAdminSupabase();
    const { error } = await supabase
      .from('committee_areas')
      .update({
        status: 'active',
        archived_at: null,
        archived_by: null,
        updated_by: actor.id,
      })
      .eq('id', areaId)
      .eq('status', 'archived');
    if (error) return { success: false, error: errorMessage(error, 'No se pudo restaurar el área') };

    await this.writeAudit(actor, areaId, 'Edición', `Restauró el área "${current.name}"`, {
      operation: 'committee_area_restore',
      committeeId: current.committeeId,
    }, [{ field: 'status', label: 'Estado', oldValue: 'Archivada', newValue: 'Activa' }]);
    return { success: true, area: { ...current, status: 'active' } };
  }

  static async saveRequirements(
    areaId: string,
    requirements: AreaRequirementInput[],
    actor: AuditActor & { id: string }
  ): Promise<MutationResult> {
    const current = await this.getAreaScope(areaId);
    if (!current) return { success: false, error: 'El área no existe.' };
    if (current.status !== 'active') return { success: false, error: 'No puedes configurar un área archivada.' };
    if (!Array.isArray(requirements) || requirements.length === 0) {
      return { success: false, error: 'Incluye al menos un requerimiento.' };
    }

    const uniqueKeys = new Set<string>();
    const validDayKeys = new Set(getOperationalEventDays().map((date) => formatDateShort(date)));
    for (const item of requirements) {
      const dayKey = item.dayKey?.trim();
      const key = `${dayKey}:${item.shiftKey}`;
      if (!dayKey || !validDayKeys.has(dayKey) || !SHIFT_KEYS.has(item.shiftKey)) {
        return { success: false, error: 'Hay un día o turno inválido.' };
      }
      if (!Number.isInteger(item.requiredCount) || item.requiredCount < 0 || item.requiredCount > 999) {
        return { success: false, error: 'Cada requerimiento debe ser un entero entre 0 y 999.' };
      }
      if (uniqueKeys.has(key)) return { success: false, error: 'Hay requerimientos duplicados.' };
      uniqueKeys.add(key);
    }

    const supabase = await getAdminSupabase();
    const rows = requirements.map((item) => ({
      area_id: areaId,
      day_key: item.dayKey.trim(),
      shift_key: item.shiftKey,
      required_count: item.requiredCount,
      updated_by: actor.id,
    }));
    const { error } = await supabase
      .from('area_shift_requirements')
      .upsert(rows, { onConflict: 'area_id,day_key,shift_key' });
    if (error) return { success: false, error: errorMessage(error, 'No se pudieron guardar los requerimientos') };

    await this.writeAudit(actor, areaId, 'Edición', `Actualizó la cobertura requerida de "${current.name}"`, {
      operation: 'committee_area_requirements_update',
      committeeId: current.committeeId,
      requirements,
    });
    return { success: true };
  }

  static async assignShiftAreas(
    scope: ShiftAreaAssignmentScope,
    areaId: string | null,
    actor: AuditActor & { id: string }
  ): Promise<ShiftAreaAssignmentResult> {
    const normalizedAreaId = areaId || null;
    let areaName = 'Sin área';
    if (normalizedAreaId) {
      const area = await this.getAreaScope(normalizedAreaId);
      if (!area || area.status !== 'active' || area.committeeId !== scope.committeeId) {
        return { success: false, error: 'El área no existe, está archivada o pertenece a otro comité.' };
      }
      areaName = area.name;
    }

    const currentScope = await this.getShiftAssignmentScope(scope.shiftIds);
    if (!currentScope || currentScope.committeeId !== scope.committeeId) {
      return { success: false, error: 'Una o más asignaciones ya no están disponibles.' };
    }

    const changedAssignments = currentScope.assignments.filter(
      (assignment) => assignment.areaId !== normalizedAreaId
    );
    if (changedAssignments.length === 0) return { success: true, assignedCount: 0 };

    const supabase = await getAdminSupabase();
    const previousAreaIds = Array.from(new Set(
      changedAssignments.map((assignment) => assignment.areaId).filter((id): id is string => Boolean(id))
    ));
    const previousAreaNames = new Map<string, string>();
    if (previousAreaIds.length > 0) {
      const { data: previousAreas } = await supabase
        .from('committee_areas')
        .select('id, name')
        .in('id', previousAreaIds);
      for (const previousArea of previousAreas || []) previousAreaNames.set(previousArea.id, previousArea.name);
    }
    const auditRows = changedAssignments.map((assignment) => {
      const previousAreaName = assignment.areaId
        ? previousAreaNames.get(assignment.areaId) || 'Área anterior'
        : 'Sin área';
      return {
        user_name: actor.name,
        user_role: actor.role,
        action_type: 'Edición',
        description: `Cambió el área del turno ${assignment.shiftKey} de ${assignment.dayKey}: ${previousAreaName} → ${areaName}`,
        details: JSON.stringify({
          changes: [{
            field: 'area_id',
            label: 'Área asignada',
            oldValue: previousAreaName,
            newValue: areaName,
          }],
          context: {
            operation: 'shift_area_assign',
            committeeId: scope.committeeId,
            shiftId: assignment.id,
            dayKey: assignment.dayKey,
            shiftKey: assignment.shiftKey,
            previousAreaId: assignment.areaId,
            areaId: normalizedAreaId,
          },
        }),
        target_id: assignment.volunteerId,
      };
    });
    const { data, error } = await supabase.rpc('assign_shift_areas_with_audit', {
      p_shift_ids: changedAssignments.map((assignment) => assignment.id),
      p_area_id: normalizedAreaId,
      p_audit_rows: auditRows,
    });
    if (error || data !== changedAssignments.length) {
      return { success: false, error: errorMessage(error, 'No se pudieron actualizar todas las asignaciones') };
    }

    return { success: true, assignedCount: changedAssignments.length };
  }

  private static async writeAudit(
    actor: AuditActor,
    targetId: string,
    actionType: string,
    description: string,
    context: Record<string, unknown>,
    changes?: Array<{ field: string; label: string; oldValue: unknown; newValue: unknown }>
  ): Promise<void> {
    const supabase = await getAdminSupabase();
    const { error } = await supabase.from('activity_logs').insert({
      user_name: actor.name,
      user_role: actor.role,
      action_type: actionType,
      description,
      details: JSON.stringify({ ...(changes && changes.length > 0 ? { changes } : {}), context }),
      target_id: targetId,
    });
    if (error) console.error('[CommitteeAreaService] Could not write audit log:', error.message);
  }
}
