import { getOfficialShiftTime, getOfficialShiftTimesList, parseDayKeyToDateStr, OfficialShiftTime } from './dates';

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
 * Calculates Guatemala local hour float (e.g. 7.5 = 7:30 AM, 17.25 = 5:15 PM)
 */
export function getGuatemalaHourFloat(dateInput: Date | string): number {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  const guatemalaString = d.toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaDate = new Date(guatemalaString);
  return guatemalaDate.getHours() + guatemalaDate.getMinutes() / 60 + guatemalaDate.getSeconds() / 3600;
}

/**
 * Minimum percentage of an assigned shift's duration required for it to be considered completed.
 * Default: 0.5 (50% of the shift duration, e.g. 2.5h for T1, 2.0h for T2/T3/T4).
 */
export const MIN_ASSIGNED_SHIFT_COMPLETION_RATIO = 0.5;

/**
 * Minimum worked minutes required to earn an additional (unassigned) shift.
 * A volunteer must work at least 2.0 hours (120 minutes) within the additional shift's window.
 */
export const MIN_ADDITIONAL_SHIFT_MINUTES = 120;

/**
 * Mathematical Temporal Intersection Engine between session and assigned shifts
 * max(sessionStartHour, shiftStartHour) < min(sessionEndHour, shiftEndHour)
 */
export function inferShiftsForSession(
  dayKey: string,
  sessionStart: Date | string,
  sessionEnd?: Date | string | null,
  assignedShifts: string[] = ['T1', 'T2', 'T3', 'T4'],
  now: Date | string = new Date()
): OfficialShiftTime[] {
  if (!sessionStart) return [];

  const sessionStartHour = getGuatemalaHourFloat(sessionStart);
  // A session belongs to the block where it began, even when its exit is late.
  // Never infer attendance in a separate block from the elapsed interval alone.
  const block = getContinuousScheduledBlockForSession(dayKey, sessionStart, assignedShifts);
  const sessionShiftKeys = block ? block.matchedShifts.map(shift => shift.shiftKey) : assignedShifts;

  let sessionEndHour: number;
  if (sessionEnd) {
    sessionEndHour = getGuatemalaHourFloat(sessionEnd);
  } else {
    // For OPEN sessions: evaluate up to CURRENT Guatemala time, constrained by the continuous block
    const blockEndHour = block ? getOfficialShiftTime(dayKey, block.endShiftKey).endHour : 24;
    const dateStr = parseDayKeyToDateStr(dayKey);
    const dayStartMs = new Date(`${dateStr}T00:00:00-06:00`).getTime();
    const currentNowHour = (new Date(now).getTime() - dayStartMs) / 3600000;
    // A session broadcast immediately after check-in can have the same whole-second
    // value as `now`. Give an open session a minimal interval so the shift that
    // contains its start instant is active on the very first render.
    const minimumOpenEndHour = sessionStartHour + (1 / 3600);
    sessionEndHour = Math.min(Math.max(currentNowHour, minimumOpenEndHour), blockEndHour);
  }

  // Handle midnight wrap if session spans across 24h
  if (sessionEndHour < sessionStartHour && sessionEnd) {
    sessionEndHour += 24;
  }

  const matched: OfficialShiftTime[] = [];

  for (const shiftKey of sessionShiftKeys) {
    const official = getOfficialShiftTime(dayKey, shiftKey);
    const shiftStartHour = official.startHour;
    const shiftEndHour = official.endHour;

    // Intersección temporal exacta: max(sessionStart, shiftStart) < min(sessionEnd, shiftEnd)
    const overlapStart = Math.max(sessionStartHour, shiftStartHour);
    const overlapEnd = Math.min(sessionEndHour, shiftEndHour);

    // An explicitly confirmed early arrival is already attendance in the first
    // shift of its block, even before the scheduled start (or if it leaves early).
    const earlyArrival = block?.startShiftKey === shiftKey && sessionStartHour < shiftStartHour;

    if (sessionEnd) {
      // Completed session:
      // An explicitly confirmed early arrival is recognized as attendance in the first shift of its block.
      // For all other shifts, require completion threshold (at least 50% of shift duration, min 60 min).
      if (earlyArrival) {
        matched.push(official);
      } else {
        const effectiveDurationHours = Math.max(0, overlapEnd - overlapStart);
        const effectiveDurationMinutes = effectiveDurationHours * 60;
        const minRequiredMinutes = Math.max(60, official.durationMinutes * MIN_ASSIGNED_SHIFT_COMPLETION_RATIO);

        if (effectiveDurationMinutes >= minRequiredMinutes) {
          matched.push(official);
        }
      }
    } else {
      // Open session: match immediately upon any presence or confirmed early arrival
      if (overlapStart < overlapEnd || earlyArrival) {
        matched.push(official);
      }
    }
  }

  return matched;
}

