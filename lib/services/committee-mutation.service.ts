/**
 * CommitteeMutationService
 *
 * The single orchestrator for all mutations on the `committees` and
 * `committee_shift_requirements` tables.
 *
 * ARCHITECTURE CONTRACT:
 * - Performs server-side validations.
 * - Executes Supabase DB mutations using admin client.
 * - Integrates with VolunteerMutationService for volunteer unlinking.
 * - Writes audit entries into `activity_logs` with target_id = committee.id.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { VolunteerMutationService, MutationResult } from './volunteer-mutation.service';
import { AuditActor } from './volunteer-audit-writer';

export interface CreateCommitteeResult extends MutationResult {
  committee?: any;
}

export interface ShiftCapacities {
  T1: number;
  T2: number;
  T3: number;
  T4: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export class CommitteeMutationService {
  /**
   * Creates a new committee and default shift requirements (T1-T4),
   * registering an audit log entry with target_id = committee.id.
   */
  static async createCommittee(
    name: string,
    actor: AuditActor
  ): Promise<CreateCommitteeResult> {
    try {
      const cleanName = (name || '').trim();
      if (!cleanName || cleanName.length < 2) {
        return { success: false, error: 'Ingresa un nombre válido de al menos 2 caracteres.' };
      }

      const slug = slugify(cleanName);
      const supabase = await getAdminSupabase();

      // Check if committee already exists
      const { data: existing } = await supabase
        .from('committees')
        .select('id')
        .ilike('name', cleanName)
        .maybeSingle();

      if (existing) {
        return { success: false, error: 'Ya existe un comité con este nombre.' };
      }

      // Insert committee
      let newComm: any = null;
      const { data: comm1, error: err1 } = await supabase
        .from('committees')
        .insert({ name: cleanName })
        .select('*')
        .single();

      if (err1 || !comm1) {
        const { data: comm2, error: err2 } = await supabase
          .from('committees')
          .insert({ name: cleanName, slug })
          .select('*')
          .single();

        if (err2 || !comm2) {
          console.error('[CommitteeMutationService.createCommittee] Insert failed:', err1 || err2);
          return {
            success: false,
            error: `Error al crear el comité: ${err1?.message || err2?.message || 'Error desconocido'}`,
          };
        }
        newComm = comm2;
      } else {
        newComm = comm1;
      }

      // Insert default requirements (4 per shift T1-T4)
      const shiftKeys: Array<'T1' | 'T2' | 'T3' | 'T4'> = ['T1', 'T2', 'T3', 'T4'];
      const reqRows = shiftKeys.map((sk) => ({
        committee_id: newComm.id,
        shift_key: sk,
        required: 4,
        updated_at: new Date().toISOString(),
      }));

      const { error: reqErr } = await supabase
        .from('committee_shift_requirements')
        .upsert(reqRows, { onConflict: 'committee_id,shift_key' });

      if (reqErr) {
        console.warn('[CommitteeMutationService.createCommittee] Requirements upsert warning:', reqErr.message);
      }

      // Audit log entry (target_id = newComm.id)
      await this.writeAuditLog({
        user_name: actor.name,
        user_role: actor.role,
        action_type: 'Creación',
        description: `Creó el nuevo comité "${cleanName}"`,
        details: JSON.stringify({
          context: {
            operation: 'committee_create',
            committeeName: cleanName,
          },
        }),
        target_id: newComm.id,
      });

      return { success: true, committee: newComm };
    } catch (err) {
      console.error('[CommitteeMutationService.createCommittee] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al crear el comité.' };
    }
  }

  /**
   * Archives a committee, unlinks assigned volunteers (with individual volunteer audit logs),
   * unlinks profiles, and registers a committee audit log entry with target_id = committeeId.
   */
  static async archiveCommittee(
    committeeId: string,
    expectedName: string,
    inputName: string,
    deleteText: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      if (!committeeId) {
        return { success: false, error: 'ID de comité no proporcionado.' };
      }
      if (inputName.trim() !== expectedName.trim()) {
        return { success: false, error: 'El nombre del comité ingresado no coincide exactamente.' };
      }
      if (deleteText.trim().toLowerCase() !== 'delete') {
        return { success: false, error: 'Debes escribir la palabra "delete" para confirmar la archivación.' };
      }

      const supabase = await getAdminSupabase();

      // 1. Unlink volunteers via VolunteerMutationService (with individual volunteer audit logs)
      const unlinkRes = await VolunteerMutationService.unlinkVolunteersFromCommittee(committeeId, actor);
      if (!unlinkRes.success) {
        console.error('[CommitteeMutationService.archiveCommittee] Volunteer unlinking failed:', unlinkRes.error);
      }

      // 2. Unlink profiles
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ committee_id: null })
        .eq('committee_id', committeeId);

      if (profErr) {
        console.error('[CommitteeMutationService.archiveCommittee] Profile unlinking warning:', profErr);
      }

      // 3. Update committee status to 'archived'
      const { error: archiveErr } = await supabase
        .from('committees')
        .update({ status: 'archived' })
        .eq('id', committeeId);

      if (archiveErr) {
        // Fallback: delete shift requirements and row if status column is missing
        await supabase
          .from('committee_shift_requirements')
          .delete()
          .eq('committee_id', committeeId);

        const { error: delErr } = await supabase
          .from('committees')
          .delete()
          .eq('id', committeeId);

        if (delErr) {
          console.error('[CommitteeMutationService.archiveCommittee] Delete fallback failed:', delErr);
          return { success: false, error: `No se pudo archivar el comité: ${delErr.message}` };
        }
      }

      // Committee audit log entry (target_id = committeeId)
      await this.writeAuditLog({
        user_name: actor.name,
        user_role: actor.role,
        action_type: 'Eliminación',
        description: `Archivó el comité "${expectedName}"`,
        details: JSON.stringify({
          context: {
            operation: 'committee_archive',
            committeeName: expectedName,
          },
        }),
        target_id: committeeId,
      });

      return { success: true };
    } catch (err) {
      console.error('[CommitteeMutationService.archiveCommittee] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al archivar el comité.' };
    }
  }

  /**
   * Restores an archived committee and registers an audit log entry with target_id = committeeId.
   */
  static async unarchiveCommittee(
    committeeId: string,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      if (!committeeId) {
        return { success: false, error: 'ID de comité no proporcionado.' };
      }

      const supabase = await getAdminSupabase();
      const { error } = await supabase
        .from('committees')
        .update({ status: 'active' })
        .eq('id', committeeId);

      if (error) {
        console.error('[CommitteeMutationService.unarchiveCommittee] Update failed:', error);
        return { success: false, error: `No se pudo desarchivar el comité: ${error.message}` };
      }

      // Committee audit log entry (target_id = committeeId)
      await this.writeAuditLog({
        user_name: actor.name,
        user_role: actor.role,
        action_type: 'Edición',
        description: 'Desarchivó y restauró el comité',
        details: JSON.stringify({
          context: {
            operation: 'committee_unarchive',
          },
        }),
        target_id: committeeId,
      });

      return { success: true };
    } catch (err) {
      console.error('[CommitteeMutationService.unarchiveCommittee] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al desarchivar el comité.' };
    }
  }

  /**
   * Updates shift capacities (T1-T4) for selected committees in batch,
   * calculating real field diffs and logging audit entries per committee only when values change.
   */
  static async updateShiftRequirements(
    selectedCommitteeNames: string[],
    capacities: ShiftCapacities,
    actor: AuditActor
  ): Promise<MutationResult> {
    try {
      if (!Array.isArray(selectedCommitteeNames) || selectedCommitteeNames.length === 0) {
        return { success: false, error: 'Selecciona al menos un comité para guardar los requerimientos.' };
      }

      const supabase = await getAdminSupabase();

      // 1. Fetch all committees matching the selected names
      const { data: comms, error: commErr } = await supabase
        .from('committees')
        .select('id, name')
        .in('name', selectedCommitteeNames);

      if (commErr || !comms || comms.length === 0) {
        return { success: false, error: 'No se encontraron los comités seleccionados.' };
      }

      const shiftKeys: Array<'T1' | 'T2' | 'T3' | 'T4'> = ['T1', 'T2', 'T3', 'T4'];
      const auditRows: any[] = [];
      const nowIso = new Date().toISOString();

      for (const comm of comms) {
        // Fetch current requirements for this committee
        const { data: currentReqs } = await supabase
          .from('committee_shift_requirements')
          .select('shift_key, required')
          .eq('committee_id', comm.id);

        const reqMap: Record<string, number> = {};
        currentReqs?.forEach((r) => {
          reqMap[r.shift_key] = r.required;
        });

        // Compute changes
        const changes: Array<{ field: string; label: string; oldValue: number; newValue: number }> = [];
        shiftKeys.forEach((sk) => {
          const oldVal = reqMap[sk] ?? 4;
          const newVal = capacities[sk];
          if (oldVal !== newVal) {
            changes.push({
              field: sk,
              label: `Requerimiento ${sk}`,
              oldValue: oldVal,
              newValue: newVal,
            });
          }
        });

        if (changes.length > 0) {
          // Perform upsert for this committee
          const rowsToUpsert = shiftKeys.map((sk) => ({
            committee_id: comm.id,
            shift_key: sk,
            required: capacities[sk],
            updated_at: nowIso,
          }));

          const { error: upsertErr } = await supabase
            .from('committee_shift_requirements')
            .upsert(rowsToUpsert, { onConflict: 'committee_id,shift_key' });

          if (upsertErr) {
            console.warn(`[CommitteeMutationService.updateShiftRequirements] Upsert warning for ${comm.name}:`, upsertErr.message);
          }

          // Build audit row for this specific committee (target_id = comm.id)
          auditRows.push({
            user_name: actor.name,
            user_role: actor.role,
            action_type: 'Edición',
            description: `Actualizó los requerimientos de turno del comité "${comm.name}"`,
            details: JSON.stringify({ changes }),
            target_id: comm.id,
          });
        }
      }

      // Batch insert audit logs if any committee had changes
      if (auditRows.length > 0) {
        await this.writeAuditLog(auditRows);
      }

      return { success: true };
    } catch (err) {
      console.error('[CommitteeMutationService.updateShiftRequirements] Unexpected exception:', err);
      return { success: false, error: 'Error inesperado al guardar requerimientos.' };
    }
  }

  /**
   * Silent helper to insert audit logs into activity_logs without throwing.
   */
  private static async writeAuditLog(rows: any | any[]): Promise<void> {
    try {
      const items = Array.isArray(rows) ? rows : [rows];
      if (items.length === 0) return;

      const supabase = await getAdminSupabase();
      const { error } = await supabase.from('activity_logs').insert(items);
      if (error) {
        console.error('[CommitteeMutationService.writeAuditLog] Audit log insert error:', error);
      }
    } catch (err) {
      console.error('[CommitteeMutationService.writeAuditLog] Exception during audit log write:', err);
    }
  }
}
