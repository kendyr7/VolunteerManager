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
