import { getOfficialShiftTime, isOperationalEventDay, parseDayKeyToDateStr } from "@/lib/dates";
import { getGuatemalaDate } from "@/lib/scan-history";
import { getContinuousScheduledBlockForSession, inferAdditionalCompletedShifts, inferShiftsForSession, getSessionShiftCompletedAt } from "@/lib/session-utils";

export interface ShiftTimeResult {
  startTime: string;
  endTime: string;
}

interface ShiftAuditLog {
  description?: string | null;
  details?: string | null;
  created_at?: string | null;
}

interface AttendanceSessionTimeRecord {
  id?: string;
  volunteer_id?: string;
  volunteerId?: string;
  day_key?: string;
  dayKey?: string;
  started_at?: string;
  startedAt?: string;
  ended_at?: string | null;
  endedAt?: string | null;
  status?: string;
  updated_at?: string;
  created_at?: string;
  shift_completed_at?: string | null;
  shift_started_at?: string | null;
  is_additional_shift?: boolean;
}

function formatGuatemalaTime(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString('es-GT', {
    timeZone: 'America/Guatemala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Returns the newest attendance session that actually covers this assigned shift. */
export function findAttendanceSessionForShift(
  dayKey: string,
  shiftKey: string,
  sessionsData: AttendanceSessionTimeRecord[] = [],
  dbShiftRecords: any[] = [],
  volunteerId?: string,
  now = new Date(),
): AttendanceSessionTimeRecord | null {
  const normalizedDay = dayKey.toLowerCase().trim();
  const assignedShiftKeys = dbShiftRecords
    .filter((record) => {
      const recordDay = String(record?.day_key || record?.dayKey || '').toLowerCase().trim();
      const recordVolunteerId = record?.volunteer_id || record?.volunteerId;
      return recordDay === normalizedDay && (!volunteerId || recordVolunteerId === volunteerId);
    })
    .map((record) => record?.shift_key || record?.shiftKey)
    .filter(Boolean);

  const session = sessionsData
    .filter((session) => {
      const sessionDay = String(session?.day_key || session?.dayKey || '').toLowerCase().trim();
      const sessionVolunteerId = session?.volunteer_id || session?.volunteerId;
      if (sessionDay !== normalizedDay || (volunteerId && sessionVolunteerId !== volunteerId)) return false;

      const startedAt = session?.started_at || session?.startedAt || '';
      const endedAt = session?.ended_at ?? session?.endedAt ?? null;
      if (!startedAt) return false;
      const assignedKeys = assignedShiftKeys.length > 0 ? assignedShiftKeys : [shiftKey];
      const isAssignedMatch = assignedShiftKeys.length > 0 && inferShiftsForSession(
        dayKey,
        startedAt,
        endedAt,
        assignedKeys,
      ).some((related) => related.shiftKey === shiftKey);
      // Attendance display must include a real, short visit even when it did
      // not meet the separate threshold for crediting a completed shift.
      const block = getContinuousScheduledBlockForSession(dayKey, startedAt, assignedKeys);
      const inBlock = block?.matchedShifts.some((related) => related.shiftKey === shiftKey);
      const official = getOfficialShiftTime(dayKey, shiftKey);
      const midnight = new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime();
      const shiftStart = midnight + official.startHour * 3600000;
      const shiftEnd = midnight + official.endHour * 3600000;
      const startedMs = new Date(startedAt).getTime();
      const endedMs = endedAt ? new Date(endedAt).getTime() : Date.now();
      const visitedAssignedShift = Boolean(assignedShiftKeys.length > 0 && (endedAt || inBlock) && (
        (inBlock && block?.startShiftKey === shiftKey && startedMs < shiftStart)
        || (startedMs < shiftEnd && endedMs > shiftStart)
      ));
      const isAdditionalMatch = Boolean(endedAt) && inferAdditionalCompletedShifts(
        dayKey,
        startedAt,
        endedAt,
        assignedShiftKeys,
      ).some((related) => related.shiftKey === shiftKey);
      // A person can be physically present without a scheduled row. Show that
      // presence in the current official shift; credit remains checkout-only.
      const currentShiftStart = new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime()
        + official.startHour * 3600000;
      const currentShiftEnd = new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime()
        + official.endHour * 3600000;
      const isUnassignedOpenMatch = !assignedShiftKeys.includes(shiftKey)
        && session.status === 'open' && !endedAt && isOperationalEventDay(dayKey)
        && parseDayKeyToDateStr(dayKey) === getGuatemalaDate(now)
        && getGuatemalaDate(startedAt) === parseDayKeyToDateStr(dayKey)
        && now.getTime() >= currentShiftStart && now.getTime() < currentShiftEnd
        && startedMs <= now.getTime();
      return isAssignedMatch || visitedAssignedShift || isAdditionalMatch || isUnassignedOpenMatch;
    })
    .sort((left, right) => {
      const leftEnd = left.ended_at ?? left.endedAt;
      const rightEnd = right.ended_at ?? right.endedAt;
      if (leftEnd && rightEnd) {
        const earnsCredit = (item: AttendanceSessionTimeRecord, endedAt: string) => {
          const startedAt = item.started_at || item.startedAt || '';
          return inferShiftsForSession(dayKey, startedAt, endedAt, assignedShiftKeys).some(shift => shift.shiftKey === shiftKey)
            || inferAdditionalCompletedShifts(dayKey, startedAt, endedAt, assignedShiftKeys).some(shift => shift.shiftKey === shiftKey);
        };
        const creditDifference = Number(earnsCredit(right, rightEnd)) - Number(earnsCredit(left, leftEnd));
        if (creditDifference) return creditDifference;
      }
      const leftTime = new Date(left.updated_at || left.started_at || left.startedAt || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.started_at || right.startedAt || right.created_at || 0).getTime();
      return rightTime - leftTime;
    })[0] || null;
  if (!session) return null;
  const startedAt = session.started_at || session.startedAt || '';
  const endedAt = session.ended_at ?? session.endedAt;
  const additionalShifts = inferAdditionalCompletedShifts(dayKey, startedAt, endedAt, assignedShiftKeys);
  const isAdditionalShift = additionalShifts.some(shift => shift.shiftKey === shiftKey);
  const completionKeys = isAdditionalShift
    ? Array.from(new Set([...assignedShiftKeys, ...additionalShifts.map(shift => shift.shiftKey)]))
    : (assignedShiftKeys.length > 0 ? assignedShiftKeys : [shiftKey]);
  const block = getContinuousScheduledBlockForSession(dayKey, startedAt, completionKeys);
  const official = getOfficialShiftTime(dayKey, shiftKey);
  const officialStart = new Date(
    new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime()
      + official.startHour * 3600000,
  ).toISOString();
  return {
    ...session,
    is_additional_shift: isAdditionalShift,
    shift_started_at: block?.startShiftKey === shiftKey ? startedAt :
      (new Date(startedAt).getTime() > new Date(officialStart).getTime() ? startedAt : officialStart),
    shift_completed_at: getSessionShiftCompletedAt(
      dayKey, shiftKey, startedAt,
      endedAt,
      completionKeys,
    ),
  };
}

export type ShiftDisplayStatus = 'scheduled' | 'in_progress' | 'completed' | 'needs_review';

/** One attendance interpretation for roster rows and both personal schedules. */
export function getShiftDisplayState(
  dayKey: string,
  shiftKey: string,
  shift: { checked_in?: boolean | null; checked_in_at?: string | null; checked_out?: boolean | null; checked_out_at?: string | null } | null | undefined,
  sessions: AttendanceSessionTimeRecord[] = [],
  assignedShifts: any[] = [],
  volunteerId?: string,
  now = new Date(),
): { status: ShiftDisplayStatus; startAt: string | null; endAt: string | null; flag: string | null } {
  if (sessions.length === 0 && !shift?.checked_in && !shift?.checked_in_at
    && !shift?.checked_out && !shift?.checked_out_at) {
    return { status: 'scheduled', startAt: null, endAt: null, flag: null };
  }
  const matching = findAttendanceSessionForShift(dayKey, shiftKey, sessions, assignedShifts, volunteerId, now);
  if (matching) {
    const startedAt = matching.shift_started_at || matching.started_at || matching.startedAt || null;
    const endedAt = matching.ended_at ?? matching.endedAt ?? null;
    const completedAt = matching.shift_completed_at || endedAt;
    const assignedKeys = assignedShifts
      .filter(item => String(item?.day_key || item?.dayKey || '').toLowerCase().trim() === dayKey.toLowerCase().trim()
        && (!volunteerId || (item?.volunteer_id || item?.volunteerId) === volunteerId))
      .map(item => item?.shift_key || item?.shiftKey).filter(Boolean);
    const originalStart = matching.started_at || matching.startedAt || '';
    const shortVisit = Boolean(endedAt && !inferShiftsForSession(
      dayKey, originalStart, endedAt, assignedKeys.length ? assignedKeys : [shiftKey], now,
    ).some(item => item.shiftKey === shiftKey) && !matching.is_additional_shift);
    if (shortVisit) return {
      status: 'needs_review', startAt: startedAt, endAt: endedAt,
      flag: 'Asistencia registrada, pero no supera el 50% del turno',
    };
    if (completedAt) return {
      status: 'completed', startAt: startedAt, endAt: completedAt,
      flag: [
        matching.status === 'open' && endedAt ? 'Sesión abierta con salida registrada' : null,
        (shift?.checked_in || shift?.checked_in_at) && !shift?.checked_out && !shift?.checked_out_at
          ? 'Flag de entrada sin salida aunque la sesión finalizó' : null,
      ].filter(Boolean).join(' · ') || null,
    };
    const isToday = parseDayKeyToDateStr(dayKey) === getGuatemalaDate(now);
    const officialEnd = new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime()
      + getOfficialShiftTime(dayKey, shiftKey).endHour * 3600000;
    if (matching.status !== 'open' || !isToday || now.getTime() >= officialEnd) return {
      status: 'needs_review', startAt: startedAt, endAt: null,
      flag: matching.status !== 'open' ? 'Sesión finalizada sin hora de salida'
        : 'Salida pendiente: sesión abierta fuera del horario del turno',
    };
    return {
      status: 'in_progress', startAt: startedAt, endAt: null,
      flag: shift?.checked_out || shift?.checked_out_at ? 'Flag de salida aunque la sesión sigue abierta' : null,
    };
  }

  const hasDaySession = sessions.some(session =>
    String(session.day_key || session.dayKey || '').toLowerCase().trim() === dayKey.toLowerCase().trim()
    && (!volunteerId || (session.volunteer_id || session.volunteerId) === volunteerId));
  const legacyOut = Boolean(shift?.checked_out || shift?.checked_out_at);
  const legacyIn = Boolean(shift?.checked_in || shift?.checked_in_at);
  if (hasDaySession) return {
    status: 'scheduled', startAt: null, endAt: null,
    flag: legacyIn || legacyOut ? 'Flags del turno sin sesión de asistencia correspondiente' : null,
  };
  if (legacyOut) return { status: 'completed', startAt: shift?.checked_in_at || null, endAt: shift?.checked_out_at || null, flag: null };
  if (legacyIn) return {
    status: 'needs_review', startAt: shift?.checked_in_at || null, endAt: null,
    flag: parseDayKeyToDateStr(dayKey) === getGuatemalaDate(now)
      && now.getTime() < new Date(`${parseDayKeyToDateStr(dayKey)}T00:00:00-06:00`).getTime()
        + getOfficialShiftTime(dayKey, shiftKey).endHour * 3600000
      ? 'Entrada sin sesión de asistencia: verificar presencia'
      : 'Entrada antigua sin salida ni sesión',
  };
  return { status: 'scheduled', startAt: null, endAt: null, flag: null };
}

export function getAttendanceSessionTimes(
  dayKey: string,
  shiftKey: string,
  sessionsData: AttendanceSessionTimeRecord[] = [],
  dbShiftRecords: any[] = [],
  volunteerId?: string,
): ShiftTimeResult | null {
  const session = findAttendanceSessionForShift(dayKey, shiftKey, sessionsData, dbShiftRecords, volunteerId);
  if (!session) return null;

  const startTime = formatGuatemalaTime(session.shift_started_at || session.started_at || session.startedAt);
  const endTime = formatGuatemalaTime(session.shift_completed_at);
  if (!startTime) return null;
  return { startTime, endTime: endTime || 'En curso' };
}

/**
 * Single Unified Source of Truth for Shift Start & End Times
 */
export function getUnifiedShiftTimes(
  dayKey: string,
  shiftKey: string,
  dbShiftRecords: unknown[] = [],
  auditLogs: ShiftAuditLog[] = [],
  sessionsData: AttendanceSessionTimeRecord[] = [],
  volunteerId?: string,
): ShiftTimeResult {
  const sessionTimes = getAttendanceSessionTimes(
    dayKey,
    shiftKey,
    sessionsData,
    dbShiftRecords as any[],
    volunteerId,
  );
  if (sessionTimes) return sessionTimes;

  const official = getOfficialShiftTime(dayKey, shiftKey);
  const record = (dbShiftRecords as Array<{
    volunteer_id?: string; day_key?: string; shift_key?: string;
    checked_in?: boolean; checked_out?: boolean;
    checked_in_at?: string | null; checked_out_at?: string | null;
  }>).find((item) =>
    item.day_key?.toLowerCase().trim() === dayKey.toLowerCase().trim()
    && item.shift_key === shiftKey
    && (!volunteerId || item.volunteer_id === volunteerId));
  const hasAttendance = Boolean(record?.checked_in || record?.checked_out || record?.checked_in_at || record?.checked_out_at);
  const startTime = formatGuatemalaTime(record?.checked_in_at)
    || (hasAttendance ? 'Sin entrada registrada' : official.startTime);
  const endTime = formatGuatemalaTime(record?.checked_out_at)
    || (hasAttendance ? 'Sin salida registrada' : official.endTime);
  return { startTime, endTime };
}

/**
 * Single Unified Source of Truth for Worked Minutes per Shift
 */
export function getUnifiedShiftWorkedMinutes(
  dayKey: string,
  shiftKey: string,
  dbShiftRecords: unknown[] = [],
  _auditLogs: ShiftAuditLog[] = []
): number {
  const record = (dbShiftRecords as Array<{
    day_key?: string; shift_key?: string;
    checked_in_at?: string | null; checked_out_at?: string | null;
  }>).find(item => item.day_key?.toLowerCase().trim() === dayKey.toLowerCase().trim()
    && item.shift_key === shiftKey && item.checked_in_at && item.checked_out_at);
  if (!record?.checked_in_at || !record.checked_out_at) return 0;
  const duration = Math.round((new Date(record.checked_out_at).getTime()
    - new Date(record.checked_in_at).getTime()) / 60000);
  const maxMins = getOfficialShiftTime(dayKey, shiftKey).durationMinutes;
  return Number.isFinite(duration) && duration > 0 && duration <= maxMins ? duration : 0;
}

/**
 * Single Unified Formatter for Minutes & Hours
 */
export function formatUnifiedDuration(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return "0 min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
