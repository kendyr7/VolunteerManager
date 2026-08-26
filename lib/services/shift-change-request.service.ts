import { isShiftAvailableForDay } from '@/lib/dates';
import { isShiftChangeReason } from '@/lib/shift-change-reasons';
import { getCommitteeCoverageSnapshot, isCoverageComplete } from '@/lib/shift-coverage';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseClientLike = SupabaseClient;

type CommitteeRelation = { name?: string | null } | Array<{ name?: string | null }> | null;

type VolunteerRequestOwner = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  committee_id?: string | null;
  committees?: CommitteeRelation;
};

type ShiftChangeRequestRow = {
  id: string;
  volunteer_id: string;
  current_day_key: string;
  current_shift_key: string;
  requested_day_key: string;
  requested_shift_key: string;
  reason?: string | null;
  status: string;
  created_at?: string;
};

export type ShiftChangeRequestInput = {
  volunteerId: string;
  currentDayKey: string;
  currentShiftKey: string;
  requestedDayKey: string;
  requestedShiftKey: string;
  reason?: string;
};

export type ShiftChangeRequestErrorCode =
  | 'INVALID_SHIFT'
  | 'INVALID_REASON'
  | 'VOLUNTEER_NOT_FOUND'
  | 'SAME_SHIFT'
  | 'SOURCE_NOT_ASSIGNED'
  | 'TARGET_ALREADY_ASSIGNED'
  | 'PENDING_EXISTS'
  | 'COVERAGE_FULL'
  | 'DATABASE_ERROR';

type CreateShiftChangeRequestResult =
  | {
      success: true;
      request: ShiftChangeRequestRow;
      volunteer: VolunteerRequestOwner;
    }
  | {
      success: false;
      code: ShiftChangeRequestErrorCode;
      error: string;
      coverage?: { count: number; required: number };
    };

export type PendingShiftChangeTargetConflict = {
  id: string;
  currentDayKey: string;
  currentShiftKey: string;
  requestedDayKey: string;
  requestedShiftKey: string;
};

function relationName(relation: CommitteeRelation | undefined): string | null {
  if (Array.isArray(relation)) return relation[0]?.name || null;
  return relation?.name || null;
}

/**
 * Final server-side gate for shift-change requests.
 *
 * Both the volunteer portal and WhatsApp call this method immediately before
 * inserting. Interactive selections are intentionally revalidated here because
 * the schedule can change while the volunteer is completing the flow.
 */
