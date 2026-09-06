import { getOfficialShiftTime, parseDayKeyToDateStr } from '@/lib/dates';
import { getGuatemalaDate } from '@/lib/scan-history';
import { getGuatemalaHourFloat } from '@/lib/session-utils';

export type ShiftViewMode = 'turnos' | 'active' | 'completed';

export function resolveShiftView(requested: string | null, activeCount: number): ShiftViewMode {
  if (requested === 'turnos' || requested === 'active' || requested === 'completed') return requested;
  return activeCount > 0 ? 'active' : 'turnos';
}

/** Today's roster remains visible through Guatemala midnight once it records attendance. */
export function isLiveShiftRoster(dayKey: string, shiftKey: string, hasAttendance: boolean, now = new Date()): boolean {
  if (parseDayKeyToDateStr(dayKey) !== getGuatemalaDate(now)) return false;
  const official = getOfficialShiftTime(dayKey, shiftKey);
  const hour = getGuatemalaHourFloat(now);
  return hasAttendance || (hour >= official.startHour && hour < official.endHour);
}

interface AttendanceSessionLike {
  volunteer_id?: string;
  volunteerId?: string;
  day_key?: string;
  dayKey?: string;
  ended_at?: string | null;
  endedAt?: string | null;
  status?: string;
}

export function getOpenAttendanceVolunteerIds(
  sessions: AttendanceSessionLike[] = [],
  dayKey: string,
): Set<string> {
  const normalizedDay = dayKey.toLowerCase().trim();
  return new Set(sessions.flatMap((session) => {
    const volunteerId = session.volunteer_id || session.volunteerId;
    const sessionDay = String(session.day_key || session.dayKey || '').toLowerCase().trim();
    const endedAt = session.ended_at ?? session.endedAt ?? null;
    return volunteerId && sessionDay === normalizedDay && session.status === 'open' && !endedAt
      ? [volunteerId]
      : [];
  }));
}

export function attendanceSortPriority(isCheckedIn: boolean, isCheckedOut: boolean): number {
  if (!isCheckedIn && !isCheckedOut) return 0;
  return isCheckedOut ? 1 : 2;
}
