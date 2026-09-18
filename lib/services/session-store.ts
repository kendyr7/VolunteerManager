import { getAdminSupabase } from "@/lib/supabase/admin";
import { AttendanceSession, AttendanceExitDecision, AttendanceKind } from "@/lib/session-utils";
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

// In-memory session store used ONLY when explicitly running tests
const memorySessionStore = new Map<string, AttendanceSession>();

type AttendanceDecisionRow = {
  session_id: string;
  intended_shift_keys: string[];
  attendance_kind: AttendanceKind;
  exit_decision: AttendanceExitDecision | null;
  reason_code: string;
  explanation: string;
  hide_alert: boolean;
};

function applyDecision(session: AttendanceSession, decision?: AttendanceDecisionRow): AttendanceSession {
  if (!decision) return session;
  return {
    ...session,
    intended_shift_keys: decision.intended_shift_keys,
    attendance_kind: decision.attendance_kind,
    exit_decision: decision.exit_decision,
    decision_reason_code: decision.reason_code,
    decision_explanation: decision.explanation,
    decision_hides_alert: decision.hide_alert,
  };
}

async function enrichSessionsWithDecisions(
  supabase: Awaited<ReturnType<typeof getAdminSupabase>>,
  sessions: AttendanceSession[],
): Promise<AttendanceSession[]> {
  if (sessions.length === 0) return sessions;

  // PostgREST serializes `.in()` as a query-string value. Loading the complete
  // event in one request can exceed the URL limit and Supabase then reports an
  // unhelpful `{ message: "" }` network error. Keep each request comfortably
  // below that limit while still reading the decisions as one logical snapshot.
  const decisionsData: AttendanceDecisionRow[] = [];
  const sessionIds = [...new Set(sessions.map(session => session.id))];
  const decisionBatchSize = 100;
  for (let start = 0; start < sessionIds.length; start += decisionBatchSize) {
    const batch = sessionIds.slice(start, start + decisionBatchSize);
    const { data, error } = await supabase
      .from('attendance_session_decisions')
      .select('session_id, intended_shift_keys, attendance_kind, exit_decision, reason_code, explanation, hide_alert')
      .in('session_id', batch);

    // During local review the migration may intentionally still be pending.
    // Preserve the existing resolution-based read path in that state. Other
    // failures must remain visible so we never present undecided data as final.
    if (error) {
      if (isMissingDecisionInfrastructure(error)) return sessions;
      const detail = [error.message, error.details, error.hint].find(value => value?.trim());
      throw new Error(detail || `No se pudieron cargar las decisiones de asistencia (${error.code || 'sin código'}).`);
    }
    decisionsData.push(...((data || []) as AttendanceDecisionRow[]));
  }

  const decisions = new Map(
    decisionsData.map(decision => [decision.session_id, decision]),
  );
  return sessions.map(session => applyDecision(session, decisions.get(session.id)));
}

