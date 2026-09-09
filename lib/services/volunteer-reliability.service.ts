import { isOperationalEventDay, parseDayKeyToDateStr, parseGuatemalaShiftEnd } from '../dates';
import { inferShiftsForSession } from '../session-utils';

export interface ShiftRecordLike {
  id?: string;
  volunteer_id?: string;
  volunteerId?: string;
  day_key?: string;
  dayKey?: string;
  shift_key?: string;
  shiftKey?: string;
  checked_in?: boolean | null;
  checked_out?: boolean | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
}

export interface SessionRecordLike {
  id?: string;
  volunteer_id?: string;
  volunteerId?: string;
  day_key?: string;
  dayKey?: string;
  started_at?: string | null;
  startedAt?: string | null;
  ended_at?: string | null;
  endedAt?: string | null;
  status?: string | null;
}

export interface VolunteerReliabilityMetrics {
  volunteerId: string;
  reliabilityScore: number; // 0 to 100
  totalAssignedShifts: number;
  completedShiftsCount: number;
  missedShiftsCount: number; // Faltas
  upcomingShiftsCount: number;
  openShiftsCount: number;
}

function normalizeDayKey(dayKey: string): string {
  return parseDayKeyToDateStr(dayKey).toLowerCase().trim();
}

/**
 * Standard proportional reliability calculation based on total committed shifts.
 * Each absence penalizes proportionally to the volunteer's total commitment.
 * Formula: max(0, round(((total - missed) / total) * 100))
 */
export function calculateReliabilityScore(totalAssigned: number, missed: number): number {
  if (totalAssigned <= 0) return 100;
  const normalizedMissed = Math.max(0, Math.min(totalAssigned, missed));
  const score = Math.round(((totalAssigned - normalizedMissed) / totalAssigned) * 100);
  const maximumScore = normalizedMissed > 0 ? 99 : 100;
  return Math.max(0, Math.min(maximumScore, score));
}

/**
 * Evaluates shifts and sessions for a single volunteer and produces complete reliability metrics.
 */
