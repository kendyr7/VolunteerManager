'use server'

import { createActivityLog } from "./activity-actions";
import { getAdminClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { revalidatePath } from "next/cache";
import { broadcastShiftSync, broadcastSessionSync } from "@/lib/services/shift-broadcast.service";
import { requireCapability, requireVolunteerCapability, requireVolunteerSelfOrCapability } from "@/lib/authorization";
import { hasCapability, roleDisplayName } from "@/lib/role-permissions";
import { getOfficialShiftTime, isShiftAvailableForDay, isSimulationEventDay } from "@/lib/dates";
import { buildEventDayKeys } from '@/lib/coordinator-data';
import { AttendanceSession, getGuatemalaHourFloat, getContinuousScheduledBlockForSession, requiresSessionExitResolution, inferShiftsForSession, validateSessionConstraints } from "@/lib/session-utils";
import {
  saveAttendanceSession,
  getOpenSessionForVolunteer,
  fetchAllAttendanceSessionsFromDb,
  completeOpenAttendanceSessionInDb,
} from "@/lib/services/session-store";
import { createEntryPassPayload, validateEntryPassQrValue } from "@/lib/entry-pass";
import { fetchAllRowsStrict } from '@/lib/supabase-helpers';

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

// Parse day key to the instant representing the end of the shift in Guatemala.
function parseShiftDateTime(dayKey: string, shiftKey: string): Date {
  const dayNumPart = dayKey.split(' ')[1];
  const dayNum = parseInt(dayNumPart) || 10; // Fallback to 10
  
  const official = getOfficialShiftTime(dayKey, shiftKey);
  const endHour = official.endHour;

  // Guatemala is six hours behind the zero-offset reference used by Date.UTC.
  const utcMillis = Date.UTC(2026, 8, dayNum, Math.floor(endHour) + 6, Math.round((endHour % 1) * 60), 0);
  return new Date(utcMillis);
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

// 2. Recalculate Reliability Score
export async function recalculateReliability(volunteerId: string) {
  const supabase = getAdminClient();

  // Fetch all shifts for the volunteer
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  if (error || !shifts || shifts.length === 0) {
    return;
  }

  const now = new Date();
  let numerator = 0;   // Checked in shifts
  let denominator = 0; // Completed shifts (passed or checked in)

  for (const s of shifts) {
    if (isSimulationEventDay(s.day_key)) continue;
    const shiftEndTime = parseShiftDateTime(s.day_key, s.shift_key);

    if (s.checked_in) {
      numerator++;
      denominator++;
    } else if (now > shiftEndTime) {
      // Shift passed, and was not checked in (absent)
      // Note: we can skip replaced shifts if there was status.
      // In this database, shifts table has no status column, only shifts.
      // So if it exists in shifts and time passed without checkin, they missed it.
      denominator++;
    }
  }

  if (denominator > 0) {
    const score = Math.round((numerator / denominator) * 100);
    await supabase
      .from('volunteers')
      .update({ reliability_score: score })
      .eq('id', volunteerId);
  }
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
  dayKeyInput?: string,
  isInternalCall = false
) {
  await requireCapability('scan_qr_attendance');
  // Server-generated Guatemala time & day_key (never trust client timestamp/dayKey for check-in)
  const guatemalaString = new Date().toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaNow = new Date(guatemalaString);
  const serverDayKey = format(guatemalaNow, "EEE d", { locale: es }).toLowerCase();
  const dayKey = isInternalCall ? serverDayKey : (dayKeyInput || serverDayKey);

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

  const saved = await saveAttendanceSession(sessionRecord);

  // Broadcast realtime event
  await broadcastSessionSync({
    eventType: 'INSERT',
    table: 'attendance_sessions',
    record: saved,
  });

  // Audit Log in activity_logs with JSON payload
  try {
    const supabase = getAdminClient();
    const { getCurrentUserSession } = await import('@/lib/auth-helpers');
    const actor = await getCurrentUserSession();
    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', volunteerId)
      .maybeSingle();

    const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';

    await supabase.from('activity_logs').insert({
      user_name: actor.userName || 'Coordinador',
      user_role: actor.userRole || 'Editor',
      action_type: 'Check-in',
      description: `Inició sesión de asistencia de ${volName}`,
      details: JSON.stringify({
        sessionId: saved.id,
        volunteerId,
        startedAt: saved.started_at,
        dayKey: saved.day_key
      }),
      target_id: volunteerId
    });
  } catch {}

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
  actorNameInput,
  actorRoleInput
}: {
  sessionId?: string;
  volunteerId?: string;
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

  const previousEndedAt = sessionToClose.ended_at;
  // ENFORCE SERVER TIMESTAMP FOR NORMAL CHECKOUT (Rejects client-supplied endedAt)
  const newEndedAt = new Date().toISOString();

  const atomicRes = await completeOpenAttendanceSessionInDb(sessionToClose.id, newEndedAt, false);
  if (!atomicRes.success) {
    return { success: false, error: atomicRes.error || 'No se pudo guardar la salida. Intenta de nuevo.' };
  }
  if (atomicRes.alreadyClosed) {
    return {
      success: true,
      alreadyClosed: true,
      session: atomicRes.session || sessionToClose,
      message: "La sesión ya fue finalizada previamente."
    };
  }

  const saved = atomicRes.session!;

  // Broadcast realtime event
  await broadcastSessionSync({
    eventType: 'UPDATE',
    table: 'attendance_sessions',
    record: saved,
  });

  // Audit Log in activity_logs with JSON payload
  try {
    const supabase = getAdminClient();
    const { data: vol } = await supabase
      .from('volunteers')
      .select('first_name, last_name')
      .eq('id', saved.volunteer_id)
      .maybeSingle();

    const volName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : 'Voluntario';

    await supabase.from('activity_logs').insert({
      user_name: actorName,
      user_role: actorRole,
      action_type: 'Check-out',
      description: `Finalizó sesión de asistencia de ${volName}`,
      details: JSON.stringify({
        sessionId: saved.id,
        volunteerId: saved.volunteer_id,
        previousEndedAt,
        newEndedAt: saved.ended_at
      }),
      target_id: saved.volunteer_id
    });
  } catch (e) {}

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
  const session = await getOpenSessionForVolunteer(volunteerId);
  return { success: true, session };
}

// 3.5. Fetch Volunteer Attendance Sessions Action (Safe for Client Components)
export async function fetchVolunteerAttendanceSessionsAction(volunteerId: string) {
  try {
    const all = await fetchAllAttendanceSessionsFromDb();
    const volunteerSessions = all.filter(s => s.volunteer_id === volunteerId);
    return { success: true, sessions: volunteerSessions };
  } catch (e: any) {
    return { success: false, error: e?.message || "Error al cargar sesiones", sessions: [] };
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
  await requireCapability('correct_attendance_times');
  let finalReason = (rawReason || '').trim();
  if (correctionType === 'official_shift_end') {
    finalReason = "Salida olvidada - se utilizó el fin oficial del bloque programado";
  } else if (correctionType === 'forgotten_entry_late_scan') {
    finalReason = finalReason || "Corrección de entrada olvidada sobre escaneo tardío de salida";
  } else {
    if (!finalReason || finalReason.length < 5) {
      throw new Error("Se requiere especificar un motivo de al menos 5 caracteres para realizar la corrección.");
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
    throw new Error(constraintCheck.error || "Ajuste de horario inválido.");
  }

  // Check no future timestamps
  const nowMs = Date.now();
  if (new Date(newStartedAt).getTime() > nowMs) {
    throw new Error("No se puede registrar una hora de entrada en el futuro.");
  }
  if (newEndedAt && new Date(newEndedAt).getTime() > nowMs) {
    throw new Error("No se puede registrar una hora de salida en el futuro.");
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
  const authorizedActor = await requireCapability('register_missing_attendance');
  const { volunteerId, dayKey, startedAt, endedAt, correctionType, reason: rawReason } = input;

  let finalReason = (rawReason || '').trim();
  if (correctionType === 'official_shift_start') {
    finalReason = "Entrada olvidada - se utilizó el inicio oficial del turno/bloque programado";
  } else {
    if (!finalReason || finalReason.length < 5) {
      throw new Error("Se requiere especificar un motivo de al menos 5 caracteres para realizar la corrección.");
    }
  }

  const nowMs = Date.now();
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs) || startMs > nowMs) {
    throw new Error("La hora de entrada no puede ser en el futuro.");
  }

  const newStatus = endedAt ? 'completed' : 'open';

  if (endedAt) {
    const endMs = new Date(endedAt).getTime();
    if (isNaN(endMs) || endMs > nowMs) {
      throw new Error("La hora de salida no puede ser en el futuro.");
    }
    if (endMs < startMs) {
      throw new Error("La hora de salida no puede ser anterior a la hora de entrada.");
    }
  }

  if (newStatus === 'open') {
    const existingOpen = await getOpenSessionForVolunteer(volunteerId);
    if (existingOpen) {
      throw new Error("El voluntario ya posee una sesión activa en turno (OPEN).");
    }
  }

  const { checkSessionOverlapInDb } = require('@/lib/services/session-store');
  const overlapCheck = await checkSessionOverlapInDb(volunteerId, startedAt, endedAt);
  if (overlapCheck.hasOverlap) {
    throw new Error(`El intervalo solicitado se solapa con una sesión existente de este voluntario.`);
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

  return { success: true, session: saved };
}

// 5. Process Check-in via QR Scan or manual selection
export async function checkInVolunteer(qrValueString: string, coordinatorId: string, manualShiftId?: string) {
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
        return { error: "No se encontró el turno seleccionado." };
      }
      volunteerId = shift.volunteer_id;
      await requireVolunteerCapability('scan_qr_attendance', volunteerId);

      const { data: vol } = await supabase
        .from('volunteers')
        .select('*, committees(name)')
        .eq('id', volunteerId)
        .single();

      if (!vol || vol.status === 'archived') {
        return { error: 'Voluntario no disponible para registrar asistencia.' };
      }
      const now = new Date();
      const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guatemala' }));
      const today = format(localNow, 'EEE d', { locale: es }).toLowerCase();
      if (shift.day_key !== today || !buildEventDayKeys().includes(today) || !isShiftAvailableForDay(shift.day_key, shift.shift_key)) {
        return { error: 'La entrada en vivo debe corresponder a un turno de hoy. Para otra fecha utiliza una corrección de asistencia.' };
      }
      if (shift.checked_out || shift.checked_out_at) {
        return { error: 'Este turno ya está completado. Utiliza Reabrir turno si la salida fue un error.' };
      }
      if (await getOpenSessionForVolunteer(volunteerId)) {
        return { error: 'El voluntario ya tiene una sesión abierta. Vuelve a escanear su QR para registrar la salida o resolver la salida pendiente.' };
      }
      const { data: assigned, error: assignedError } = await supabase.from('shifts')
        .select('shift_key').eq('volunteer_id', volunteerId).eq('day_key', today);
      if (assignedError) return { error: 'No se pudieron consultar los turnos asignados.' };
      const assignedKeys = (assigned || []).map((s: { shift_key: string }) => s.shift_key);
      const currentHour = getGuatemalaHourFloat(now);
      const available = assignedKeys.map((key: string) => getOfficialShiftTime(today, key))
        .filter((s: { endHour: number }) => s.endHour > currentHour)
        .sort((a: { startHour: number }, b: { startHour: number }) => a.startHour - b.startHour);
      const eligible = available.filter((s: { startHour: number }) => s.startHour <= currentHour);
      const selectable = eligible.length ? eligible : available.slice(0, 1);
      if (!selectable.some((s: { shiftKey: string }) => s.shiftKey === shift.shift_key)) {
        return { error: 'Selecciona el turno actual o el próximo turno asignado de hoy. Un turno pasado requiere corrección de asistencia.' };
      }

      // Use the same persistence and broadcasts as a normal QR entry. Do not
      // write only legacy shift flags: all consumers need the actual session.
      const opened = await openAttendanceSessionAction(volunteerId, today, true);
      if (!opened.success || !opened.session || opened.alreadyOpen) {
        return { error: 'No se abrió una nueva sesión. Vuelve a escanear para consultar el estado actual.' };
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
      return { error: "Error inesperado al registrar la asistencia." };
    }
  }

  // standard QR scan flow
  const validation = validateEntryPassQrValue(qrValueString);
  if (!validation.success) return { error: validation.error };
  volunteerId = validation.payload.id;

  // Fetch volunteer details
  const { data: volunteer, error: volError } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('id', volunteerId)
    .single();

  if (volError || !volunteer) {
    return { error: "Voluntario no encontrado en el sistema." };
  }
  if (volunteer.status === 'archived') {
    return { error: "El pase QR pertenece a un voluntario archivado." };
  }

  const volunteerName = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim();

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
      // scheduled shift can start. Treating it as a normal same-day checkout
      // creates an active session that none of the operational views can display.
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
        committee: volunteer.committees?.name || "Sin comité",
        message: isOperationalSessionDay
          ? `El voluntario ${volunteerName} tiene una salida pendiente de un bloque anterior (${openSession.day_key}). Resuelve esa salida y vuelve a escanear para iniciar el siguiente turno.`
          : `El voluntario ${volunteerName} posee una sesión abierta fuera del cronograma operativo (${openSession.day_key}).`
      };
    }

    // Same day open session (Caso 5: Segundo QR)
    return {
      success: true,
      action: 'confirm_checkout',
      alreadyOpen: true,
      session: openSession,
      volunteerId,
      volunteer: volunteerName,
      committee: volunteer.committees?.name || "Sin comité",
      message: `El voluntario ${volunteerName} ya posee una sesión activa iniciada a las ${new Date(openSession.started_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true })}.`
    };
  }

  // Load the assignments before opening a session. This keeps the QR flow from
  // creating invisible sessions on dates or hours that do not exist in Turnos.
  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', volunteerId);

  if (shiftsError) {
    return { error: "No se pudieron consultar los turnos asignados del voluntario." };
  }

  const formattedShifts = (shifts || []).map((s: any) => {
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

  const currentHour = getGuatemalaHourFloat(new Date());
  const activeAssignments = (shifts || []).filter((shift: any) => {
    if ((shift.day_key || '').toLowerCase().trim() !== currentDayKey) return false;
    if (!isShiftAvailableForDay(shift.day_key, shift.shift_key)) return false;
    const official = getOfficialShiftTime(shift.day_key, shift.shift_key);
    return currentHour >= official.startHour && currentHour < official.endHour;
  });

  if (!operationalDayKeys.has(currentDayKey) || activeAssignments.length === 0) {
    if (formattedShifts.length === 0) {
      return { error: `${volunteerName} no tiene turnos asignados para registrar asistencia.` };
    }

    return {
      requiresManualSelection: true,
      outsideOperationalDay: !operationalDayKeys.has(currentDayKey),
      volunteerId,
      volunteer: volunteerName,
      committee: volunteer.committees?.name || "Sin comité",
      shifts: formattedShifts,
    };
  }

  // 2. Open new attendance session (Caso 1-3)
  const openRes = await openAttendanceSessionAction(volunteerId, currentDayKey, true);
  if (openRes.success && openRes.session) {
    return {
      success: true,
      action: 'opened',
      session: openRes.session,
      volunteerId,
      volunteer: volunteerName,
      committee: volunteer.committees?.name || "Sin comité",
      shiftDetail: `${openRes.session.day_key} - Sesión Continua`
    };
  }

  return {
    requiresManualSelection: true,
    volunteerId,
    volunteer: `${volunteer.first_name} ${volunteer.last_name}`,
    committee: volunteer.committees?.name || "Sin comité",
    shifts: formattedShifts
  };
}

// 4. Process Check-out (Turno Completado)
export async function checkOutVolunteer(shiftId: string) {
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
    if (active) return closeAttendanceSessionAction({ sessionId: active.id });
    const completed = related.find(session => session.status === 'completed');
    if (completed) return { success: true, alreadyClosed: true, session: completed };
    if (shift.checked_out) return { success: true, alreadyClosed: true };

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
        isCompleted: session ? session.status === 'completed' : Boolean(s.checked_out || s.checked_out_at)
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
