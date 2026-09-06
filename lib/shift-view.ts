import { getOfficialShiftTime, parseDayKeyToDateStr } from '@/lib/dates';
import { getGuatemalaDate } from '@/lib/scan-history';
import { getGuatemalaHourFloat } from '@/lib/session-utils';

export type ShiftViewMode = 'turnos' | 'active' | 'completed';

export function resolveShiftView(requested: string | null, activeCount: number): ShiftViewMode {
  if (requested === 'turnos' || requested === 'active' || requested === 'completed') return requested;
  return activeCount > 0 ? 'active' : 'turnos';
}

/** Pending arrivals belong only to today's running roster, not future assignments. */
export function isLiveShiftRoster(dayKey: string, shiftKey: string, hasOpenAttendance: boolean, now = new Date()): boolean {
  if (parseDayKeyToDateStr(dayKey) !== getGuatemalaDate(now)) return false;
  const official = getOfficialShiftTime(dayKey, shiftKey);
  const hour = getGuatemalaHourFloat(now);
  return hasOpenAttendance || (hour >= official.startHour && hour < official.endHour);
}

export function attendanceSortPriority(isCheckedIn: boolean, isCheckedOut: boolean): number {
  return isCheckedOut ? 2 : isCheckedIn ? 1 : 0;
}