export function getVolunteerReliabilityMetrics(
  volunteerId: string,
  assignedShifts: ShiftRecordLike[],
  sessions: SessionRecordLike[],
  now: Date = new Date()
): VolunteerReliabilityMetrics {
  // Normalize shifts
  const operationalShifts = (assignedShifts || []).filter(s => {
    const vId = s.volunteer_id || s.volunteerId;
    const dKey = s.day_key || s.dayKey;
    return vId === volunteerId && dKey && isOperationalEventDay(dKey);
  });

  const totalAssignedShifts = operationalShifts.length;
  if (totalAssignedShifts === 0) {
    return {
      volunteerId,
      reliabilityScore: 100,
      totalAssignedShifts: 0,
      completedShiftsCount: 0,
      missedShiftsCount: 0,
      upcomingShiftsCount: 0,
      openShiftsCount: 0,
    };
  }

  // Group shifts by dayKey
  const assignedByDay = new Map<string, string[]>();
  operationalShifts.forEach(s => {
    const dKey = normalizeDayKey(s.day_key || s.dayKey || '');
    const sKey = (s.shift_key || s.shiftKey || '').toUpperCase().trim();
    if (!assignedByDay.has(dKey)) assignedByDay.set(dKey, []);
    const list = assignedByDay.get(dKey)!;
    if (!list.includes(sKey)) list.push(sKey);
  });

  // Track completed and open shifts from sessions
  const completedShiftKeys = new Set<string>(); // `${dayKey}|${shiftKey}`
  const openShiftKeys = new Set<string>();

  (sessions || []).forEach(sess => {
    const vId = sess.volunteer_id || sess.volunteerId;
    if (vId !== volunteerId) return;

    const dKey = normalizeDayKey(sess.day_key || sess.dayKey || '');
    const startedAt = sess.started_at || sess.startedAt;
    const endedAt = sess.ended_at || sess.endedAt;
    const status = sess.status || (endedAt ? 'completed' : 'open');

    if (!dKey || !startedAt) return;

    const assignedForDay = assignedByDay.get(dKey) || [];
    const targetKeys = assignedForDay.length > 0 ? assignedForDay : ['T1', 'T2', 'T3', 'T4'];
    const matched = inferShiftsForSession(dKey, startedAt, endedAt, targetKeys, now);

    if (status === 'completed' && Boolean(endedAt)) {
      matched.forEach(m => completedShiftKeys.add(`${dKey}|${m.shiftKey.toUpperCase()}`));
    } else if (status === 'open') {
      matched.forEach(m => openShiftKeys.add(`${dKey}|${m.shiftKey.toUpperCase()}`));
    }
  });

  let completedShiftsCount = 0;
  let missedShiftsCount = 0;
  let upcomingShiftsCount = 0;
  let openShiftsCount = 0;

  operationalShifts.forEach(s => {
    const dKey = normalizeDayKey(s.day_key || s.dayKey || '');
    const sKey = (s.shift_key || s.shiftKey || '').toUpperCase().trim();
    const lookupKey = `${dKey}|${sKey}`;

    const isLegacyCheckedIn = Boolean(s.checked_in || s.checked_in_at || s.checked_out || s.checked_out_at);
    const isSessionCompleted = completedShiftKeys.has(lookupKey);
    const isSessionOpen = openShiftKeys.has(lookupKey);

    if (isSessionCompleted || isLegacyCheckedIn) {
      completedShiftsCount++;
    } else if (isSessionOpen) {
      openShiftsCount++;
    } else {
      const shiftEndTime = parseGuatemalaShiftEnd(dKey, sKey);
      if (now > shiftEndTime) {
        // Shift has passed and was not checked in -> Absent (Falta)
        missedShiftsCount++;
      } else {
        // Shift is in the future or currently running without session yet
        upcomingShiftsCount++;
      }
    }
  });

  const reliabilityScore = calculateReliabilityScore(totalAssignedShifts, missedShiftsCount);

  return {
    volunteerId,
    reliabilityScore,
    totalAssignedShifts,
    completedShiftsCount,
    missedShiftsCount,
    upcomingShiftsCount,
    openShiftsCount,
  };
}

/**
 * Bulk calculation of reliability map for all volunteers in O(N) time.
 * Used directly by CoordinatorDataContext for instant, real-time reactive updates.
 */
export function computeBulkReliabilityMap(
  volunteers: Array<{ id: string }>,
  shifts: ShiftRecordLike[],
  sessions: SessionRecordLike[],
  now: Date = new Date()
): Record<string, number> {
  const shiftsByVolunteer = new Map<string, ShiftRecordLike[]>();
  (shifts || []).forEach(s => {
    const vId = s.volunteer_id || s.volunteerId;
    if (!vId) return;
    if (!shiftsByVolunteer.has(vId)) shiftsByVolunteer.set(vId, []);
    shiftsByVolunteer.get(vId)!.push(s);
  });

  const sessionsByVolunteer = new Map<string, SessionRecordLike[]>();
  (sessions || []).forEach(sess => {
    const vId = sess.volunteer_id || sess.volunteerId;
    if (!vId) return;
    if (!sessionsByVolunteer.has(vId)) sessionsByVolunteer.set(vId, []);
    sessionsByVolunteer.get(vId)!.push(sess);
  });

  const reliabilityMap: Record<string, number> = {};

  (volunteers || []).forEach(vol => {
    const vShifts = shiftsByVolunteer.get(vol.id) || [];
    const vSessions = sessionsByVolunteer.get(vol.id) || [];

    const metrics = getVolunteerReliabilityMetrics(vol.id, vShifts, vSessions, now);
    reliabilityMap[vol.id] = metrics.reliabilityScore;
  });

  return reliabilityMap;
}
