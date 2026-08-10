import { getOfficialShiftTime, OfficialShiftTime } from '@/lib/dates';

export interface AttendanceSession {
  id: string;
  volunteer_id: string;
  day_key: string;
  started_at: string;
  ended_at?: string | null;
  status: 'open' | 'completed';
  auto_closed: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Validates session domain & DB constraints:
 * - status 'completed' requires ended_at
 * - status 'open' requires ended_at to be null
 * - ended_at must be >= started_at
 */
export function validateSessionConstraints(
  startedAt: string | Date,
  endedAt?: string | Date | null,
  status: 'open' | 'completed' = 'open'
): { valid: boolean; error?: string } {
  if (status === 'completed' && !endedAt) {
    return { valid: false, error: "Una sesión completada requiere hora de salida (ended_at IS NOT NULL)." };
  }

  if (status === 'open' && endedAt) {
    return { valid: false, error: "Una sesión abierta no debe tener hora de salida (ended_at IS NULL)." };
  }

  if (endedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(endedAt).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
      return { valid: false, error: "La hora de salida (ended_at) no puede ser anterior a la hora de entrada (started_at)." };
    }
  }

  return { valid: true };
}

/**
 * Calculates Nicaragua local hour float (e.g. 7.5 = 7:30 AM, 17.25 = 5:15 PM)
 */
export function getNicaraguaHourFloat(dateInput: Date | string): number {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  const nicaStr = d.toLocaleString("en-US", { timeZone: "America/Managua" });
  const nicaDate = new Date(nicaStr);
  return nicaDate.getHours() + nicaDate.getMinutes() / 60 + nicaDate.getSeconds() / 3600;
}

/**
 * Mathematical Temporal Intersection Engine between session and assigned shifts
 * max(sessionStartHour, shiftStartHour) < min(sessionEndHour, shiftEndHour)
 */
export function inferShiftsForSession(
  dayKey: string,
  sessionStart: Date | string,
  sessionEnd?: Date | string | null,
  assignedShifts: string[] = ['T1', 'T2', 'T3', 'T4']
): OfficialShiftTime[] {
  if (!sessionStart) return [];

  const sessionStartHour = getNicaraguaHourFloat(sessionStart);

  let sessionEndHour: number;
  if (sessionEnd) {
    sessionEndHour = getNicaraguaHourFloat(sessionEnd);
  } else {
    // For OPEN sessions: evaluate up to CURRENT Nicaragua time
    sessionEndHour = getNicaraguaHourFloat(new Date());
  }

  // Handle midnight wrap if session spans across 24h
  if (sessionEndHour < sessionStartHour && sessionEnd) {
    sessionEndHour += 24;
  }

  const matched: OfficialShiftTime[] = [];

  for (const shiftKey of assignedShifts) {
    const official = getOfficialShiftTime(dayKey, shiftKey);
    const shiftStartHour = official.startHour;
    const shiftEndHour = official.endHour;

    // Intersección temporal exacta: max(sessionStart, shiftStart) < min(sessionEnd, shiftEnd)
    const overlapStart = Math.max(sessionStartHour, shiftStartHour);
    const overlapEnd = Math.min(sessionEndHour, shiftEndHour);

    if (overlapStart < overlapEnd) {
      matched.push(official);
    }
  }

  return matched;
}

/**
 * Calculates exact elapsed worked minutes for a session.
 * For completed sessions: ended_at - started_at in minutes.
 * For open sessions: returns 0 for definitive total (and can provide provisional elapsed).
 */
export function calculateSessionMinutes(
  startedAt: string | Date,
  endedAt?: string | Date | null
): { totalWorkedMinutes: number; provisionalMinutes: number; isClosed: boolean } {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) {
    return { totalWorkedMinutes: 0, provisionalMinutes: 0, isClosed: false };
  }

  if (endedAt) {
    const endMs = new Date(endedAt).getTime();
    if (!isNaN(endMs) && endMs >= startMs) {
      const minutes = Math.round((endMs - startMs) / 60000);
      return { totalWorkedMinutes: minutes, provisionalMinutes: minutes, isClosed: true };
    }
  }

  // Session is OPEN
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - startMs);
  const provisionalMinutes = Math.round(elapsedMs / 60000);

  return { totalWorkedMinutes: 0, provisionalMinutes, isClosed: false };
}