export function isTestMode(): boolean {
  return (
    process.env.USE_TEST_SESSION_STORE === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

export async function fetchAllAttendanceSessionsFromDb(
  dayKeys?: string[],
  committeeId?: string | null
): Promise<AttendanceSession[]> {
  if (isTestMode()) {
    return Array.from(memorySessionStore.values());
  }

  try {
    const supabase = await getAdminSupabase();
    const sessions = await fetchAllRowsStrict<AttendanceSession>(
      supabase,
      'attendance_sessions',
      committeeId ? '*, volunteers!inner(committee_id)' : '*',
      query => {
        let scoped = query.order('started_at', { ascending: false }).order('id', { ascending: false });
        if (dayKeys?.length) scoped = scoped.in('day_key', dayKeys);
        if (committeeId) scoped = scoped.eq('volunteers.committee_id', committeeId);
        return scoped;
      },
    );
    const enriched = await enrichSessionsWithDecisions(supabase, sessions);
    enriched.forEach((session) => memorySessionStore.set(session.id, session));
    return enriched;
  } catch (e: any) {
    console.error("[SESSION STORE] Exception fetching attendance sessions:", e?.message);
    throw e;
  }

  return [];
}

export async function getOpenSessionForVolunteer(volunteerId: string): Promise<AttendanceSession | null> {
  if (isTestMode()) {
    for (const s of memorySessionStore.values()) {
      if (s.volunteer_id === volunteerId && s.status === 'open') {
        return s;
      }
    }
    return null;
  }

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .eq('status', 'open')
      .maybeSingle();

    if (error) {
      console.error("[SESSION STORE] Error checking open session in DB:", error.message);
      throw new Error('No se pudo verificar si existe una sesión abierta. Intenta de nuevo.');
    }

    if (data) {
      const [enriched] = await enrichSessionsWithDecisions(supabase, [data as AttendanceSession]);
      memorySessionStore.set(enriched.id, enriched);
      return enriched;
    }
    for (const [id, cached] of memorySessionStore) {
      if (cached.volunteer_id === volunteerId && cached.status === 'open') memorySessionStore.delete(id);
    }
    return null;
  } catch (e: any) {
    console.error("[SESSION STORE] Exception checking open session:", e?.message);
    throw e;
  }

}

export async function saveAttendanceSession(session: AttendanceSession): Promise<AttendanceSession> {
  if (isTestMode()) {
    memorySessionStore.set(session.id, session);
    return session;
  }

  // Real App Mode: MUST persist to Supabase DB or throw Error!
  const supabase = await getAdminSupabase();
  const { data, error } = await supabase
    .from('attendance_sessions')
    .upsert(session, { onConflict: 'id' })
    .select('*')
    .single();

  if (error || !data) {
    const errMsg = error ? error.message : "Error al guardar en Supabase";
    console.error("[SESSION STORE][CRITICAL] Persistence failed:", errMsg);
    throw new Error(`Error de persistencia: no se pudo guardar la sesión de asistencia en la base de datos (${errMsg}).`);
  }

  memorySessionStore.set(data.id, data);
  return data;
}

function isMissingDecisionInfrastructure(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '42883'
    || error?.code === 'PGRST202'
    || error?.code === '42P01'
    || Boolean(error?.message?.includes('attendance_session_decisions'));
}

export type AttendanceDecisionActor = {
  id?: string | null;
  name: string;
  role: string;
};

export async function openAttendanceSessionWithDecisionInDb(input: {
  sessionId: string;
  volunteerId: string;
  dayKey: string;
  startedAt: string;
  intendedShiftKeys: string[];
  attendanceKind: AttendanceKind;
  reasonCode: string;
  explanation?: string;
  actor: AttendanceDecisionActor;
  idempotencyKey: string;
}): Promise<{ success: boolean; session?: AttendanceSession; alreadyOpen?: boolean; infrastructureMissing?: boolean; error?: string }> {
  const baseSession: AttendanceSession = {
    id: input.sessionId,
    volunteer_id: input.volunteerId,
    day_key: input.dayKey,
    started_at: input.startedAt,
    ended_at: null,
    status: 'open',
    auto_closed: false,
    created_at: input.startedAt,
    updated_at: input.startedAt,
    intended_shift_keys: input.intendedShiftKeys,
    attendance_kind: input.attendanceKind,
    decision_reason_code: input.reasonCode,
    decision_explanation: input.explanation || '',
    decision_hides_alert: true,
  };
  if (isTestMode()) {
    const existing = await getOpenSessionForVolunteer(input.volunteerId);
    if (existing) return { success: true, session: existing, alreadyOpen: true };
    memorySessionStore.set(baseSession.id, baseSession);
    return { success: true, session: baseSession, alreadyOpen: false };
  }

  const supabase = await getAdminSupabase();
  const { data, error } = await supabase.rpc('open_attendance_session_with_decision', {
    p_session_id: input.sessionId,
    p_volunteer_id: input.volunteerId,
    p_day_key: input.dayKey,
    p_started_at: input.startedAt,
    p_intended_shift_keys: input.intendedShiftKeys,
    p_attendance_kind: input.attendanceKind,
    p_reason_code: input.reasonCode,
    p_explanation: input.explanation || '',
    p_actor_id: input.actor.id || null,
    p_actor_name: input.actor.name,
    p_actor_role: input.actor.role,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    return {
      success: false,
      infrastructureMissing: isMissingDecisionInfrastructure(error),
      error: error.message,
    };
  }
  const payload = data as { session?: AttendanceSession; alreadyOpen?: boolean } | null;
  if (!payload?.session) return { success: false, error: 'La base de datos no devolvió la sesión creada.' };
  const session: AttendanceSession = payload.session.id === input.sessionId ? {
    ...payload.session,
    intended_shift_keys: input.intendedShiftKeys,
    attendance_kind: input.attendanceKind,
    decision_reason_code: input.reasonCode,
    decision_explanation: input.explanation || '',
    decision_hides_alert: true,
  } : payload.session;
  memorySessionStore.set(session.id, session);
  return { success: true, session, alreadyOpen: Boolean(payload.alreadyOpen) };
}

export async function closeAttendanceSessionWithDecisionInDb(input: {
  session: AttendanceSession;
  endedAt: string;
  intendedShiftKeys: string[];
  exitDecision: AttendanceExitDecision;
  reasonCode: string;
  explanation?: string;
  actor: AttendanceDecisionActor;
}): Promise<{ success: boolean; session?: AttendanceSession; alreadyClosed?: boolean; infrastructureMissing?: boolean; error?: string }> {
  if (isTestMode()) {
    const result = await completeOpenAttendanceSessionInDb(input.session.id, input.endedAt, false);
    if (result.session) {
      result.session = {
        ...result.session,
        intended_shift_keys: input.intendedShiftKeys,
        exit_decision: input.exitDecision,
        decision_reason_code: input.reasonCode,
        decision_explanation: input.explanation || '',
        decision_hides_alert: true,
      };
      memorySessionStore.set(result.session.id, result.session);
    }
    return result;
  }

  const supabase = await getAdminSupabase();
  const { data, error } = await supabase.rpc('close_attendance_session_with_decision', {
    p_session_id: input.session.id,
    p_volunteer_id: input.session.volunteer_id,
    p_ended_at: input.endedAt,
    p_intended_shift_keys: input.intendedShiftKeys,
    p_exit_decision: input.exitDecision,
    p_reason_code: input.reasonCode,
    p_explanation: input.explanation || '',
    p_actor_id: input.actor.id || null,
    p_actor_name: input.actor.name,
    p_actor_role: input.actor.role,
  });
  if (error) {
    return {
      success: false,
      infrastructureMissing: isMissingDecisionInfrastructure(error),
      error: error.message,
    };
  }
  const payload = data as { session?: AttendanceSession; alreadyClosed?: boolean } | null;
  if (!payload?.session) return { success: false, error: 'La base de datos no devolvió la sesión finalizada.' };
  const session: AttendanceSession = {
    ...payload.session,
    intended_shift_keys: input.intendedShiftKeys,
    exit_decision: input.exitDecision,
    decision_reason_code: input.reasonCode,
    decision_explanation: input.explanation || '',
    decision_hides_alert: true,
  };
  memorySessionStore.set(session.id, session);
  return { success: true, session, alreadyClosed: Boolean(payload.alreadyClosed) };
}

export async function resolveStaleAndOpenAttendanceInDb(input: {
  previousSession: AttendanceSession;
  previousEndedAt: string;
  previousShiftKeys: string[];
  newSessionId: string;
  newDayKey: string;
  newStartedAt: string;
  newShiftKeys: string[];
  newAttendanceKind: AttendanceKind;
  actor: AttendanceDecisionActor;
  idempotencyKey: string;
}): Promise<{ success: boolean; session?: AttendanceSession; infrastructureMissing?: boolean; error?: string }> {
  if (isTestMode()) {
    const closed = await completeOpenAttendanceSessionInDb(input.previousSession.id, input.previousEndedAt, true);
    if (!closed.success) return closed;
    return openAttendanceSessionWithDecisionInDb({
      sessionId: input.newSessionId,
      volunteerId: input.previousSession.volunteer_id,
      dayKey: input.newDayKey,
      startedAt: input.newStartedAt,
      intendedShiftKeys: input.newShiftKeys,
      attendanceKind: input.newAttendanceKind,
      reasonCode: 'stale_resolved_then_checkin',
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
    });
  }

  const supabase = await getAdminSupabase();
  const { data, error } = await supabase.rpc('resolve_stale_and_open_attendance', {
    p_previous_session_id: input.previousSession.id,
    p_new_session_id: input.newSessionId,
    p_volunteer_id: input.previousSession.volunteer_id,
    p_previous_ended_at: input.previousEndedAt,
    p_new_day_key: input.newDayKey,
    p_new_started_at: input.newStartedAt,
    p_previous_shift_keys: input.previousShiftKeys,
    p_new_shift_keys: input.newShiftKeys,
    p_new_attendance_kind: input.newAttendanceKind,
    p_actor_id: input.actor.id || null,
    p_actor_name: input.actor.name,
    p_actor_role: input.actor.role,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    return {
      success: false,
      infrastructureMissing: isMissingDecisionInfrastructure(error),
      error: error.message,
    };
  }
  const payload = data as { session?: AttendanceSession } | null;
  if (!payload?.session) return { success: false, error: 'La base de datos no devolvió la nueva sesión.' };
  const session: AttendanceSession = {
    ...payload.session,
    intended_shift_keys: input.newShiftKeys,
    attendance_kind: input.newAttendanceKind,
    decision_reason_code: 'stale_resolved_then_checkin',
    decision_hides_alert: true,
  };
  memorySessionStore.set(session.id, session);
  return { success: true, session };
}

export function resetMemorySessionStore(): void {
  memorySessionStore.clear();
}

/**
 * ATOMIC CONDITIONAL UPDATE: Complete an open session WHERE id = sessionId AND status = 'open'.
 * Protects against race conditions between Admin exit correction and QR scanner check-out.
 */
export async function completeOpenAttendanceSessionInDb(
  sessionId: string,
  endedAtIso: string,
  autoClosed = false
): Promise<{ success: boolean; session?: AttendanceSession; alreadyClosed?: boolean; error?: string }> {
  if (isTestMode()) {
    const existing = memorySessionStore.get(sessionId);
    if (!existing) {
      return { success: false, error: "Sesión no encontrada." };
    }
    if (existing.status === 'completed' && existing.ended_at) {
      return { success: true, alreadyClosed: true, session: existing };
    }
    const updated: AttendanceSession = {
      ...existing,
      ended_at: endedAtIso,
      status: 'completed',
      auto_closed: autoClosed,
      updated_at: new Date().toISOString()
    };
    memorySessionStore.set(sessionId, updated);
    return { success: true, session: updated };
  }

  const supabase = await getAdminSupabase();
  const nowIso = new Date().toISOString();

  // ATOMIC CONDITIONAL UPDATE: WHERE id = sessionId AND status = 'open'
  const { data, error } = await supabase
    .from('attendance_sessions')
    .update({
      ended_at: endedAtIso,
      status: 'completed',
      auto_closed: autoClosed,
      updated_at: nowIso,
    })
    .eq('id', sessionId)
    .eq('status', 'open')
    .select('*');

  if (!error && data && data.length > 0) {
    const updatedSession = data[0] as AttendanceSession;
    memorySessionStore.set(updatedSession.id, updatedSession);
    return { success: true, session: updatedSession };
  }

  // If 0 rows were updated, check if it was already completed (Concurrency protection)!
  const { data: existing } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (existing && existing.status === 'completed') {
    memorySessionStore.set(existing.id, existing);
    return { success: true, alreadyClosed: true, session: existing as AttendanceSession };
  }

  return { success: false, error: error?.message || "No se pudo actualizar la sesión de asistencia." };
}

/**
 * Checks if a proposed session interval [startedAt, endedAt] overlaps with any existing session for the volunteer.
 * Overlap formula: max(N_start, E_start) < min(N_end, E_end)
 */
export async function checkSessionOverlapInDb(
  volunteerId: string,
  startedAtIso: string,
  endedAtIso?: string | null,
  excludeSessionId?: string
): Promise<{ hasOverlap: boolean; overlappingSession?: AttendanceSession }> {
  const allSessions = await fetchAllAttendanceSessionsFromDb();
  const volSessions = allSessions.filter(s => s.volunteer_id === volunteerId && s.id !== excludeSessionId);

  const newStartMs = new Date(startedAtIso).getTime();
  const newEndMs = endedAtIso ? new Date(endedAtIso).getTime() : Date.now();

  for (const exist of volSessions) {
    const existStartMs = new Date(exist.started_at).getTime();
    const existEndMs = exist.ended_at ? new Date(exist.ended_at).getTime() : Date.now();

    const overlapStart = Math.max(newStartMs, existStartMs);
    const overlapEnd = Math.min(newEndMs, existEndMs);

    if (overlapStart < overlapEnd) {
      return { hasOverlap: true, overlappingSession: exist };
    }
  }

  return { hasOverlap: false };
}
