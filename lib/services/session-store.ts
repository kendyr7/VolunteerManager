import { getAdminSupabase } from "@/lib/supabase/admin";
import { AttendanceSession } from "@/lib/session-utils";

// In-memory session store used ONLY when explicitly running tests
const memorySessionStore = new Map<string, AttendanceSession>();

export function isTestMode(): boolean {
  return (
    process.env.USE_TEST_SESSION_STORE === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

export async function fetchAllAttendanceSessionsFromDb(): Promise<AttendanceSession[]> {
  if (isTestMode()) {
    return Array.from(memorySessionStore.values());
  }

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (error) {
      console.error("[SESSION STORE] Error fetching attendance sessions from DB:", error.message);
      return Array.from(memorySessionStore.values());
    }

    if (data) {
      data.forEach((s: AttendanceSession) => memorySessionStore.set(s.id, s));
      return data;
    }
  } catch (e: any) {
    console.error("[SESSION STORE] Exception fetching attendance sessions:", e?.message);
  }

  return Array.from(memorySessionStore.values());
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
    }

    if (data) {
      memorySessionStore.set(data.id, data);
      return data;
    }
  } catch (e: any) {
    console.error("[SESSION STORE] Exception checking open session:", e?.message);
  }

  // Fallback to in-memory cache if available, but check DB first
  for (const s of memorySessionStore.values()) {
    if (s.volunteer_id === volunteerId && s.status === 'open') {
      return s;
    }
  }

  return null;
}

export async function saveAttendanceSession(session: AttendanceSession): Promise<AttendanceSession> {
  // Always update local cache
  memorySessionStore.set(session.id, session);

  if (isTestMode()) {
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