/**
 * Returns unassigned official shifts earned after a completed attendance session
 * continued beyond the volunteer's original scheduled block.
 *
 * Scheduled rows remain unchanged: this is attendance recognition, not a new
 * planning assignment. Open sessions never earn additional shifts.
 * Requires at least MIN_ADDITIONAL_SHIFT_MINUTES (120 min) within the additional shift.
 */
export function inferAdditionalCompletedShifts(
  dayKey: string,
  sessionStart: Date | string,
  sessionEnd: Date | string | null | undefined,
  assignedShiftKeys: string[] = [],
): OfficialShiftTime[] {
  if (!sessionStart || !sessionEnd) return [];

  const availableShifts = getOfficialShiftTimesList(dayKey);
  const assignedSet = new Set(assignedShiftKeys);

  if (assignedShiftKeys.length === 0) {
    return inferShiftsForSession(
      dayKey,
      sessionStart,
      sessionEnd,
      availableShifts.map(shift => shift.shiftKey),
    );
  }

  const originalBlock = getContinuousScheduledBlockForSession(dayKey, sessionStart, assignedShiftKeys);
  if (!originalBlock) return [];

  const originalBlockEnd = getOfficialShiftTime(dayKey, originalBlock.endShiftKey).endHour;
  const sessionStartHour = getGuatemalaHourFloat(sessionStart);
  let sessionEndHour = getGuatemalaHourFloat(sessionEnd);
  if (sessionEndHour < sessionStartHour) sessionEndHour += 24;

  const minAdditionalHours = MIN_ADDITIONAL_SHIFT_MINUTES / 60; // 2.0 hours

  return availableShifts.filter(shift => {
    if (assignedSet.has(shift.shiftKey)) return false;
    if (shift.endHour <= originalBlockEnd) return false;
    const overlapStart = Math.max(originalBlockEnd, sessionStartHour, shift.startHour);
    const overlapEnd = Math.min(sessionEndHour, shift.endHour);
    const overlapHours = Math.max(0, overlapEnd - overlapStart);
    return overlapHours >= minAdditionalHours;
  });
}

/**
 * Completion of an attended shift within a continuous session. Intermediate
 * shifts finish at their scheduled end; the final shift still needs checkout.
 * Call only for shifts covered by inferShiftsForSession.
 */