export async function createValidatedShiftChangeRequest(
  supabase: SupabaseClientLike,
  params: ShiftChangeRequestInput
): Promise<CreateShiftChangeRequestResult> {
  if (!isShiftAvailableForDay(params.requestedDayKey, params.requestedShiftKey)) {
    return {
      success: false,
      code: 'INVALID_SHIFT',
      error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).',
    };
  }

  const normalizedReason = params.reason?.trim() || '';
  if (!isShiftChangeReason(normalizedReason)) {
    return {
      success: false,
      code: 'INVALID_REASON',
      error: 'Selecciona uno de los motivos disponibles para solicitar el cambio de turno.',
    };
  }

  if (
    params.currentDayKey === params.requestedDayKey
    && params.currentShiftKey === params.requestedShiftKey
  ) {
    return {
      success: false,
      code: 'SAME_SHIFT',
      error: 'El turno solicitado es igual al turno actual.',
    };
  }

  const [volunteerResult, sourceResult, targetResult, pendingResult] = await Promise.all([
    supabase
      .from('volunteers')
      .select('id, first_name, last_name, committee_id, committees(name)')
      .eq('id', params.volunteerId)
      .maybeSingle(),
    supabase
      .from('shifts')
      .select('id, checked_out, checked_out_at')
      .eq('volunteer_id', params.volunteerId)
      .eq('day_key', params.currentDayKey)
      .eq('shift_key', params.currentShiftKey)
      .maybeSingle(),
    supabase
      .from('shifts')
      .select('id')
      .eq('volunteer_id', params.volunteerId)
      .eq('day_key', params.requestedDayKey)
      .eq('shift_key', params.requestedShiftKey)
      .maybeSingle(),
    supabase
      .from('shift_change_requests')
      .select('id')
      .eq('volunteer_id', params.volunteerId)
      .eq('current_day_key', params.currentDayKey)
      .eq('current_shift_key', params.currentShiftKey)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ]);

  const lookupError = volunteerResult.error
    || sourceResult.error
    || targetResult.error
    || pendingResult.error;
  if (lookupError) {
    console.error('[SHIFT CHANGE] Validation query failed:', lookupError);
    return {
      success: false,
      code: 'DATABASE_ERROR',
      error: 'No se pudo validar el horario actual. Intenta nuevamente.',
    };
  }

  const volunteer = volunteerResult.data as VolunteerRequestOwner | null;
  if (!volunteer) {
    return {
      success: false,
      code: 'VOLUNTEER_NOT_FOUND',
      error: 'No se encontró el perfil del voluntario.',
    };
  }
  if (!sourceResult.data || sourceResult.data.checked_out || sourceResult.data.checked_out_at) {
    return {
      success: false,
      code: 'SOURCE_NOT_ASSIGNED',
      error: 'El turno original ya no está disponible para solicitar un cambio.',
    };
  }
  if (targetResult.data) {
    return {
      success: false,
      code: 'TARGET_ALREADY_ASSIGNED',
      error: 'Ya tienes asignado el turno solicitado. Selecciona otra fecha u horario.',
    };
  }
  if (pendingResult.data) {
    return {
      success: false,
      code: 'PENDING_EXISTS',
      error: `Ya tienes una solicitud pendiente para cambiar tu turno del ${params.currentDayKey} (${params.currentShiftKey}).`,
    };
  }

  if (volunteer.committee_id) {
    const coverage = await getCommitteeCoverageSnapshot(
      supabase,
      volunteer.committee_id,
      [params.requestedDayKey]
    );
    const targetSlot = coverage.slots.find(slot =>
      slot.dayKey === params.requestedDayKey && slot.shiftKey === params.requestedShiftKey
    );
    if (isCoverageComplete(targetSlot)) {
      return {
        success: false,
        code: 'COVERAGE_FULL',
        error: `El turno ${params.requestedShiftKey} del ${params.requestedDayKey} ya tiene la cobertura completa para ${relationName(volunteer.committees) || 'tu comité'}. Selecciona otra fecha u horario.`,
        coverage: targetSlot
          ? { count: targetSlot.count, required: targetSlot.required }
          : undefined,
      };
    }
  }

  // Repeat the target lookup as close as possible to the insert. This catches a
  // schedule edit made while the coverage query was running.
  const { data: latestTarget, error: latestTargetError } = await supabase
    .from('shifts')
    .select('id')
    .eq('volunteer_id', params.volunteerId)
    .eq('day_key', params.requestedDayKey)
    .eq('shift_key', params.requestedShiftKey)
    .maybeSingle();
  if (latestTargetError) {
    console.error('[SHIFT CHANGE] Final target validation failed:', latestTargetError);
    return {
      success: false,
      code: 'DATABASE_ERROR',
      error: 'No se pudo confirmar el turno solicitado. Intenta nuevamente.',
    };
  }
  if (latestTarget) {
    return {
      success: false,
      code: 'TARGET_ALREADY_ASSIGNED',
      error: 'Ya tienes asignado el turno solicitado. Selecciona otra fecha u horario.',
    };
  }

  const { data: request, error } = await supabase
    .from('shift_change_requests')
    .insert({
      volunteer_id: params.volunteerId,
      current_day_key: params.currentDayKey,
      current_shift_key: params.currentShiftKey,
      requested_day_key: params.requestedDayKey,
      requested_shift_key: params.requestedShiftKey,
      reason: normalizedReason,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[SHIFT CHANGE] Insert failed:', error);
    return {
      success: false,
      code: 'DATABASE_ERROR',
      error: 'No se pudo crear la solicitud. Intenta nuevamente.',
    };
  }

  return { success: true, request: request as ShiftChangeRequestRow, volunteer };
}

/**
 * Prevents an administrative schedule edit from bypassing an already pending
 * request. The request must be reviewed first so its source is removed and its
 * status/audit trail remain consistent.
 */
export async function findPendingShiftChangeTargetConflict(
  supabase: SupabaseClientLike,
  volunteerId: string,
  candidateAssignments: Array<{ dayKey: string; shiftKey: string }>
): Promise<PendingShiftChangeTargetConflict | null> {
  if (candidateAssignments.length === 0) return null;

  const candidateKeys = new Set(
    candidateAssignments.map(({ dayKey, shiftKey }) => `${dayKey}\u0000${shiftKey}`)
  );
  const { data, error } = await supabase
    .from('shift_change_requests')
    .select('id, current_day_key, current_shift_key, requested_day_key, requested_shift_key')
    .eq('volunteer_id', volunteerId)
    .eq('status', 'pending');

  if (error) throw error;
  const requests = (data || []) as Array<{
    id: string;
    current_day_key: string;
    current_shift_key: string;
    requested_day_key: string;
    requested_shift_key: string;
  }>;
  const conflict = requests.find(request =>
    candidateKeys.has(`${request.requested_day_key}\u0000${request.requested_shift_key}`)
  );
  if (!conflict) return null;

  return {
    id: conflict.id,
    currentDayKey: conflict.current_day_key,
    currentShiftKey: conflict.current_shift_key,
    requestedDayKey: conflict.requested_day_key,
    requestedShiftKey: conflict.requested_shift_key,
  };
}

export function pendingShiftConflictMessage(conflict: PendingShiftChangeTargetConflict): string {
  return `Existe una solicitud pendiente para mover ${conflict.currentShiftKey} (${conflict.currentDayKey}) a ${conflict.requestedShiftKey} (${conflict.requestedDayKey}). Revísala en Solicitudes antes de asignar ese turno directamente.`;
}
