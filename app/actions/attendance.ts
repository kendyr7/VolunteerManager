'use server'

import { createActivityLog } from "./activity-actions";
import { getAdminClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { revalidatePath } from "next/cache";
import { broadcastShiftSync, broadcastSessionSync } from "@/lib/services/shift-broadcast.service";
import { requireCapability, requireVolunteerCapability, requireVolunteerSelfOrCapability } from "@/lib/authorization";
import { hasCapability, roleDisplayName } from "@/lib/role-permissions";
import { EARLY_CHECK_IN_MINUTES, getOfficialShiftTime, isShiftAvailableForDay, isSimulationEventDay, parseGuatemalaShiftEnd, parseDayKeyToDateStr } from "@/lib/dates";
import { getVolunteerReliabilityMetrics, computeBulkReliabilityMap } from "@/lib/services/volunteer-reliability.service";
import { buildEventDayKeys } from '@/lib/coordinator-data';
import { AttendanceKind, AttendanceSession, getGuatemalaHourFloat, getContinuousScheduledBlockForSession, requiresSessionExitResolution, inferShiftsForSession, validateSessionConstraints, getSessionShiftCompletedAt, needsShortCheckoutConfirmation, detectShiftAmbiguity, isPrematureCheckout } from "@/lib/session-utils";
import {
  saveAttendanceSession,
  getOpenSessionForVolunteer,
  fetchAllAttendanceSessionsFromDb,
  completeOpenAttendanceSessionInDb,
  checkSessionOverlapInDb,
  closeAttendanceSessionWithDecisionInDb,
  openAttendanceSessionWithDecisionInDb,
  resolveStaleAndOpenAttendanceInDb,
  isTestMode,
} from "@/lib/services/session-store";
import { createEntryPassPayload, validateEntryPassQrValue } from "@/lib/entry-pass";
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';
import { getGuatemalaDate, getGuatemalaDayKey } from '@/lib/scan-history';
import { calculateAffectedShiftUpdates, getSessionsOverlappingCorrection, validateCorrectedSession } from '@/lib/session-correction';
import type { CorrectedShift } from '@/lib/session-correction';

export async function getAttendanceSessionsAction(requestedDayKeys?: string[]): Promise<AttendanceSession[]> {
  const authorization = await requireCapability('view_volunteers');
  const allowedDayKeys = new Set(buildEventDayKeys());
  const dayKeys = Array.isArray(requestedDayKeys)
    ? [...new Set(requestedDayKeys.filter(key => typeof key === 'string' && allowedDayKeys.has(key)))]
    : undefined;
  if (Array.isArray(requestedDayKeys) && dayKeys?.length === 0) return [];
  const canViewAllVolunteers = hasCapability(authorization, 'view_all_volunteers');
  const sessions = await fetchAllAttendanceSessionsFromDb(
    dayKeys,
    canViewAllVolunteers ? undefined : authorization.committeeId
  );
  if (canViewAllVolunteers) return sessions;
  if (!authorization.committeeId) return [];
  return sessions;
}

export type AttendanceReviewResolution = {
  session_id: string;
  resolved_session_id: string | null;
  volunteer_id: string;
  day_key: string;
  hide_alert: boolean;
};

export async function getAttendanceReviewResolutionsAction(
  requestedDayKeys?: string[]
): Promise<AttendanceReviewResolution[]> {
  const authorization = await requireCapability('view_volunteers');
  const allowedDayKeys = new Set(buildEventDayKeys());
  const dayKeys = Array.isArray(requestedDayKeys)
    ? [...new Set(requestedDayKeys.filter(key => typeof key === 'string' && allowedDayKeys.has(key)))]
    : undefined;
  if (Array.isArray(requestedDayKeys) && dayKeys?.length === 0) return [];

  const canViewAllVolunteers = hasCapability(authorization, 'view_all_volunteers');
  let query = getAdminClient()
    .from('attendance_review_resolutions')
    .select('session_id, resolved_session_id, volunteer_id, day_key, hide_alert, volunteers!inner(committee_id)')
    .eq('hide_alert', true)
    .order('session_id');
  if (dayKeys) query = query.in('day_key', dayKeys);
  if (!canViewAllVolunteers) {
    if (!authorization.committeeId) return [];
    query = query.eq('volunteers.committee_id', authorization.committeeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const resolutions = (data || []) as Array<AttendanceReviewResolution & { volunteers?: unknown }>;
  return resolutions.map(resolution => ({
    session_id: resolution.session_id,
    resolved_session_id: resolution.resolved_session_id,
    volunteer_id: resolution.volunteer_id,
    day_key: resolution.day_key,
    hide_alert: resolution.hide_alert,
  }));
}

// 1. Generate the volunteer's permanent pass token
export async function generateEntryPassToken(volunteerId: string) {
  await requireVolunteerSelfOrCapability('scan_qr_attendance', volunteerId);

  const payload = createEntryPassPayload(volunteerId);

  return {
    version: payload.v,
    volunteerId: payload.id,
    signature: payload.sig,
  };
}

// 2. Recalculate Reliability Score for a single volunteer
export async function recalculateReliability(volunteerId: string) {
  if (!volunteerId) {
    return { success: false as const, error: 'volunteerId requerido.' };
  }
  await requireVolunteerSelfOrCapability('reschedule_volunteer', volunteerId);
  const supabase = getAdminClient();

  try {
    const [shiftsRes, sessionsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, volunteer_id, day_key, shift_key, checked_in, checked_out, checked_in_at, checked_out_at')
        .eq('volunteer_id', volunteerId)
        .throwOnError(),
      supabase
        .from('attendance_sessions')
        .select('id, volunteer_id, day_key, started_at, ended_at, status')
        .eq('volunteer_id', volunteerId)
        .throwOnError(),
    ]);

    const metrics = getVolunteerReliabilityMetrics(
      volunteerId,
      shiftsRes.data || [],
      sessionsRes.data || []
    );

    const { error } = await supabase
      .from('volunteers')
      .update({ reliability_score: metrics.reliabilityScore })
      .eq('id', volunteerId);
    if (error) throw error;

    return { success: true as const, metrics };
  } catch (err) {
    console.error('[RELIABILITY] No se pudo recalcular la confiabilidad:', err);
    return { success: false as const, error: 'No se pudo recalcular la confiabilidad.' };
  }
}

// 3. Recalculate and synchronize reliability for all volunteers
export async function recalculateAllVolunteersReliabilityAction() {
  await requireCapability('view_all_volunteers');
  const supabase = getAdminClient();

  const [vols, shifts, sessions] = await Promise.all([
    fetchAllRowsStrict<{ id: string }>(supabase, 'volunteers', 'id'),
    fetchAllRowsStrict(supabase, 'shifts', 'id, volunteer_id, day_key, shift_key, checked_in, checked_out, checked_in_at, checked_out_at'),
    fetchAllRowsStrict(supabase, 'attendance_sessions', 'id, volunteer_id, day_key, started_at, ended_at, status'),
  ]);

  const map = computeBulkReliabilityMap(vols, shifts, sessions);
  if (vols.length === 0) {
    return { success: true as const, count: 0, reliabilityMap: map };
  }

  const updateResults = await Promise.all(vols.map(volunteer => (
    supabase
      .from('volunteers')
      .update({ reliability_score: map[volunteer.id] })
      .eq('id', volunteer.id)
  )));
  const failedUpdates = updateResults.filter(result => result.error);
  if (failedUpdates.length > 0) {
    console.error(
      '[RELIABILITY_BULK] No se pudieron guardar todos los puntajes:',
      failedUpdates.map(result => result.error)
    );
    return {
      success: false as const,
      count: vols.length - failedUpdates.length,
      error: `No se pudieron guardar ${failedUpdates.length} puntajes de confiabilidad.`,
    };
  }

  return { success: true as const, count: vols.length, reliabilityMap: map };
}

// ----------------------------------------------------------------------
// ATTENDANCE SESSIONS DOMAIN ACTIONS (SINGLE SOURCE OF TRUTH)
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// ATTENDANCE SESSIONS DOMAIN ACTIONS (SINGLE SOURCE OF TRUTH)
// ----------------------------------------------------------------------

// 1. Open Attendance Session Action
export async function openAttendanceSessionAction(
  volunteerId: string,
  _dayKeyInput?: string,
  _isInternalCall = false,
  decision?: {
    intendedShiftKeys?: string[];
    attendanceKind?: AttendanceKind;
    reasonCode?: string;
    explanation?: string;
    idempotencyKey?: string;
  },
) {
  const authorizedActor = await requireVolunteerCapability('scan_qr_attendance', volunteerId);
  // Server-generated Guatemala time & day_key (never trust client timestamp/dayKey for check-in)
  const guatemalaString = new Date().toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaNow = new Date(guatemalaString);
  const serverDayKey = format(guatemalaNow, "EEE d", { locale: es }).toLowerCase();
  const dayKey = serverDayKey;

  // Check if open session already exists (Caso 4: Doble check-in)
  const existingOpen = await getOpenSessionForVolunteer(volunteerId);
  if (existingOpen) {
    return {
      success: true,
      session: existingOpen,
      alreadyOpen: true,
      message: "El voluntario ya posee una sesión activa."
    };
  }

  // Server-generated timestamp (Never trust client timestamp)
  const nowIso = new Date().toISOString();
  const sessionRecord: AttendanceSession = {
    id: crypto.randomUUID(),
    volunteer_id: volunteerId,
    day_key: dayKey,
    started_at: nowIso,
    ended_at: null,
    status: 'open',
    auto_closed: false,
    created_at: nowIso,
    updated_at: nowIso,
  };

  let assignedShiftKeys: string[];
  if (isTestMode()) {
    assignedShiftKeys = decision?.intendedShiftKeys?.length ? decision.intendedShiftKeys : ['T1'];
  } else {
    const { data: assignedRows, error: assignedError } = await getAdminClient()
      .from('shifts')
      .select('shift_key')
      .eq('volunteer_id', volunteerId)
      .eq('day_key', dayKey);
    if (assignedError) throw new Error('No se pudieron consultar los turnos asignados para registrar la entrada.');
    assignedShiftKeys = [...new Set<string>((assignedRows || []).map((row: { shift_key: string }) => row.shift_key))]
      .filter(key => ['T1', 'T2', 'T3', 'T4'].includes(key));
  }
  const intendedShiftKeys = [...new Set(decision?.intendedShiftKeys?.length
    ? decision.intendedShiftKeys
    : assignedShiftKeys)];
  if (intendedShiftKeys.length === 0 || intendedShiftKeys.some(key => !['T1', 'T2', 'T3', 'T4'].includes(key))) {
    throw new Error('Selecciona el turno que se registrará antes de abrir la asistencia.');
  }
  const attendanceKind = decision?.attendanceKind || (intendedShiftKeys.length > 1 ? 'full_block' : 'scheduled');
  if (attendanceKind !== 'additional' && intendedShiftKeys.some(key => !assignedShiftKeys.includes(key))) {
    throw new Error('La selección incluye un turno que no está asignado al voluntario.');
  }

  const decisionResult = await openAttendanceSessionWithDecisionInDb({
    sessionId: sessionRecord.id,
    volunteerId,
    dayKey,
    startedAt: nowIso,
    intendedShiftKeys,
    attendanceKind,
    reasonCode: decision?.reasonCode || 'scanner_confirmed',
    explanation: decision?.explanation,
    actor: {
      id: authorizedActor.userId,
      name: authorizedActor.name || 'Coordinador',
      role: roleDisplayName(authorizedActor),
    },
    idempotencyKey: decision?.idempotencyKey || `checkin:${volunteerId}:${Math.floor(Date.now() / 5000)}`,
  });
  let saved: AttendanceSession;
  if (decisionResult.success && decisionResult.session) {
    saved = decisionResult.session;
    if (decisionResult.alreadyOpen) {
      return {
        success: true,
        session: saved,
        alreadyOpen: true,
        message: 'El voluntario ya posee una sesión activa.',
      };
    }
  } else {
    throw new Error(decisionResult.infrastructureMissing
      ? 'La infraestructura de decisiones de asistencia aún no está disponible. No se registró ninguna entrada parcial.'
      : decisionResult.error || 'No se pudo registrar la decisión de asistencia.');
  }

  // Broadcast realtime event
  await broadcastSessionSync({
    eventType: 'INSERT',
    table: 'attendance_sessions',
    record: saved,
  });

  try {
    revalidatePath('/shifts');
    revalidatePath('/volunteers');
    revalidatePath('/check-in');
    revalidatePath('/dashboard');
  } catch {}

  return {
    success: true,
    action: 'opened',
    session: saved
  };
}

async function getSessionAssignedShiftKeys(session: AttendanceSession): Promise<string[]> {
  const { data, error } = await getAdminClient().from('shifts').select('shift_key')
    .eq('volunteer_id', session.volunteer_id).eq('day_key', session.day_key);
  if (error) throw new Error('No se pudieron consultar los turnos de la sesión pendiente.');
  return (data || []).map((shift: { shift_key: string }) => shift.shift_key);
}

// 2. Close Attendance Session Action (Server timestamp, Idempotent)
export async function closeAttendanceSessionAction({
  sessionId,
  volunteerId,
  confirmShortVisit,
  actorNameInput,
  actorRoleInput
}: {
  sessionId?: string;
  volunteerId?: string;
  confirmShortVisit?: boolean;
  endedAt?: string; // Ignored for normal checkout to enforce server timestamp!
  actorNameInput?: string;
  actorRoleInput?: string;
}) {
  await requireCapability('scan_qr_attendance');
  let sessionToClose: AttendanceSession | null = null;

  if (sessionId) {
    const all = await fetchAllAttendanceSessionsFromDb();
    sessionToClose = all.find(s => s.id === sessionId) || null;
  }

  if (!sessionToClose && volunteerId) {
    sessionToClose = await getOpenSessionForVolunteer(volunteerId);
  }

  if (!sessionToClose) {
    return { success: false, error: "No se encontró una sesión activa para cerrar." };
  }
  const authorizedActor = await requireVolunteerCapability('scan_qr_attendance', sessionToClose.volunteer_id);

  // Idempotencia: Si ya estaba completada (Caso 6: Doble check-out), NO sobrescribir ended_at
  if (sessionToClose.status === 'completed') {
    return {
      success: true,
      alreadyClosed: true,
      session: sessionToClose,
      message: "La sesión ya estaba finalizada."
    };
  }

  const assignedShiftKeys = await getSessionAssignedShiftKeys(sessionToClose);
  if (requiresSessionExitResolution(sessionToClose.day_key, sessionToClose.started_at, assignedShiftKeys)) {
    return {
      success: false,
      requiresResolution: true,
      session: sessionToClose,
      assignedShiftKeys,
      error: 'Hay una salida olvidada de un bloque anterior. Escanea el QR y solicita a un administrador resolver la hora de salida antes de iniciar otro turno.',
    };
  }

  // Derive actor identity from server cookie session if available
  let actorName = actorNameInput || 'Coordinador';
  let actorRole = actorRoleInput || 'Coordinador';
  try {
    const { getCurrentUserSession } = await import('@/lib/auth-helpers');
    const actor = await getCurrentUserSession();
    if (actor.userId) actorName = actor.userName || actorName;
    if (actor.userRole) actorRole = actor.userRole;
  } catch (e) {}

  // ENFORCE SERVER TIMESTAMP FOR NORMAL CHECKOUT (Rejects client-supplied endedAt)
  const newEndedAt = new Date().toISOString();
  if (needsShortCheckoutConfirmation(sessionToClose.started_at, newEndedAt) && !confirmShortVisit) {
    return {
      success: false,
      requiresShortVisitConfirmation: true,
      error: 'Esta asistencia lleva menos de una hora. Verifica que no sea un doble escaneo y confirma la salida de forma explícita.',
    };
  }

  const inferredShiftKeys = inferShiftsForSession(
    sessionToClose.day_key,
    sessionToClose.started_at,
    newEndedAt,
    ['T1', 'T2', 'T3', 'T4'],
  ).map(shift => shift.shiftKey);
  const intendedShiftKeys = sessionToClose.intended_shift_keys?.length
    ? sessionToClose.intended_shift_keys
    : assignedShiftKeys.length ? assignedShiftKeys : inferredShiftKeys.length ? inferredShiftKeys : ['T1'];
  const isShortVisit = needsShortCheckoutConfirmation(sessionToClose.started_at, newEndedAt);
  const decisionRes = await closeAttendanceSessionWithDecisionInDb({
    session: sessionToClose,
    endedAt: newEndedAt,
    intendedShiftKeys,
    exitDecision: isShortVisit ? 'confirmed_short' : 'normal',
    reasonCode: isShortVisit ? 'short_visit_confirmed_by_coordinator' : 'scanner_checkout',
    explanation: isShortVisit ? 'El coordinador confirmó que la salida breve es correcta.' : '',
    actor: {
      id: authorizedActor.userId,
      name: actorName,
      role: actorRole,
    },
  });
  if (!decisionRes.success) {
    return {
      success: false,
      error: decisionRes.infrastructureMissing
        ? 'La infraestructura de decisiones de asistencia aún no está disponible. No se registró ninguna salida parcial.'
        : decisionRes.error || 'No se pudo guardar la salida. Intenta de nuevo.',
    };
  }
  if (decisionRes.alreadyClosed) {
    return {
      success: true,
      alreadyClosed: true,
      session: decisionRes.session || sessionToClose,
      message: "La sesión ya fue finalizada previamente."
    };
  }

  const saved = decisionRes.session!;

  // Broadcast realtime event
  await broadcastSessionSync({
    eventType: 'UPDATE',
    table: 'attendance_sessions',
    record: saved,
  });

  try {
    revalidatePath('/shifts');
    revalidatePath('/volunteers');
    revalidatePath('/check-in');
    revalidatePath('/dashboard');
  } catch (e) {}

  return {
    success: true,
    action: 'closed',
    session: saved
  };
}

// 3. Get Open Attendance Session Action
export async function getOpenAttendanceSessionAction(volunteerId: string) {
  await requireVolunteerSelfOrCapability('view_volunteers', volunteerId);
  const session = await getOpenSessionForVolunteer(volunteerId);
  return { success: true, session };
}

// 3.5. Fetch Volunteer Attendance Sessions Action (Safe for Client Components)
export async function fetchVolunteerAttendanceSessionsAction(volunteerId: string) {
  try {
    await requireVolunteerSelfOrCapability('view_volunteers', volunteerId);
    const allowedDayKeys = new Set(buildEventDayKeys());
    const sessions = await fetchAllRowsStrict<AttendanceSession>(getAdminClient(), 'attendance_sessions', '*', query =>
      query.eq('volunteer_id', volunteerId).order('started_at', { ascending: false }));
    const validSessions = sessions.filter(session => session.day_key && allowedDayKeys.has(session.day_key));
    return { success: true, sessions: validSessions };
  } catch (e: any) {
    return { success: false, error: e?.message || "Error al cargar sesiones", sessions: [] };
  }
}

/** Correct a closed session without replacing its original check-in/out audit events. */
export async function correctClosedAttendanceSessionAdminAction(input: {
  sessionId: string;
  expectedStartedAt: string;
  expectedEndedAt: string;
  startedAt: string;
  endedAt: string;
  reason: string;
  mergeOverlapping?: boolean;
}) {
  try {
    const actor = await requireCapability('correct_attendance_times');
    const reason = input.reason?.trim() || '';
    if (reason.length < 5) return { success: false as const, error: 'Indica un motivo de al menos 5 caracteres.' };
    const supabase = getAdminClient();
    const { data: original, error: sessionError } = await supabase.from('attendance_sessions')
      .select('*').eq('id', input.sessionId).maybeSingle();
    if (sessionError) throw sessionError;
    if (!original || original.status !== 'completed' || !original.ended_at) {
      return { success: false as const, error: 'Solo se puede corregir una asistencia cerrada.' };
    }
    const validation = validateCorrectedSession(original.day_key, input.startedAt, input.endedAt);
    if (validation) return { success: false as const, error: validation };
    if (new Date(original.started_at).getTime() !== new Date(input.expectedStartedAt).getTime()
      || new Date(original.ended_at).getTime() !== new Date(input.expectedEndedAt).getTime()) {
      return { success: false as const, error: 'La asistencia cambió. Actualiza el historial antes de corregirla.' };
    }

    const [sessions, shifts] = await Promise.all([
      fetchAllRowsStrict<AttendanceSession>(supabase, 'attendance_sessions', '*', query =>
        query.eq('volunteer_id', original.volunteer_id)),
      fetchAllRowsStrict<CorrectedShift & { volunteer_id: string }>(supabase, 'shifts',
        'id, volunteer_id, day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at',
        query => query.eq('volunteer_id', original.volunteer_id)),
    ]);
    const corrected: AttendanceSession = { ...original, started_at: new Date(input.startedAt).toISOString(), ended_at: new Date(input.endedAt).toISOString(), auto_closed: false };
    const { absorbed, blocking } = getSessionsOverlappingCorrection(original, corrected, sessions);
    if (blocking.length > 0) {
      return { success: false as const, error: 'El horario se solapa parcialmente con otra asistencia o con una sesión abierta. Revisa esas horas antes de unirlas.' };
    }
    if (absorbed.length > 0 && !input.mergeOverlapping) {
      return { success: false as const, error: 'Esta corrección abarcará otra asistencia cerrada. Confirma que deseas unir los registros.' };
    }
    if (input.mergeOverlapping && absorbed.length === 0) {
      return { success: false as const, error: 'Las asistencias cambiaron. Actualiza el historial antes de unirlas.' };
    }
    const dayShifts = shifts.filter(shift => shift.day_key === original.day_key);
    const shiftUpdates = calculateAffectedShiftUpdates(
      original, corrected, sessions.filter(session => session.day_key === original.day_key),
      dayShifts, absorbed.map(session => session.id),
    );
    const patches = new Map(shiftUpdates.map(shift => [shift.id, shift]));
    const updatedShifts = shifts.map(shift => ({ ...shift, ...(patches.get(shift.id) || {}) }));
    const absorbedIds = new Set(absorbed.map(session => session.id));
    const updatedSessions = sessions.filter(session => !absorbedIds.has(session.id))
      .map(session => session.id === original.id ? corrected : session);
    const score = getVolunteerReliabilityMetrics(original.volunteer_id, updatedShifts, updatedSessions).reliabilityScore;

    const rpcArgs = {
      p_session_id: original.id,
      p_expected_started_at: input.expectedStartedAt,
      p_expected_ended_at: input.expectedEndedAt,
      p_started_at: corrected.started_at,
      p_ended_at: corrected.ended_at,
      p_reason: reason,
      p_actor_id: actor.userId || '',
      p_actor_name: actor.name || 'Administrador',
      p_actor_role: roleDisplayName(actor),
      p_shift_updates: shiftUpdates,
      p_reliability_score: score,
    };
    const { data: saved, error } = absorbed.length > 0
      ? await supabase.rpc('merge_closed_attendance_sessions', {
        ...rpcArgs,
        p_absorbed_sessions: absorbed.map(session => ({
          id: session.id, started_at: session.started_at, ended_at: session.ended_at,
        })),
      })
      : await supabase.rpc('correct_closed_attendance_session', rpcArgs);
    if (error) return { success: false as const, error: error.message };
    if (!saved) throw new Error('La corrección no devolvió la asistencia actualizada.');
    await broadcastSessionSync({ eventType: 'UPDATE', table: 'attendance_sessions', record: saved });
    for (const removed of absorbed) {
      await broadcastSessionSync({ eventType: 'DELETE', table: 'attendance_sessions', record: removed });
    }
    shiftUpdates.forEach(update => {
      const shift = shifts.find(item => item.id === update.id);
      if (shift) broadcastShiftSync({ eventType: 'UPDATE', table: 'shifts', record: { ...shift, ...update } });
    });
    for (const route of ['/shifts', '/volunteers', '/check-in', '/dashboard']) revalidatePath(route);
    return { success: true as const, session: saved as AttendanceSession };
  } catch (error: any) {
    console.error('Error correcting closed attendance session:', error);
    return { success: false as const, error: error?.message || 'No se pudo corregir la asistencia.' };
  }
}

// 4. Admin Adjustment of Session Times Action (Requires Admin role, reason, and validates chronology)
export async function adjustSessionTimesAdminAction({
  sessionId,
  startedAt,
  endedAt,
  reason: rawReason,
  correctionType = 'manual_adjustment'
}: {
  sessionId: string;
  startedAt?: string;
  endedAt?: string;
  reason?: string;
  correctionType?: 'official_shift_end' | 'custom_time' | 'manual_adjustment' | 'forgotten_entry_late_scan';
}) {
  try {
    await requireCapability('correct_attendance_times');
    let finalReason = (rawReason || '').trim();
    if (correctionType === 'official_shift_end') {
      finalReason = "Salida olvidada - se utilizó el fin oficial del bloque programado";
    } else if (correctionType === 'forgotten_entry_late_scan') {
      finalReason = finalReason || "Corrección de entrada olvidada sobre escaneo tardío de salida";
    } else {
      if (!finalReason || finalReason.length < 5) {
        return { success: false, error: "Se requiere especificar un motivo de al menos 5 caracteres para realizar la corrección." };
      }
    }

    const all = await fetchAllAttendanceSessionsFromDb();
    const targetSession = all.find(s => s.id === sessionId);

    if (!targetSession) {
      return { success: false, error: "Sesión de asistencia no encontrada." };
    }

    // Concurrency & Idempotency Protection (Caso I)
    if (targetSession.status === 'completed' && targetSession.ended_at && correctionType !== 'forgotten_entry_late_scan') {
      return {
        success: true,
        alreadyClosed: true,
        session: targetSession,
        message: "La sesión ya fue finalizada por otro usuario o escáner QR."
      };
    }

    const previousStartedAt = targetSession.started_at;
    const previousEndedAt = targetSession.ended_at;

    const newStartedAt = correctionType === 'official_shift_end' ? targetSession.started_at : startedAt || targetSession.started_at;
    let newEndedAt = endedAt !== undefined ? endedAt : targetSession.ended_at;
    if (correctionType === 'official_shift_end') {
      const assignedShiftKeys = await getSessionAssignedShiftKeys(targetSession);
      const block = getContinuousScheduledBlockForSession(targetSession.day_key, targetSession.started_at, assignedShiftKeys);
      if (!block) return { success: false, error: 'No se pudo determinar el bloque original. Registra la hora de salida con un motivo.' };
      newEndedAt = block.suggestedEndTimeIso;
    }
    const newStatus = newEndedAt ? 'completed' : 'open';

    // Chronology & constraint validation (ended_at >= started_at)
    const constraintCheck = validateSessionConstraints(newStartedAt, newEndedAt, newStatus);
    if (!constraintCheck.valid) {
      return { success: false, error: constraintCheck.error || "Ajuste de horario inválido." };
    }

    // Check no future timestamps
    const nowMs = Date.now();
    if (new Date(newStartedAt).getTime() > nowMs) {
      return { success: false, error: "No se puede registrar una hora de entrada en el futuro." };
    }
    if (newEndedAt && new Date(newEndedAt).getTime() > nowMs) {
      return { success: false, error: "No se puede registrar una hora de salida en el futuro." };
    }

    let saved: AttendanceSession;

    if (targetSession.status === 'open' && newEndedAt) {
      const atomicRes = await completeOpenAttendanceSessionInDb(sessionId, newEndedAt, false);
      if (!atomicRes.success) return { success: false, error: atomicRes.error || 'No se pudo guardar la corrección de salida.' };
      if (atomicRes.alreadyClosed) {
        return {
          success: true,
          alreadyClosed: true,
          session: atomicRes.session || targetSession,
          message: atomicRes.error || "La sesión ya fue finalizada por otro usuario."
        };
      }
      saved = { ...atomicRes.session!, started_at: newStartedAt };
      if (newStartedAt !== targetSession.started_at) await saveAttendanceSession(saved);
    } else {
      const updatedRecord: AttendanceSession = {
        ...targetSession,
        started_at: newStartedAt,
        ended_at: newEndedAt,
        status: newStatus,
        auto_closed: false,
        updated_at: new Date().toISOString()
      };
      saved = await saveAttendanceSession(updatedRecord);
    }

    await broadcastSessionSync({
      eventType: 'UPDATE',
      table: 'attendance_sessions',
      record: saved,
    });

    const { getCurrentUserSession } = await import('@/lib/auth-helpers');
    const currentActor = await getCurrentUserSession();
    const adminName = currentActor.userName || 'Administrador';
    const adminId = currentActor.userId || 'admin-server-session';

    // Log in activity_logs
    try {
      const supabase = getAdminClient();
      await supabase.from('activity_logs').insert({
        user_name: adminName,
        user_role: currentActor.userRole,
        action_type: correctionType === 'forgotten_entry_late_scan' ? 'Corrección Entrada Olvidada' : 'Corrección Salida Olvidada',
        description: `Corrigió horario de sesión de asistencia (${correctionType})`,
        details: JSON.stringify({
          sessionId: saved.id,
          volunteerId: saved.volunteer_id,
          previousStartedAt,
          newStartedAt: saved.started_at,
          previousEndedAt,
          newEndedAt: saved.ended_at,
          originalLateScanAt: correctionType === 'forgotten_entry_late_scan' ? previousStartedAt : undefined,
          reason: finalReason,
          correctionType,
          adminId,
          adminName
        }),
        target_id: saved.volunteer_id
      });
    } catch (e) {}

    for (const route of ['/shifts', '/volunteers', '/check-in', '/dashboard']) {
      revalidatePath(route);
    }

    return {
      success: true,
      session: saved
    };
  } catch (error: any) {
    console.error('Error in adjustSessionTimesAdminAction:', error);
    return {
      success: false,
      error: error?.message || 'No autorizado o error al procesar el ajuste de sesión.'
    };
  }
}

/**
 * Admin Server Action to manually create missing attendance sessions (Vía A: Entrada Olvidada sin sesión previa).
 * Server-side Admin authentication, overlap checks, and activity logging.
 */
export async function createAttendanceSessionAdminAction(input: {
  volunteerId: string;
  dayKey: string;
  startedAt: string;
  endedAt?: string | null;
  correctionType: 'official_shift_start' | 'custom_start_time' | 'manual_session_creation';
  reason?: string;
}) {
  try {
    const authorizedActor = await requireCapability('register_missing_attendance');
    const { volunteerId, dayKey, startedAt, endedAt, correctionType, reason: rawReason } = input;

    let finalReason = (rawReason || '').trim();
    if (correctionType === 'official_shift_start') {
      finalReason = "Entrada olvidada - se utilizó el inicio oficial del turno/bloque programado";
    } else {
      if (!finalReason || finalReason.length < 5) {
        return { success: false, error: "Se requiere especificar un motivo de al menos 5 caracteres para realizar la corrección." };
      }
    }

    const nowMs = Date.now();
    const startMs = new Date(startedAt).getTime();
    if (isNaN(startMs) || startMs > nowMs) {
      return { success: false, error: "La hora de entrada no puede ser en el futuro." };
    }

    const newStatus = endedAt ? 'completed' : 'open';

    if (endedAt) {
      const endMs = new Date(endedAt).getTime();
      if (isNaN(endMs) || endMs > nowMs) {
        return { success: false, error: "La hora de salida no puede ser en el futuro." };
      }
      if (endMs < startMs) {
        return { success: false, error: "La hora de salida no puede ser anterior a la hora de entrada." };
      }
    }

    if (newStatus === 'open') {
      const existingOpen = await getOpenSessionForVolunteer(volunteerId);
      if (existingOpen) {
        return { success: false, error: "El voluntario ya posee una sesión activa en turno (OPEN)." };
      }
    }

    const overlapCheck = await checkSessionOverlapInDb(volunteerId, startedAt, endedAt);
    if (overlapCheck.hasOverlap) {
      return { success: false, error: "El intervalo se solapa con una asistencia existente. Si necesitas ajustar su salida o entrada, usa «Corregir horas» en el historial de esa asistencia." };
    }

    const nowIso = new Date().toISOString();
    const newRecord: AttendanceSession = {
      id: crypto.randomUUID(),
      volunteer_id: volunteerId,
      day_key: dayKey,
      started_at: startedAt,
      ended_at: endedAt || null,
      status: newStatus,
      auto_closed: false,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const saved = await saveAttendanceSession(newRecord);

    await broadcastSessionSync({
      eventType: 'INSERT',
      table: 'attendance_sessions',
      record: saved,
    });

    const adminName = authorizedActor.name;
    const adminId = authorizedActor.userId || 'admin-server-session';

    try {
      const supabase = getAdminClient();
      await supabase.from('activity_logs').insert({
        user_name: adminName,
        user_role: roleDisplayName(authorizedActor),
        action_type: 'Corrección Entrada Olvidada',
        description: `Registró entrada olvidada de sesión para el día ${dayKey}`,
        details: JSON.stringify({
          sessionId: saved.id,
          volunteerId,
          dayKey,
          startedAt,
          endedAt: saved.ended_at,
          status: saved.status,
          correctionType,
          reason: finalReason,
          adminId,
          adminName
        }),
        target_id: volunteerId
      });
    } catch {}

    for (const route of ['/shifts', '/volunteers', '/check-in', '/dashboard']) {
      revalidatePath(route);
    }

    return { success: true, session: saved };
  } catch (error: any) {
    console.error('Error in createAttendanceSessionAdminAction:', error);
    return {
      success: false,
      error: error?.message || 'No autorizado o error al registrar la sesión de asistencia.'
    };
  }
}

// 5. Process Check-in via QR Scan or manual selection
export async function checkInVolunteer(
  qrValueString: string,
  coordinatorId: string,
  manualShiftId?: string,
  options?: { intendedShiftKey?: string; isConfirmedDoubleShift?: boolean; overrideLate?: boolean }
) {
  const authorizedActor = await requireCapability('scan_qr_attendance');
  coordinatorId = authorizedActor.userId || coordinatorId;
  const supabase = getAdminClient();

  let volunteerId = "";
  
  if (manualShiftId) {
    try {
      const { data: shift, error: shiftErr } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', manualShiftId)
        .single();

      if (shiftErr || !shift) {
        return { error: "No se encontró el turno seleccionado.", errorCode: 'SHIFT_NOT_FOUND' };
      }
      volunteerId = shift.volunteer_id;
      await requireVolunteerCapability('scan_qr_attendance', volunteerId);

      const { data: vol } = await supabase
        .from('volunteers')
        .select('*, committees(name)')
        .eq('id', volunteerId)
        .single();

      if (!vol || vol.status === 'archived') {
        return { error: 'Voluntario no disponible para registrar asistencia.', errorCode: 'ARCHIVED' };
      }
      const now = new Date();
      const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guatemala' }));
      const today = format(localNow, 'EEE d', { locale: es }).toLowerCase();
      if (shift.day_key !== today || !buildEventDayKeys().includes(today) || !isShiftAvailableForDay(shift.day_key, shift.shift_key)) {
        return { error: 'La entrada en vivo debe corresponder a un turno de hoy. Para otra fecha utiliza una corrección de asistencia.', errorCode: 'NOT_TODAY' };
      }
      if (shift.checked_out || shift.checked_out_at) {
        return { error: 'Este turno ya está completado. Utiliza Reabrir turno si la salida fue un error.', errorCode: 'ALREADY_COMPLETED' };
      }
      if (await getOpenSessionForVolunteer(volunteerId)) {
        return { error: 'El voluntario ya tiene una sesión abierta. Vuelve a escanear su QR para registrar la salida o resolver la salida pendiente.', errorCode: 'ALREADY_OPEN' };
      }
      const { data: assigned, error: assignedError } = await supabase.from('shifts')
        .select('shift_key').eq('volunteer_id', volunteerId).eq('day_key', today);
      if (assignedError) return { error: 'No se pudieron consultar los turnos asignados.', errorCode: 'SERVER_ERROR' };
      const assignedKeys = (assigned || []).map((s: { shift_key: string }) => s.shift_key);
      const currentHour = getGuatemalaHourFloat(now);
      const available = assignedKeys.map((key: string) => getOfficialShiftTime(today, key))
        .filter((s: { endHour: number }) => s.endHour > currentHour)
        .sort((a: { startHour: number }, b: { startHour: number }) => a.startHour - b.startHour);
      const eligible = available.filter((s: { startHour: number }) => s.startHour <= currentHour);
      const selectable = eligible.length ? eligible : available.slice(0, 1);
      if (!selectable.some((s: { shiftKey: string }) => s.shiftKey === shift.shift_key)) {
        return { error: 'Selecciona el turno actual o el próximo turno asignado de hoy. Un turno pasado requiere corrección de asistencia.', errorCode: 'PAST_SHIFT' };
      }

      // Use the same persistence and broadcasts as a normal QR entry. Do not
      // write only legacy shift flags: all consumers need the actual session.
      const opened = await openAttendanceSessionAction(volunteerId, today, true, {
        intendedShiftKeys: [shift.shift_key],
        attendanceKind: 'scheduled',
        reasonCode: 'manual_shift_selected',
        idempotencyKey: `manual-checkin:${volunteerId}:${shift.id}:${Math.floor(Date.now() / 5000)}`,
      });
      if (!opened.success || !opened.session || opened.alreadyOpen) {
        return { error: 'No se abrió una nueva sesión. Vuelve a escanear para consultar el estado actual.', errorCode: 'FAILED_TO_OPEN' };
      }
      const volunteerName = vol ? `${vol.first_name} ${vol.last_name}` : "Voluntario";
      const shiftDetail = `${shift.day_key} - ${shift.shift_key}`;

      try {
        revalidatePath('/shifts');
        revalidatePath('/volunteers');
        revalidatePath('/check-in');
        revalidatePath('/dashboard');
      } catch {}

      return {
        success: true,
        action: 'opened',
        session: opened.session,
        message: "Sesión de asistencia abierta para el turno seleccionado.",
        shiftId: manualShiftId,
        volunteerId,
        volunteer: volunteerName,
        committee: vol?.committees?.name || "Sin comité",
        shiftDetail
      };
    } catch (manualErr) {
      console.error("Unexpected error in manual check-in:", manualErr);
      return { error: "Error inesperado al registrar la asistencia.", errorCode: 'UNEXPECTED' };
    }
  }

  // standard QR scan flow
  const validation = validateEntryPassQrValue(qrValueString);
  if (!validation.success) return { error: validation.error, errorCode: 'INVALID_QR' };
  volunteerId = validation.payload.id;
  await requireVolunteerCapability('scan_qr_attendance', volunteerId);

  // Fetch volunteer details
  const { data: volunteer, error: volError } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('id', volunteerId)
    .single();

  if (volError || !volunteer) {
    return { error: "Voluntario no encontrado en el sistema.", errorCode: 'NOT_FOUND' };
  }

  const volunteerName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();
  const volunteerSummary = {
    id: volunteer.id,
    name: volunteerName,
    firstName: volunteer.first_name || '',
    lastName: volunteer.last_name || '',
    committee: volunteer.committees?.name || "Sin comité",
    committeeId: volunteer.committee_id,
    phone: volunteer.phone || '',
    status: volunteer.status,
    reliabilityScore: volunteer.reliability_score ?? null,
    photoUrl: volunteer.photo_url || null,
  };

  if (volunteer.status === 'archived') {
    return {
      error: "El pase QR pertenece a un voluntario archivado.",
      errorCode: 'ARCHIVED',
      volunteer: volunteerName,
      volunteerSummary,
      volunteerId,
      committee: volunteerSummary.committee,
    };
  }

  // 1. Check if volunteer already has an open session
  const guatemalaString = new Date().toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaNow = new Date(guatemalaString);
  const currentDayKey = format(guatemalaNow, "EEE d", { locale: es }).toLowerCase();
  const operationalDayKeys = new Set(buildEventDayKeys().map(key => key.toLowerCase().trim()));

  const openSession = await getOpenSessionForVolunteer(volunteerId);
  if (openSession) {
    const assignedShiftKeys = await getSessionAssignedShiftKeys(openSession);
    const needsExitResolution = requiresSessionExitResolution(openSession.day_key, openSession.started_at, assignedShiftKeys);
    const isSameDay = (openSession.day_key || '').toLowerCase().trim() === currentDayKey;
    const isOperationalSessionDay = operationalDayKeys.has((openSession.day_key || '').toLowerCase().trim());

    if (!isSameDay || !isOperationalSessionDay || needsExitResolution) {
      // A previous-day or out-of-calendar session must be resolved before a new
      // scheduled shift can start.
      return {
        success: true,
        action: 'stale_open_session',
        isStaleOpen: true,
        assignedShiftKeys,
        isOutsideOperationalDay: !isOperationalSessionDay,
        session: openSession,
        previousDayKey: openSession.day_key,
        startedAt: openSession.started_at,
        volunteerId,
        volunteer: volunteerName,
        volunteerSummary,
        committee: volunteer.committees?.name || "Sin comité",
        message: isOperationalSessionDay
          ? `El voluntario ${volunteerName} tiene una salida pendiente de un bloque anterior (${openSession.day_key}). Resuelve esa salida y vuelve a escanear para iniciar el siguiente turno.`
          : `El voluntario ${volunteerName} posee una sesión abierta fuera del cronograma operativo (${openSession.day_key}).`
      };
    }

    // Same day open session (Caso 5: Segundo QR)
    const premature = isPrematureCheckout(openSession.started_at);
    return {
      success: true,
      action: 'confirm_checkout',
      alreadyOpen: true,
      isPrematureCheckout: premature,
      session: openSession,
      volunteerId,
      volunteer: volunteerName,
      volunteerSummary,
      committee: volunteer.committees?.name || "Sin comité",
      message: `El voluntario ${volunteerName} ya posee una sesión activa iniciada a las ${new Date(openSession.started_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true })}.`
    };
  }

  // Load the assignments before opening a session.
  const { data: rawShifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  if (shiftsError) {
    return {
      error: "No se pudieron consultar los turnos asignados del voluntario.",
      errorCode: 'SERVER_ERROR',
      volunteer: volunteerName,
      volunteerSummary,
      volunteerId,
      committee: volunteerSummary.committee,
    };
  }

  const allVolunteerShifts = rawShifts || [];
  const currentIsoDate = parseDayKeyToDateStr(currentDayKey);
  const currentHour = getGuatemalaHourFloat(new Date());
  const isOperationalDay = operationalDayKeys.has(currentDayKey);

  // Filter shifts belonging to today
  const todayShifts = allVolunteerShifts.filter((shift: any) => {
    const dayKey = (shift.day_key || '').toLowerCase().trim();
    return dayKey === currentDayKey || parseDayKeyToDateStr(shift.day_key) === currentIsoDate;
  });

  // Active assignments within the current live check-in window (up to 30 mins before start until end)
  const activeAssignments = todayShifts.filter((shift: any) => {
    if (!isShiftAvailableForDay(shift.day_key, shift.shift_key)) return false;
    const official = getOfficialShiftTime(shift.day_key, shift.shift_key);
    const earliestCheckInHour = official.startHour - (EARLY_CHECK_IN_MINUTES / 60);
    return currentHour >= earliestCheckInHour && currentHour < official.endHour;
  });

  // If outside operational days or outside the 30-min window before an active shift, handle manual selection or informative error
  if (!isOperationalDay || activeAssignments.length === 0) {
    // If today is an operational event day, only show today's eligible shifts (never past days nor ended un-checked-in shifts)
    if (isOperationalDay) {
      const eligibleTodayShifts = todayShifts.filter((shift: any) => {
        if (!isShiftAvailableForDay(shift.day_key, shift.shift_key)) return false;
        const official = getOfficialShiftTime(shift.day_key, shift.shift_key);
        return Boolean(shift.checked_in) || official.endHour > currentHour;
      });

      if (eligibleTodayShifts.length === 0) {
        // Volunteer has no pending or eligible shifts for today
        const futureShifts = allVolunteerShifts
          .filter((s: any) => parseDayKeyToDateStr(s.day_key) > currentIsoDate)
          .sort((a: any, b: any) => parseDayKeyToDateStr(a.day_key).localeCompare(parseDayKeyToDateStr(b.day_key)));

        if (futureShifts.length > 0) {
          const nextShift = futureShifts[0];
          const official = getOfficialShiftTime(nextShift.day_key, nextShift.shift_key);
          return {
            error: `${volunteerName} no tiene turnos programados para hoy (${currentDayKey}). Su próximo turno asignado es el ${nextShift.day_key} (${nextShift.shift_key}).`,
            errorCode: 'NO_SHIFTS_TODAY',
            volunteer: volunteerName,
            volunteerSummary,
            volunteerId,
            committee: volunteerSummary.committee,
            allShifts: allVolunteerShifts,
            todayShifts: [],
            nextScheduledShift: {
              dayKey: nextShift.day_key,
              shiftKey: nextShift.shift_key,
              timeLabel: official.shortTimeLabel,
            },
          };
        }

        const endedTodayShifts = todayShifts.filter((s: any) => !s.checked_in);
        if (endedTodayShifts.length > 0) {
          const endedShift = endedTodayShifts[0];
          const official = getOfficialShiftTime(endedShift.day_key, endedShift.shift_key);
          return {
            error: `${volunteerName} no tiene turnos pendientes para hoy (${currentDayKey}). El turno programado (${endedShift.shift_key} - ${official.shortTimeLabel}) ya finalizó.`,
            errorCode: 'SHIFT_ENDED',
            volunteer: volunteerName,
            volunteerSummary,
            volunteerId,
            committee: volunteerSummary.committee,
            allShifts: allVolunteerShifts,
            todayShifts,
            endedShift: {
              dayKey: endedShift.day_key,
              shiftKey: endedShift.shift_key,
              timeLabel: official.shortTimeLabel,
            },
          };
        }

        if (allVolunteerShifts.length > 0) {
          return {
            error: `${volunteerName} no tiene turnos asignados para hoy (${currentDayKey}). Los turnos de fechas anteriores ya pasaron y requieren corrección de asistencia.`,
            errorCode: 'NO_SHIFTS_TODAY',
            volunteer: volunteerName,
            volunteerSummary,
            volunteerId,
            committee: volunteerSummary.committee,
            allShifts: allVolunteerShifts,
            todayShifts: [],
          };
        }

        return {
          error: `${volunteerName} no tiene turnos asignados para registrar asistencia.`,
          errorCode: 'NO_ASSIGNED_SHIFTS',
          volunteer: volunteerName,
          volunteerSummary,
          volunteerId,
          committee: volunteerSummary.committee,
          allShifts: [],
          todayShifts: [],
        };
      }

      const formattedTodayShifts = eligibleTodayShifts.map((s: any) => {
        const official = getOfficialShiftTime(s.day_key, s.shift_key);
        return {
          id: s.id,
          dayKey: s.day_key,
          shiftKey: s.shift_key,
          timeLabel: official.shortTimeLabel,
          checkedIn: s.checked_in,
          checkedInAt: s.checked_in_at,
          checkedOut: s.checked_out,
          checkedOutAt: s.checked_out_at,
        };
      });

      return {
        requiresManualSelection: true,
        outsideOperationalDay: false,
        volunteerId,
        volunteer: volunteerName,
        volunteerSummary,
        committee: volunteer.committees?.name || "Sin comité",
        shifts: formattedTodayShifts,
      };
    }

    // Outside operational calendar (e.g. testing days outside event): only show non-past shifts
    const nonPastShifts = allVolunteerShifts.filter((s: any) => {
      const shiftDateStr = parseDayKeyToDateStr(s.day_key);
      if (shiftDateStr < currentIsoDate) return false;
      if (shiftDateStr === currentIsoDate) {
        const official = getOfficialShiftTime(s.day_key, s.shift_key);
        return Boolean(s.checked_in) || official.endHour > currentHour;
      }
      return true;
    });

    if (nonPastShifts.length === 0) {
      if (allVolunteerShifts.length > 0) {
        return {
          error: `${volunteerName} no tiene turnos disponibles para registrar asistencia. Los turnos asignados corresponden a fechas pasadas.`,
          errorCode: 'NO_SHIFTS_TODAY',
          volunteer: volunteerName,
          volunteerSummary,
          volunteerId,
          committee: volunteerSummary.committee,
          allShifts: allVolunteerShifts,
          todayShifts: [],
        };
      }
      return {
        error: `${volunteerName} no tiene turnos asignados para registrar asistencia.`,
        errorCode: 'NO_ASSIGNED_SHIFTS',
        volunteer: volunteerName,
        volunteerSummary,
        volunteerId,
        committee: volunteerSummary.committee,
        allShifts: [],
        todayShifts: [],
      };
    }

    const formattedNonPastShifts = nonPastShifts.map((s: any) => {
      const official = getOfficialShiftTime(s.day_key, s.shift_key);
      return {
        id: s.id,
        dayKey: s.day_key,
        shiftKey: s.shift_key,
        timeLabel: official.shortTimeLabel,
        checkedIn: s.checked_in,
        checkedInAt: s.checked_in_at,
        checkedOut: s.checked_out,
        checkedOutAt: s.checked_out_at,
      };
    });

    return {
      requiresManualSelection: true,
      outsideOperationalDay: true,
      volunteerId,
      volunteer: volunteerName,
      volunteerSummary,
      committee: volunteer.committees?.name || "Sin comité",
      shifts: formattedNonPastShifts,
    };
  }

  // Ambiguity check: If volunteer has multiple assigned shifts today and no intended shift was specified
  const assignedTodayKeys = todayShifts.map((s: any) => s.shift_key);
  if (!options?.intendedShiftKey && isOperationalDay) {
    const ambiguity = detectShiftAmbiguity(currentDayKey, currentHour, assignedTodayKeys);
    if (ambiguity.isAmbiguous && ambiguity.options.length > 1) {
      return {
        requiresDisambiguation: true,
        ambiguityData: {
          volunteerId,
          volunteer: volunteerName,
          committee: volunteerSummary.committee,
          dayKey: currentDayKey,
          currentHour,
          recommendedShiftKey: ambiguity.recommendedShiftKey,
          options: ambiguity.options,
          qrValue: qrValueString,
        },
        volunteerId,
        volunteer: volunteerName,
        volunteerSummary,
        committee: volunteerSummary.committee,
        shifts: todayShifts,
      };
    }
  }

  // 2. Open new attendance session (Caso 1-3)
  const intendedShiftKeys = options?.intendedShiftKey === 'ALL'
    ? assignedTodayKeys
    : options?.intendedShiftKey ? [options.intendedShiftKey] : assignedTodayKeys;
  const openRes = await openAttendanceSessionAction(volunteerId, currentDayKey, true, {
    intendedShiftKeys,
    attendanceKind: options?.intendedShiftKey === 'ALL' || intendedShiftKeys.length > 1
      ? 'full_block'
      : 'scheduled',
    reasonCode: options?.intendedShiftKey ? 'scanner_shift_selected' : 'scanner_single_assignment',
    idempotencyKey: `qr-checkin:${volunteerId}:${options?.intendedShiftKey || intendedShiftKeys.join('+')}:${Math.floor(Date.now() / 5000)}`,
  });
  if (openRes.success && openRes.session) {
    let shiftDetail = `${openRes.session.day_key} - Sesión Continua`;
    if (options?.intendedShiftKey) {
      shiftDetail = options.intendedShiftKey === 'ALL'
        ? `${openRes.session.day_key} - Jornada Completa (${assignedTodayKeys.join('+')})`
        : `${openRes.session.day_key} - Turno ${options.intendedShiftKey}`;
    }
    return {
      success: true,
      action: 'opened',
      session: openRes.session,
      volunteerId,
      volunteer: volunteerName,
      volunteerSummary,
      committee: volunteer.committees?.name || "Sin comité",
      shiftDetail
    };
  }

  const fallbackShifts = todayShifts.map((s: any) => {
    const official = getOfficialShiftTime(s.day_key, s.shift_key);
    return {
      id: s.id,
      dayKey: s.day_key,
      shiftKey: s.shift_key,
      timeLabel: official.shortTimeLabel,
      checkedIn: s.checked_in,
      checkedInAt: s.checked_in_at,
      checkedOut: s.checked_out,
      checkedOutAt: s.checked_out_at,
    };
  });

  return {
    requiresManualSelection: true,
    outsideOperationalDay: !isOperationalDay,
    volunteerId,
    volunteer: volunteerName,
    volunteerSummary,
    committee: volunteer.committees?.name || "Sin comité",
    shifts: fallbackShifts,
  };
}

// 5b. Resolve Stale Session from Previous Day and Open Today's Session in 1 atomic action
export async function resolvePreviousAndCheckInTodayAction({
  previousSessionId,
  volunteerId,
  intendedShiftKey,
}: {
  previousSessionId: string;
  volunteerId: string;
  intendedShiftKey?: string;
}) {
  const authorizedActor = await requireVolunteerCapability('scan_qr_attendance', volunteerId);
  const supabase = getAdminClient();
  const { data: previousSession, error: previousError } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('id', previousSessionId)
    .eq('volunteer_id', volunteerId)
    .maybeSingle();
  if (previousError || !previousSession || previousSession.status !== 'open') {
    return { success: false, error: 'La sesión anterior ya no está abierta. Actualiza y vuelve a intentar.' };
  }

  const guatemalaString = new Date().toLocaleString('en-US', { timeZone: 'America/Guatemala' });
  const guatemalaNow = new Date(guatemalaString);
  const currentDayKey = format(guatemalaNow, 'EEE d', { locale: es }).toLowerCase();
  const nowIso = new Date().toISOString();
  const [{ data: previousAssignments, error: previousAssignmentsError }, { data: todayAssignments, error: todayAssignmentsError }] = await Promise.all([
    supabase.from('shifts').select('shift_key').eq('volunteer_id', volunteerId).eq('day_key', previousSession.day_key),
    supabase.from('shifts').select('shift_key').eq('volunteer_id', volunteerId).eq('day_key', currentDayKey),
  ]);
  if (previousAssignmentsError || todayAssignmentsError) {
    return { success: false, error: 'No se pudieron consultar los turnos para resolver la asistencia.' };
  }
  const previousShiftKeys: string[] = [...new Set<string>((previousAssignments || []).map((row: { shift_key: string }) => row.shift_key))];
  const todayShiftKeys: string[] = [...new Set<string>((todayAssignments || []).map((row: { shift_key: string }) => row.shift_key))];
  if (todayShiftKeys.length === 0) {
    return { success: false, error: 'El voluntario no tiene un turno asignado para hoy.' };
  }
  const selectedTodayKeys = intendedShiftKey === 'ALL'
    ? todayShiftKeys
    : intendedShiftKey ? [intendedShiftKey] : (() => {
        const ambiguity = detectShiftAmbiguity(currentDayKey, getGuatemalaHourFloat(new Date()), todayShiftKeys);
        const recommended = ambiguity.recommendedShiftKey;
        if (recommended === 'ALL') return todayShiftKeys;
        return recommended ? [recommended] : [todayShiftKeys[0]];
      })();
  const effectivePreviousKeys = previousShiftKeys.length
    ? previousShiftKeys
    : inferShiftsForSession(previousSession.day_key, previousSession.started_at, nowIso, ['T1', 'T2', 'T3', 'T4'])
      .map(shift => shift.shiftKey);
  const fallbackPreviousKeys = effectivePreviousKeys.length ? effectivePreviousKeys : ['T1'];
  const block = getContinuousScheduledBlockForSession(
    previousSession.day_key,
    previousSession.started_at,
    fallbackPreviousKeys,
  );
  const finalPreviousShiftKey = block?.endShiftKey || fallbackPreviousKeys[fallbackPreviousKeys.length - 1];
  const officialEnd = getOfficialShiftTime(previousSession.day_key, finalPreviousShiftKey).endHour;
  const previousDayStartMs = new Date(`${parseDayKeyToDateStr(previousSession.day_key)}T00:00:00-06:00`).getTime();
  const previousEndedAt = new Date(Math.max(
    new Date(previousSession.started_at).getTime(),
    previousDayStartMs + officialEnd * 3600000,
  )).toISOString();

  const atomic = await resolveStaleAndOpenAttendanceInDb({
    previousSession,
    previousEndedAt,
    previousShiftKeys: fallbackPreviousKeys,
    newSessionId: crypto.randomUUID(),
    newDayKey: currentDayKey,
    newStartedAt: nowIso,
    newShiftKeys: selectedTodayKeys,
    newAttendanceKind: selectedTodayKeys.length > 1 ? 'full_block' : 'scheduled',
    actor: {
      id: authorizedActor.userId,
      name: authorizedActor.name || 'Coordinador',
      role: roleDisplayName(authorizedActor),
    },
    idempotencyKey: `resolve-stale:${previousSessionId}:${currentDayKey}`,
  });
  if (!atomic.success || !atomic.session) {
    return {
      success: false,
      error: atomic.infrastructureMissing
        ? 'La migración de decisiones de asistencia aún no está aplicada. No se hizo ningún cambio parcial.'
        : atomic.error || 'No se pudo resolver la salida e iniciar la asistencia de hoy.',
    };
  }

  const { data: vol } = await supabase
    .from('volunteers')
    .select('first_name, last_name, committees(name)')
    .eq('id', volunteerId)
    .maybeSingle();

  const volunteerName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';
  const committeeName = vol?.committees?.name || 'Sin comité';
  const shiftDetail = `${currentDayKey} - ${selectedTodayKeys.join(' + ')}`;

  await broadcastSessionSync({
    eventType: 'INSERT',
    table: 'attendance_sessions',
    record: atomic.session,
  });

  try {
    revalidatePath('/shifts');
    revalidatePath('/volunteers');
    revalidatePath('/check-in');
    revalidatePath('/dashboard');
  } catch {}

  return {
    success: true,
    session: atomic.session,
    volunteerId,
    volunteer: volunteerName,
    committee: committeeName,
    shiftDetail,
    message: `Se cerró la salida anterior y se inició la asistencia de hoy para ${volunteerName}.`,
  };
}

// 4. Process Check-out (Turno Completado)
export async function checkOutVolunteer(shiftId: string, options: { confirmShortVisit?: boolean } = {}) {
  try {
    await requireCapability('scan_qr_attendance');
    const supabase = getAdminClient();

    const { data: shift, error: lookupError } = await supabase
      .from('shifts').select('*').eq('id', shiftId).maybeSingle();
    if (lookupError || !shift) return { success: false, error: 'No se encontró el turno para completar.' };

    const sessions = await fetchAllAttendanceSessionsFromDb([shift.day_key]);
    const { data: assigned, error: assignmentError } = await supabase.from('shifts')
      .select('shift_key').eq('volunteer_id', shift.volunteer_id).eq('day_key', shift.day_key);
    if (assignmentError) return { success: false, error: 'No se pudieron consultar los turnos asociados.' };
    const assignedKeys = (assigned || []).map((s: { shift_key: string }) => s.shift_key);
    const related = sessions.filter(session =>
      session.volunteer_id === shift.volunteer_id && session.day_key === shift.day_key &&
      inferShiftsForSession(session.day_key, session.started_at, session.ended_at, assignedKeys).some(s => s.shiftKey === shift.shift_key)
    );
    const active = related.find(session => session.status === 'open');
    if (active) return closeAttendanceSessionAction({ sessionId: active.id, confirmShortVisit: options.confirmShortVisit });
    const completed = related.find(session => session.status === 'completed');
    if (completed) return { success: true, alreadyClosed: true, session: completed };
    if (shift.checked_out) return { success: true, alreadyClosed: true };
    if (needsShortCheckoutConfirmation(shift.checked_in_at) && !options.confirmShortVisit) {
      return {
        success: false,
        requiresShortVisitConfirmation: true,
        error: 'Este turno lleva menos de una hora. Verifica que no sea un doble escaneo y confirma la salida de forma explícita.',
      };
    }

    const { data: updatedShift, error } = await supabase
      .from('shifts')
      .update({
        checked_in: true,
        checked_out: true,
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .select('*')
      .maybeSingle();

    if (error || !updatedShift) {
      console.error("Error in checkOutVolunteer:", error);
      return { success: false, error: error?.message || 'No se pudo guardar la salida.' };
    }

    if (updatedShift) {
      broadcastShiftSync({
        eventType: 'UPDATE',
        table: 'shifts',
        record: updatedShift,
      });
    }

    try {
      revalidatePath('/shifts');
      revalidatePath('/check-in');
      revalidatePath('/reports');
      revalidatePath('/volunteers');
      revalidatePath('/dashboard');
    } catch {}

    return { success: true, message: "Turno completado exitosamente." };
  } catch (err: any) {
    console.error("Error completing shift:", err);
    return { error: err.message || "Error al completar el turno" };
  }
}

// 4c. Ajustar hora de salida (alerta de siguiente día)
export async function adjustCheckoutTimeAction({
  shiftId,
  newCheckOutIso,
  reason
}: {
  shiftId: string;
  newCheckOutIso: string;
  reason?: string;
}) {
  try {
    const authorizedActor = await requireCapability('correct_attendance_times');
    const supabase = getAdminClient();

    const { data: shift, error: fetchErr } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', shiftId)
      .maybeSingle();

    if (fetchErr || !shift) {
      return { error: "No se encontró el registro del turno para ajustar." };
    }

    const { data: updatedShift, error: updateErr } = await supabase
      .from('shifts')
      .update({
        checked_in: true,
        checked_out: true,
        checked_out_at: newCheckOutIso
      })
      .eq('id', shiftId)
      .select('*')
      .maybeSingle();

    if (updateErr) {
      return { error: updateErr.message };
    }

    if (updatedShift) {
      broadcastShiftSync({
        eventType: 'UPDATE',
        table: 'shifts',
        record: updatedShift,
      });
    }

    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', shift.volunteer_id)
      .maybeSingle();

    const volName = vol
      ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim()
      : 'Voluntario';

    const oldDateStr = shift.checked_out_at
      ? new Date(shift.checked_out_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true })
      : 'Desconocido';
    const newDateStr = new Date(newCheckOutIso).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true });

    await createActivityLog({
      userName: authorizedActor.name,
      userRole: roleDisplayName(authorizedActor),
      actionType: 'Edición',
      description: `Ajustó hora de salida de ${volName} (${shift.day_key} ${shift.shift_key}): de ${oldDateStr} a ${newDateStr}`,
      details: reason ? `Motivo: ${reason}` : 'Ajuste de marcación de salida al mismo día',
      targetId: shift.volunteer_id
    });

    try {
      revalidatePath('/shifts');
      revalidatePath('/reports');
      revalidatePath('/volunteers');
    } catch {}

    return { success: true, message: `Hora de salida ajustada exitosamente a las ${newDateStr}` };
  } catch (err: any) {
    console.error("Error adjusting checkout time:", err);
    return { error: err.message || "Error al ajustar hora de salida" };
  }
}

// 4b. Reassign a shift to a new day and shift key
export async function reassignVolunteerShift(shiftId: string, newDayKey: string, newShiftKey: string) {
  try {
    if (!isShiftAvailableForDay(newDayKey, newShiftKey)) {
      return { error: 'La jornada del 5 de septiembre solo permite T1 (9:00 AM - 2:00 PM).' };
    }
    const supabase = getAdminClient();
    const { data: existingShift } = await supabase
      .from('shifts')
      .select('volunteer_id, day_key, shift_key')
      .eq('id', shiftId)
      .maybeSingle();
    if (!existingShift?.volunteer_id) return { error: 'No se encontró el turno.' };
    const authorizedActor = await requireVolunteerCapability('reschedule_volunteer', existingShift.volunteer_id);
    const { data, error } = await supabase
      .from('shifts')
      .update({
        day_key: newDayKey,
        shift_key: newShiftKey,
      })
      .eq('id', shiftId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error("Error in reassignVolunteerShift:", error);
      return { error: error.message };
    }

    if (data) {
      broadcastShiftSync({
        eventType: 'UPDATE',
        table: 'shifts',
        record: data,
      });
    }

    const { data: volunteer } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', existingShift.volunteer_id)
      .maybeSingle();
    const volunteerName = volunteer
      ? `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim()
      : 'Voluntario';
    const auditCreated = await createActivityLog({
      userName: authorizedActor.name,
      userRole: roleDisplayName(authorizedActor),
      actionType: 'Reasignación',
      description: `Reagendó el turno de ${volunteerName}`,
      details: JSON.stringify({
        context: `De ${existingShift.day_key} ${existingShift.shift_key} a ${newDayKey} ${newShiftKey}`,
        shiftId,
        volunteerId: existingShift.volunteer_id,
        previous: { dayKey: existingShift.day_key, shiftKey: existingShift.shift_key },
        next: { dayKey: newDayKey, shiftKey: newShiftKey },
      }),
      targetId: existingShift.volunteer_id,
    });

    if (!auditCreated) {
      const { error: rollbackError } = await supabase
        .from('shifts')
        .update({ day_key: existingShift.day_key, shift_key: existingShift.shift_key })
        .eq('id', shiftId);
      if (rollbackError) console.error('Error rolling back unaudited shift reassignment:', rollbackError);
      return { error: 'No se pudo registrar la auditoría; la reasignación fue cancelada.' };
    }

    try {
      revalidatePath('/shifts');
    } catch {}

    return { success: true, shift: data };
  } catch (err: any) {
    console.error("Error reassigning shift:", err);
    return { error: err.message || "Error al reasignar el turno" };
  }
}

/** Server clock and permission-scoped records define today's shared history. */
export async function getCurrentAttendanceHistoryAction() {
  const now = new Date();
  const date = getGuatemalaDate(now);
  const dayKey = getGuatemalaDayKey(now);
  const logs = await getHistoricalAttendanceLogs(150, dayKey);
  return { date, dayKey, logs };
}

// 5. Fetch Historical Attendance Logs across all days from Supabase DB
export async function getHistoricalAttendanceLogs(limit = 150, dayKey?: string) {
  try {
    const actor = await requireCapability('scan_qr_attendance');
    const supabase = getAdminClient();
    const canViewAll = hasCapability(actor, 'view_all_volunteers');
    if (!canViewAll && !actor.committeeId) return [];
    const maxRows = Math.min(Math.max(limit, 1), 500);
    const selection = `id, volunteer_id, day_key, shift_key, checked_in, checked_out,
      checked_in_at, checked_out_at, volunteers!inner(id, first_name, last_name, committee_id, committees(name))`;
    let legacyQuery = supabase
      .from('shifts')
      .select(selection)
      .eq('checked_in', true)
      .order('checked_in_at', { ascending: false, nullsFirst: false })
      .limit(maxRows);
    let sessionsQuery = supabase.from('attendance_sessions')
      .select('*, volunteers!inner(committee_id)')
      .order('started_at', { ascending: false }).limit(maxRows);
    if (!canViewAll) {
      legacyQuery = legacyQuery.eq('volunteers.committee_id', actor.committeeId);
      sessionsQuery = sessionsQuery.eq('volunteers.committee_id', actor.committeeId);
    }
    // Today's shared view must not be truncated by the historical 150-row limit.
    // Paginate read-only queries with the same server-side committee scope.
    const scopeDay = (query: any) => {
      let scoped = query.eq('day_key', dayKey).order('id');
      if (!canViewAll) scoped = scoped.eq('volunteers.committee_id', actor.committeeId);
      return scoped;
    };
    const [legacyResult, sessionResult] = dayKey
      ? await Promise.all([
          fetchAllRowsStrict(supabase, 'shifts', selection, query => scopeDay(query).eq('checked_in', true)).then(data => ({ data, error: null })),
          fetchAllRowsStrict<AttendanceSession>(supabase, 'attendance_sessions', '*, volunteers!inner(committee_id)', scopeDay).then(data => ({ data, error: null })),
        ])
      : await Promise.all([legacyQuery, sessionsQuery]);
    if (legacyResult.error) throw legacyResult.error;
    if (sessionResult.error) throw sessionResult.error;
    const sessions: AttendanceSession[] = sessionResult.data || [];
    let assignments: any[] = [];
    if (sessions.length && dayKey) {
      assignments = await fetchAllRowsStrict(supabase, 'shifts', selection, scopeDay);
    } else if (sessions.length) {
      let assignmentsQuery = supabase.from('shifts').select(selection)
        .in('volunteer_id', [...new Set(sessions.map(s => s.volunteer_id))])
        .in('day_key', [...new Set(sessions.map(s => s.day_key))]);
      if (!canViewAll) assignmentsQuery = assignmentsQuery.eq('volunteers.committee_id', actor.committeeId);
      const result = await assignmentsQuery;
      if (result.error) throw result.error;
      assignments = result.data || [];
    }
    const formatEntry = (s: any, session?: AttendanceSession) => {
      const vol = s.volunteers;
      const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : "Voluntario";
      const commName = vol?.committees?.name || "Sin comité";
      return {
        id: s.id,
        sessionId: session?.id,
        volunteerId: s.volunteer_id || vol?.id,
        volunteer: volName || "Voluntario",
        committee: commName,
        shiftDetail: `${s.day_key} - ${s.shift_key}`,
        dayKey: s.day_key,
        shiftKey: s.shift_key,
        timestamp: session?.started_at || s.checked_in_at || new Date().toISOString(),
        type: 'success' as const,
        isCompleted: session ? Boolean(getSessionShiftCompletedAt(
          s.day_key, s.shift_key, session.started_at, session.ended_at,
          assignments.filter(shift => shift.volunteer_id === session.volunteer_id && shift.day_key === session.day_key).map(shift => shift.shift_key),
        )) : Boolean(s.checked_out || s.checked_out_at)
      };
    };
    const entries = new Map<string, ReturnType<typeof formatEntry>>();
    for (const shift of legacyResult.data || []) entries.set(shift.id, formatEntry(shift));
    // Newest session wins within each state; an open session takes precedence.
    const sessionEntries = new Map<string, ReturnType<typeof formatEntry>>();
    for (const session of [...sessions].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())) {
      const assigned = assignments.filter(s => s.volunteer_id === session.volunteer_id && s.day_key === session.day_key);
      const related = new Set(inferShiftsForSession(session.day_key, session.started_at, session.ended_at, assigned.map(s => s.shift_key)).map(s => s.shiftKey));
      for (const shift of assigned.filter(s => related.has(s.shift_key))) {
        const previous = sessionEntries.get(shift.id);
        if (!previous || (previous.isCompleted && session.status === 'open')) {
          sessionEntries.set(shift.id, formatEntry(shift, session));
        }
      }
    }
    for (const [id, entry] of sessionEntries) entries.set(id, entry);
    const sorted = [...entries.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return dayKey ? sorted : sorted.slice(0, maxRows);
  } catch (err) {
    console.error("Error in getHistoricalAttendanceLogs:", err);
    throw new Error('No se pudo actualizar el historial de asistencia. Intenta de nuevo.');
  }
}
