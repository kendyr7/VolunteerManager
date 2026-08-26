'use server'

import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppText, sendShiftChangeResultTemplate } from '@/lib/whatsapp-api';
import { formatE164 } from '@/lib/whatsapp';
import { createActivityLog } from '@/app/actions/activity-actions';
import { broadcastShiftSync } from '@/lib/services/shift-broadcast.service';
import {
  requireCapability,
  requireVolunteerCapability,
  requireVolunteerSelfOrCapability,
} from '@/lib/authorization';
import { hasCapability } from '@/lib/role-permissions';
import { isShiftAvailableForDay } from '@/lib/dates';
import {
  getCommitteeCoverageSnapshot,
  getCoverageLevel,
  isCoverageComplete,
  type ShiftChangeCoverageImpact,
} from '@/lib/shift-coverage';
import { createValidatedShiftChangeRequest } from '@/lib/services/shift-change-request.service';

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return createClient();
}

export async function fetchAllShiftChangeRequestsAction() {
  try {
    const authorization = await requireCapability('view_requests');
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone, committee_id, committees(name)), reviewer:profiles!shift_change_requests_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase
        .from('shift_change_requests')
        .select('*, volunteers(id, first_name, last_name, phone, committee_id, committees(name))')
        .order('created_at', { ascending: false });
      const requests = fallback.data || [];
      return {
        success: true,
        requests: hasCapability(authorization, 'view_all_volunteers')
          ? requests
          : requests.filter((request: any) => request.volunteers?.committee_id === authorization.committeeId),
      };
    }

    const requests = data || [];
    return {
      success: true,
      requests: hasCapability(authorization, 'view_all_volunteers')
        ? requests
        : requests.filter((request: any) => request.volunteers?.committee_id === authorization.committeeId),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchPendingShiftChangeRequestsAction() {
  return fetchAllShiftChangeRequestsAction();
}

export async function fetchShiftChangeCoverageImpactAction(
  requestId: string
): Promise<{ success: true; impact: ShiftChangeCoverageImpact } | { success: false; error: string }> {
  try {
    const supabase = getAdminClient();
    const { data: request, error } = await supabase
      .from('shift_change_requests')
      .select('id, volunteer_id, status, current_day_key, current_shift_key, requested_day_key, requested_shift_key, volunteers(id, first_name, last_name, committee_id, committees(name))')
      .eq('id', requestId)
      .single();

    if (error || !request) {
      return { success: false, error: 'Solicitud no encontrada.' };
    }

    await requireVolunteerCapability('reschedule_volunteer', request.volunteer_id);

    const volunteer = request.volunteers;
    if (!volunteer?.committee_id) {
      return { success: false, error: 'El voluntario no tiene un comité asignado.' };
    }

    const committeeName = volunteer.committees?.name || 'Sin comité';
    const snapshot = await getCommitteeCoverageSnapshot(
      supabase,
      volunteer.committee_id,
      [request.current_day_key, request.requested_day_key]
    );
    const sameSlot = request.current_day_key === request.requested_day_key
      && request.current_shift_key === request.requested_shift_key;
    const sourceAssignment = snapshot.assignments.find(assignment =>
      assignment.volunteerId === request.volunteer_id
      && assignment.dayKey === request.current_day_key
      && assignment.shiftKey === request.current_shift_key
    );
    const targetAssignment = snapshot.assignments.find(assignment =>
      assignment.volunteerId === request.volunteer_id
      && assignment.dayKey === request.requested_day_key
      && assignment.shiftKey === request.requested_shift_key
    );
    const targetSlot = snapshot.slots.find(slot =>
      slot.dayKey === request.requested_day_key && slot.shiftKey === request.requested_shift_key
    );
    // If the target was assigned after the request was created, approving is still
    // useful: it only needs to remove the original shift and must not add capacity.
    const targetFull = !targetAssignment && isCoverageComplete(targetSlot);

    const days = [...new Set([request.current_day_key, request.requested_day_key])].map(dayKey => ({
      dayKey,
      slots: snapshot.slots
        .filter(slot => slot.dayKey === dayKey)
        .map(slot => {
          const isSource = slot.dayKey === request.current_day_key && slot.shiftKey === request.current_shift_key;
          const isTarget = slot.dayKey === request.requested_day_key && slot.shiftKey === request.requested_shift_key;
          const projectedCount = Math.max(
            0,
            slot.count
              - (isSource && sourceAssignment && !sameSlot ? 1 : 0)
              + (isTarget && !targetAssignment && !sameSlot ? 1 : 0)
          );

          return {
            ...slot,
            projectedCount,
            level: getCoverageLevel(projectedCount, slot.required),
            role: isSource && isTarget ? 'both' as const : isSource ? 'source' as const : isTarget ? 'target' as const : null,
          };
        }),
    }));

    const sourceSlot = days
      .flatMap(day => day.slots)
      .find(slot => slot.role === 'source' || slot.role === 'both');
    const sourceWouldBeUnderstaffed = Boolean(
      sourceSlot && sourceSlot.required > 0 && sourceSlot.projectedCount < sourceSlot.required
    );
    const canApprove = request.status === 'pending'
      && Boolean(sourceAssignment)
      && !sourceAssignment?.checkedOut
      && !sameSlot
      && !targetFull;

    let recommendation: ShiftChangeCoverageImpact['recommendation'] = 'safe';
    let message = targetAssignment
      ? `Actualmente aparece en ambos turnos. Aprobar conservará ${request.requested_shift_key} (${request.requested_day_key}) y retirará ${request.current_shift_key} (${request.current_day_key}).`
      : 'El cambio mantiene la cobertura requerida en ambos turnos.';
    if (!canApprove) {
      recommendation = 'blocked';
      if (targetFull) message = 'El turno solicitado ya tiene la cobertura completa y no admite más solicitudes.';
      else if (request.status !== 'pending') message = 'Esta solicitud ya fue procesada.';
      else if (!sourceAssignment) message = 'El turno original ya no está asignado al voluntario.';
      else if (sourceAssignment.checkedOut) message = 'El turno original ya fue completado.';
      else if (sameSlot) message = 'El turno solicitado es igual al turno original.';
      else message = 'La solicitud no puede aprobarse con su estado actual.';
    } else if (sourceWouldBeUnderstaffed) {
      recommendation = 'warning';
      message = targetAssignment
        ? `Actualmente aparece en ambos turnos. Aprobar conservará ${request.requested_shift_key} (${request.requested_day_key}) y retirará ${request.current_shift_key} (${request.current_day_key}); el turno de origen quedará por debajo de la cobertura requerida.`
        : 'El destino tiene espacio, pero aprobar dejaría el turno original por debajo de la cobertura requerida.';
    }

    return {
      success: true,
      impact: {
        requestId: request.id,
        volunteerName: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim() || 'Voluntario',
        committeeName,
        status: request.status,
        canApprove,
        targetFull,
        sourceWouldBeUnderstaffed,
        recommendation,
        message,
        days,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo consultar la cobertura.' };
  }
}

export async function approveShiftChangeRequestAction(requestId: string) {
  try {
    const supabase = getAdminClient();

    // 1. Fetch request details
    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone, committee_id, committees(name))')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }
    if (!isShiftAvailableForDay(request.requested_day_key, request.requested_shift_key)) {
      return { success: false, error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).' };
    }
    if (request.status !== 'pending') {
      return { success: false, error: 'Esta solicitud ya fue procesada.' };
    }
    const reviewer = await requireVolunteerCapability('reschedule_volunteer', request.volunteer_id);
    const reviewerId = reviewer.userId;
    const reviewerName = reviewer.name;
    const reviewerRole = reviewer.role;

    const vol = request.volunteers;
    if (!vol) {
      return { success: false, error: "Voluntario desvinculado" };
    }

    // 2. Fetch and remove old shift
    const { data: oldShift } = await supabase
      .from('shifts')
      .select('id, volunteer_id, day_key, shift_key, checked_out, checked_out_at')
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.current_day_key)
      .eq('shift_key', request.current_shift_key)
      .maybeSingle();

    if (!oldShift) {
      return { success: false, error: 'El turno original ya no está asignado al voluntario.' };
    }
    if (oldShift.checked_out || oldShift.checked_out_at) {
      return { success: false, error: 'No se puede cambiar un turno que ya fue completado.' };
    }
    if (request.current_day_key === request.requested_day_key && request.current_shift_key === request.requested_shift_key) {
      return { success: false, error: 'El turno solicitado es igual al turno actual.' };
    }

    const { data: existingTarget } = await supabase
      .from('shifts')
      .select('id')
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.requested_day_key)
      .eq('shift_key', request.requested_shift_key)
      .maybeSingle();

    // A pre-existing target does not consume a new place. This can legitimately
    // happen when the schedule changes after the volunteer submitted the request.
    if (vol.committee_id && !existingTarget) {
      const coverage = await getCommitteeCoverageSnapshot(
        supabase,
        vol.committee_id,
        [request.requested_day_key]
      );
      const targetSlot = coverage.slots.find(slot =>
        slot.dayKey === request.requested_day_key && slot.shiftKey === request.requested_shift_key
      );
      if (isCoverageComplete(targetSlot)) {
        return {
          success: false,
          error: `El turno ${request.requested_shift_key} del ${request.requested_day_key} ya tiene la cobertura completa para ${vol.committees?.name || 'este comité'}.`,
        };
      }
    }

    await supabase
      .from('shifts')
      .delete()
      .eq('volunteer_id', request.volunteer_id)
      .eq('day_key', request.current_day_key)
      .eq('shift_key', request.current_shift_key);

    if (oldShift) {
      broadcastShiftSync({
        eventType: 'DELETE',
        table: 'shifts',
        record: oldShift,
      });
    }

    // 3. Insert the target only when it is not already present. In the stale
    // request case, keeping the existing target and removing the source is the
    // complete requested move.
    if (!existingTarget) {
      const { data: newShift, error: insErr } = await supabase
        .from('shifts')
        .upsert({
          volunteer_id: request.volunteer_id,
          day_key: request.requested_day_key,
          shift_key: request.requested_shift_key
        }, { onConflict: 'volunteer_id,day_key,shift_key' })
        .select('*')
        .single();

      if (insErr) {
        console.error("Error updating shift for approval:", insErr);
        return { success: false, error: insErr.message };
      }

      if (newShift) {
        broadcastShiftSync({
          eventType: 'INSERT',
          table: 'shifts',
          record: newShift,
        });
      }
    }

    // 4. Update request status with reviewer UUID
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId);

    // 5. Create activity log entry for system history
    const volunteerFullName = `${vol.first_name || ''} ${vol.last_name || ''}`.trim();
    await createActivityLog({
      userName: reviewerName,
      userRole: reviewerRole,
      actionType: 'Reasignación',
      description: `Aprobó solicitud de cambio de turno de ${volunteerFullName}`,
      details: `De ${request.current_shift_key} (${request.current_day_key}) a ${request.requested_shift_key} (${request.requested_day_key})`,
      targetId: requestId
    });

    // 6. Send notification to volunteer via WhatsApp
    const volunteerName = (vol.first_name || 'Voluntario').split(' ')[0];
    const formattedPhone = formatE164(vol.phone);

    if (formattedPhone) {
      await sendShiftChangeResultTemplate({
        to: formattedPhone,
        volunteerName,
        resultStatus: 'APROBADA',
        shiftDetails: `${request.requested_shift_key} del ${request.requested_day_key}`,
        reasonOrDetail: 'tu nuevo turno ha sido actualizado en el sistema'
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in approveShiftChangeRequestAction:", err);
    return { success: false, error: err.message };
  }
}

export async function rejectShiftChangeRequestAction(requestId: string, reason?: string) {
  try {
    const supabase = getAdminClient();

    const { data: request, error: reqErr } = await supabase
      .from('shift_change_requests')
      .select('*, volunteers(id, first_name, last_name, phone)')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) {
      return { success: false, error: "Solicitud no encontrada" };
    }
    const reviewer = await requireVolunteerCapability('reschedule_volunteer', request.volunteer_id);
    const reviewerId = reviewer.userId;
    const reviewerName = reviewer.name;
    const reviewerRole = reviewer.role;

    const rejectionDetail = reason || 'limitación de disponibilidad de cupos en el turno solicitado';

    // Update request status with reviewer UUID
    await supabase
      .from('shift_change_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectionDetail,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId);

    // Create activity log entry for system history
    const vol = request.volunteers;
    const volunteerFullName = `${vol?.first_name || ''} ${vol?.last_name || ''}`.trim() || 'Voluntario';
    await createActivityLog({
      userName: reviewerName,
      userRole: reviewerRole,
      actionType: 'Reasignación',
      description: `Rechazó solicitud de cambio de turno de ${volunteerFullName}`,
      details: `Motivo del rechazo: ${rejectionDetail}`,
      targetId: requestId
    });

    // Send notification to volunteer via WhatsApp
    if (vol && vol.phone) {
      const volunteerName = (vol.first_name || 'Voluntario').split(' ')[0];
      const formattedPhone = formatE164(vol.phone);

      if (formattedPhone) {
        await sendShiftChangeResultTemplate({
          to: formattedPhone,
          volunteerName,
          resultStatus: 'RECHAZADA',
          shiftDetails: `${request.requested_shift_key} del ${request.requested_day_key}`,
          reasonOrDetail: rejectionDetail
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in rejectShiftChangeRequestAction:", err);
    return { success: false, error: err.message };
  }
}

export async function createShiftChangeRequestAction(params: {
  volunteerId: string;
  currentDayKey: string;
  currentShiftKey: string;
  requestedDayKey: string;
  requestedShiftKey: string;
  reason?: string;
}) {
  try {
    await requireVolunteerSelfOrCapability('reschedule_volunteer', params.volunteerId);
    const supabase = getAdminClient();
    const result = await createValidatedShiftChangeRequest(supabase, params);
    if (!result.success) return result;

    const volunteerName = `${result.volunteer.first_name || ''} ${result.volunteer.last_name || ''}`.trim() || 'Voluntario';
    const auditCreated = await createActivityLog({
      userName: volunteerName,
      userRole: 'Voluntario',
      actionType: 'Solicitud',
      description: 'Envió desde el portal una solicitud de cambio de turno',
      details: JSON.stringify({
        context: {
          source: 'Portal',
          channel: 'Portal',
          requestId: result.request.id,
          summary: `${params.currentDayKey} · ${params.currentShiftKey} → ${params.requestedDayKey} · ${params.requestedShiftKey}`,
          currentDayKey: params.currentDayKey,
          currentShiftKey: params.currentShiftKey,
          requestedDayKey: params.requestedDayKey,
          requestedShiftKey: params.requestedShiftKey,
          reason: params.reason?.trim() || '',
        },
      }),
      targetId: params.volunteerId,
    });
    if (!auditCreated) {
      console.warn('[SHIFT CHANGE] Request created but portal audit logging failed:', result.request.id);
    }

    return { success: true, request: result.request };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchVolunteerShiftChangeRequestsAction(volunteerId: string) {
  try {
    await requireVolunteerSelfOrCapability('view_volunteer_profile', volunteerId);
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('shift_change_requests')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, requests: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface VolunteerRescheduleContext {
  committeeName: string;
  requirementsByCommittee: Record<string, Record<string, number>>;
  assignmentCountsByShift: Record<string, Record<string, Record<string, number>>>;
  ownShifts: {
    day_key: string;
    shift_key: string;
    checked_in: boolean;
    checked_out: boolean;
  }[];
}

export async function fetchVolunteerRescheduleContextAction(
  volunteerId: string
): Promise<{ success: boolean } & VolunteerRescheduleContext> {
  try {
    await requireVolunteerSelfOrCapability('reschedule_volunteer', volunteerId);
    const supabase = getAdminClient();

    const [volRes, committeesRes, reqsRes, shiftsRes, volunteersRes] = await Promise.all([
      supabase
        .from('volunteers')
        .select('id, first_name, last_name, committee_id')
        .eq('id', volunteerId)
        .maybeSingle(),
      supabase
        .from('committees')
        .select('id, name')
        .or('status.is.null,status.neq.archived'),
      supabase
        .from('committee_shift_requirements')
        .select('committee_id, shift_key, required'),
      supabase
        .from('shifts')
        .select(
          'volunteer_id, day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at'
        ),
      supabase.from('volunteers').select('id, committee_id'),
    ]);

    const committeeMap: Record<string, string> = {};
    (committeesRes.data || []).forEach((c: any) => {
      committeeMap[c.id] = c.name;
    });

    const requirementsByCommittee: Record<string, Record<string, number>> = {};
    (reqsRes.data || []).forEach((r: any) => {
      const commName = committeeMap[r.committee_id];
      if (!commName) return;
      if (!requirementsByCommittee[commName]) requirementsByCommittee[commName] = {};
      requirementsByCommittee[commName][r.shift_key] = r.required;
    });

    const volCommitteeMap: Record<string, string> = {};
    (volunteersRes.data || []).forEach((v: any) => {
      volCommitteeMap[v.id] = committeeMap[v.committee_id] || 'Sin comité';
    });

    const assignmentCountsByShift: Record<
      string,
      Record<string, Record<string, number>>
    > = {};
    const ownShifts: VolunteerRescheduleContext['ownShifts'] = [];

    (shiftsRes.data || []).forEach((s: any) => {
      const commName = volCommitteeMap[s.volunteer_id] || 'Sin comité';
      if (!assignmentCountsByShift[s.day_key]) assignmentCountsByShift[s.day_key] = {};
      if (!assignmentCountsByShift[s.day_key][s.shift_key]) assignmentCountsByShift[s.day_key][s.shift_key] = {};
      assignmentCountsByShift[s.day_key][s.shift_key][commName] =
        (assignmentCountsByShift[s.day_key][s.shift_key][commName] || 0) + 1;

      if (s.volunteer_id === volunteerId) {
        ownShifts.push({
          day_key: s.day_key,
          shift_key: s.shift_key,
          checked_in: !!(s.checked_in || s.checked_in_at),
          checked_out: !!(s.checked_out || s.checked_out_at),
        });
      }
    });

    const committeeName = committeeMap[volRes.data?.committee_id] || 'Sin comité';

    return {
      success: true,
      committeeName,
      requirementsByCommittee,
      assignmentCountsByShift,
      ownShifts,
    };
  } catch (err: any) {
    console.error('Error in fetchVolunteerRescheduleContextAction:', err);
    return {
      success: false,
      committeeName: '',
      requirementsByCommittee: {},
      assignmentCountsByShift: {},
      ownShifts: [],
    };
  }
}
