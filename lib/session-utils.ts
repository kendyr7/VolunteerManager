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