export function getSessionShiftCompletedAt(
  dayKey: string,
  shiftKey: string,
  startedAt: string | Date,
  endedAt: string | null | undefined,
  assignedShiftKeys: string[],
  now: string | Date = new Date(),
): string | null {
  const block = getContinuousScheduledBlockForSession(dayKey, startedAt, assignedShiftKeys);
  const shift = block?.matchedShifts.find(item => item.shiftKey === shiftKey);
  if (block && shift && shift.endHour < getOfficialShiftTime(dayKey, block.endShiftKey).endHour) {
    const midnight = new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime();
    const shiftEndMs = midnight + shift.endHour * 3600000;
    const effectiveEndMs = new Date(endedAt || now).getTime();
    if (effectiveEndMs >= shiftEndMs) return new Date(shiftEndMs).toISOString();
  }
  return endedAt || null;
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

export interface ScheduledBlock {
  blockLabel: string;
  shiftKeys: string[];
  startHour: number;
  endHour: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  durationMinutes: number;
  startTimeIso: string;
  endTimeIso: string;
}

/**
 * Groups assigned shift keys for a given day_key into contiguous blocks
 * (next.startHour <= currentBlock.endHour). Exact overlap or contact only.
 */
export function getContinuousScheduledBlocks(
  dayKey: string,
  assignedShiftKeys: string[] = []
): ScheduledBlock[] {
  if (!dayKey || !assignedShiftKeys || assignedShiftKeys.length === 0) {
    return [];
  }
  const dateStr = parseDayKeyToDateStr(dayKey);

  const sortedShifts: OfficialShiftTime[] = assignedShiftKeys
    .map(key => getOfficialShiftTime(dayKey, key))
    .sort((a, b) => a.startHour - b.startHour);

  if (sortedShifts.length === 0) return [];

  const blocks: ScheduledBlock[] = [];
  let currentShifts: OfficialShiftTime[] = [sortedShifts[0]];
  let currentEndHour = sortedShifts[0].endHour;

  for (let i = 1; i < sortedShifts.length; i++) {
    const s = sortedShifts[i];
    if (s.startHour <= currentEndHour) {
      currentShifts.push(s);
      currentEndHour = Math.max(currentEndHour, s.endHour);
    } else {
      blocks.push(buildScheduledBlock(dayKey, dateStr, currentShifts));
      currentShifts = [s];
      currentEndHour = s.endHour;
    }
  }

  if (currentShifts.length > 0) {
    blocks.push(buildScheduledBlock(dayKey, dateStr, currentShifts));
  }

  return blocks;
}

function buildScheduledBlock(
  dayKey: string,
  dateStr: string,
  shifts: OfficialShiftTime[]
): ScheduledBlock {
  const firstShift = shifts[0];
  const lastShift = shifts[shifts.length - 1];
  const shiftKeys = shifts.map(s => s.shiftKey);
  const shiftKeysJoined = shiftKeys.join(' · ');

  const startHour = firstShift.startHour;
  const endHour = shifts.reduce((max, s) => Math.max(max, s.endHour), lastShift.endHour);

  const formatH = (h: number) => {
    const floorH = Math.floor(h);
    const m = Math.round((h - floorH) * 60);
    const mStr = String(m).padStart(2, '0');
    const displayH = floorH % 12 === 0 ? 12 : floorH % 12;
    const ampm = floorH >= 12 ? 'PM' : 'AM';
    return { formatted: `${displayH}:${mStr === '00' ? '00' : mStr} ${ampm}`, isoTime: `${String(floorH).padStart(2, '0')}:${mStr}:00` };
  };

  const startInfo = formatH(startHour);
  const endInfo = formatH(endHour);

  const blockLabel = shifts.length === 1
    ? `${firstShift.shiftKey} (${firstShift.startTime} – ${firstShift.endTime})`
    : `${shiftKeysJoined} (${firstShift.startTime} – ${lastShift.endTime})`;

  const durationMinutes = Math.round((endHour - startHour) * 60);

  return {
    blockLabel,
    shiftKeys,
    startHour,
    endHour,
    startTimeFormatted: firstShift.startTime,
    endTimeFormatted: lastShift.endTime,
    durationMinutes,
    startTimeIso: `${dateStr}T${startInfo.isoTime}-06:00`,
    endTimeIso: `${dateStr}T${endInfo.isoTime}-06:00`,
  };
}

/**
 * Calculates continuous scheduled shift block starting from session started_at.
 * Reuses getContinuousScheduledBlocks internally.
 */
export function getContinuousScheduledBlockForSession(
  dayKey: string,
  startedAt: string | Date,
  assignedShiftKeys: string[] = []
): ContinuousScheduledBlock | null {
  if (!startedAt || !dayKey || !assignedShiftKeys || assignedShiftKeys.length === 0) {
    return null;
  }

  const blocks = getContinuousScheduledBlocks(dayKey, assignedShiftKeys);
  if (blocks.length === 0) return null;

  const sessionStartHour = getGuatemalaHourFloat(startedAt);

  // Prefer the block actually running, then the next scheduled block for an
  // explicitly confirmed early entry. The scanner controls whether to open it;
  // this inference must not impose a different, hidden early-arrival window.
  const matchedBlock = blocks.find(b => sessionStartHour >= b.startHour && sessionStartHour < b.endHour)
    || blocks.find(b => sessionStartHour < b.startHour)
    || blocks.find(b => sessionStartHour === b.endHour);

  if (!matchedBlock) return null;

  const matchedShifts = matchedBlock.shiftKeys.map(k => getOfficialShiftTime(dayKey, k));
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(matchedBlock.endTimeIso).getTime();
  const durationMinutes = (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs)
    ? Math.round((endMs - startMs) / 60000)
    : 0;

  return {
    matchedShifts,
    startShiftKey: matchedBlock.shiftKeys[0],
    endShiftKey: matchedBlock.shiftKeys[matchedBlock.shiftKeys.length - 1],
    suggestedEndTimeIso: matchedBlock.endTimeIso,
    suggestedEndTimeFormatted: matchedBlock.endTimeFormatted,
    blockLabel: matchedBlock.blockLabel,
    durationMinutes
  };
}

/** A later, separate block or another calendar day requires an explicit exit correction. */
export function requiresSessionExitResolution(
  dayKey: string,
  startedAt: string,
  assignedShiftKeys: string[],
  now: Date | string = new Date(),
): boolean {
  const localDate = (value: Date | string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
  if (localDate(startedAt) !== localDate(now)) return true;
  const originalBlock = getContinuousScheduledBlockForSession(dayKey, startedAt, assignedShiftKeys);
  if (!originalBlock) return false;
  const originalEnd = new Date(originalBlock.suggestedEndTimeIso).getTime();
  const nowMs = new Date(now).getTime();
  return getContinuousScheduledBlocks(dayKey, assignedShiftKeys).some(block => {
    const start = new Date(block.startTimeIso).getTime();
    return start > originalEnd && nowMs >= start;
  });
}