export interface ContinuousScheduledBlock {
  matchedShifts: OfficialShiftTime[];
  startShiftKey: string;
  endShiftKey: string;
  suggestedEndTimeIso: string;
  suggestedEndTimeFormatted: string;
  blockLabel: string;
  durationMinutes: number;
}

/**
 * Calculates continuous scheduled shift block starting from session started_at.
 * Extends ONLY while subsequent shifts overlap or are contiguous (gap <= 30 min).
 * Prevents accrediting non-contiguous evening shifts (e.g. T4) if exit was forgotten on T2.
 */
export function getContinuousScheduledBlockForSession(
  dayKey: string,
  startedAt: string | Date,
  assignedShiftKeys: string[] = []
): ContinuousScheduledBlock | null {
  if (!startedAt || !dayKey || !assignedShiftKeys || assignedShiftKeys.length === 0) {
    return null;
  }

  const { parseDayKeyToDateStr } = require('@/lib/dates');

  // 1. Build official shift times and sort chronologically by startHour
  const shifts: OfficialShiftTime[] = assignedShiftKeys
    .map(key => getOfficialShiftTime(dayKey, key))
    .sort((a, b) => a.startHour - b.startHour);

  if (shifts.length === 0) return null;

  const sessionStartHour = getNicaraguaHourFloat(startedAt);

  // 2. Find the first shift related to startedAt
  let startIdx = -1;

  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i];
    if (sessionStartHour >= s.startHour - 0.75 && sessionStartHour <= s.endHour) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    for (let i = 0; i < shifts.length; i++) {
      const s = shifts[i];
      if (Math.abs(sessionStartHour - s.startHour) <= 1.5) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) return null;

  // 3. Extend block ONLY while subsequent shifts overlap or are contiguous (gap <= 0.5h / 30m)
  const blockShifts: OfficialShiftTime[] = [shifts[startIdx]];
  let currentEndHour = shifts[startIdx].endHour;

  for (let i = startIdx + 1; i < shifts.length; i++) {
    const nextShift = shifts[i];
    if (nextShift.startHour <= currentEndHour + 0.5) {
      blockShifts.push(nextShift);
      currentEndHour = Math.max(currentEndHour, nextShift.endHour);
    } else {
      break;
    }
  }

  const dateStr = parseDayKeyToDateStr(dayKey);

  const endH = Math.floor(currentEndHour);
  const endM = Math.round((currentEndHour - endH) * 60);
  const endHStr = String(endH).padStart(2, '0');
  const endMStr = String(endM).padStart(2, '0');

  const suggestedEndTimeIso = `${dateStr}T${endHStr}:${endMStr}:00-06:00`;

  const displayH = endH % 12 === 0 ? 12 : endH % 12;
  const ampm = endH >= 12 ? 'PM' : 'AM';
  const suggestedEndTimeFormatted = `${displayH}:${endMStr === '00' ? '00' : endMStr} ${ampm}`;

  const firstShift = blockShifts[0];
  const lastShift = blockShifts[blockShifts.length - 1];
  const shiftKeysJoined = blockShifts.map(s => s.shiftKey).join(' · ');

  const blockLabel = blockShifts.length === 1
    ? `${firstShift.shiftKey} (${firstShift.startTime} – ${firstShift.endTime})`
    : `${shiftKeysJoined} (${firstShift.startTime} – ${lastShift.endTime})`;

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(suggestedEndTimeIso).getTime();
  const durationMinutes = (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs)
    ? Math.round((endMs - startMs) / 60000)
    : 0;

  return {
    matchedShifts: blockShifts,
    startShiftKey: firstShift.shiftKey,
    endShiftKey: lastShift.shiftKey,
    suggestedEndTimeIso,
    suggestedEndTimeFormatted,
    blockLabel,
    durationMinutes
  };
}
