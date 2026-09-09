import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOfficialShiftTime, parseDayKeyToDateStr } from '@/lib/dates';
import type {
  DashboardInsightAttendanceAttention,
  DashboardInsightCriticalShift,
} from '@/lib/dashboard-insight-types';

const GUATEMALA_OFFSET = '-06:00';
export const ATTENDANCE_GRACE_MINUTES = 15;

type Assignment = {
  volunteer_id: string;
  day_key: string;
  shift_key: string;
};

function shiftKeyFromLabel(value: string) {
  return value.match(/\bT[1-4]\b/i)?.[0]?.toUpperCase() || '';
}

function eventInstant(dayKey: string, shiftKey: string, hour: number) {
  const date = parseDayKeyToDateStr(dayKey);
  const wholeHour = Math.floor(hour);
  const minute = Math.round((hour - wholeHour) * 60);
  return new Date(
    `${date}T${String(wholeHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${GUATEMALA_OFFSET}`
  );
}

export function getShiftWindow(dayKey: string, shiftLabel: string) {
  const shiftKey = shiftKeyFromLabel(shiftLabel);
  if (!shiftKey) return null;
  const official = getOfficialShiftTime(dayKey, shiftKey);
  return {
    shiftKey,
    official,
    startsAt: eventInstant(dayKey, shiftKey, official.startHour),
    endsAt: eventInstant(dayKey, shiftKey, official.endHour),
  };
}

export function filterActionableCriticalShifts<T extends Pick<DashboardInsightCriticalShift, 'day' | 'shift'>>(
  shifts: T[],
  now = new Date()
) {
  return shifts
    .map(shift => ({ shift, window: getShiftWindow(shift.day, shift.shift) }))
    .filter((entry): entry is { shift: T; window: NonNullable<ReturnType<typeof getShiftWindow>> } => (
      Boolean(entry.window && entry.window.endsAt.getTime() > now.getTime())
    ))
    .sort((first, second) => {
      const firstCurrent = first.window.startsAt <= now;
      const secondCurrent = second.window.startsAt <= now;
      if (firstCurrent !== secondCurrent) return firstCurrent ? -1 : 1;
      const timeDifference = first.window.startsAt.getTime() - second.window.startsAt.getTime();
      if (timeDifference !== 0) return timeDifference;
      const firstMissing = 'missing' in first.shift
        ? Number(first.shift.missing)
        : 'totalMissing' in first.shift ? Number(first.shift.totalMissing) : 0;
      const secondMissing = 'missing' in second.shift
        ? Number(second.shift.missing)
        : 'totalMissing' in second.shift ? Number(second.shift.totalMissing) : 0;
      return secondMissing - firstMissing;
    })
    .map(entry => entry.shift);
}

function guatemalaDateKey(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(candidate => candidate.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function buildAttendanceAttention(
  assignments: Assignment[],
  checkedIn: Readonly<Record<string, boolean>>,
  volunteerCommittee: ReadonlyMap<string, string>,
  relevantCommittees: ReadonlySet<string>,
  now = new Date()
): DashboardInsightAttendanceAttention | null {
  const today = guatemalaDateKey(now);
  const groups = new Map<string, {
    dayKey: string;
    shiftKey: string;
    startsAt: Date;
    endsAt: Date;
    committees: Map<string, number>;
    volunteers: Set<string>;
  }>();

  assignments.forEach(assignment => {
    const committee = volunteerCommittee.get(assignment.volunteer_id);
    if (!committee || !relevantCommittees.has(committee)) return;
    if (parseDayKeyToDateStr(assignment.day_key) !== today) return;
    if (checkedIn[`${assignment.volunteer_id}-${assignment.day_key}-${assignment.shift_key}`]) return;

    const window = getShiftWindow(assignment.day_key, assignment.shift_key);
    if (!window || now < window.startsAt) return;
    const minutesSinceStart = Math.floor((now.getTime() - window.startsAt.getTime()) / 60_000);
    if (now < window.endsAt && minutesSinceStart < ATTENDANCE_GRACE_MINUTES) return;

    const key = `${assignment.day_key}|${window.shiftKey}`;
    const group = groups.get(key) || {
      dayKey: assignment.day_key,
      shiftKey: window.shiftKey,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      committees: new Map<string, number>(),
      volunteers: new Set<string>(),
    };
    if (group.volunteers.has(assignment.volunteer_id)) return;
    group.volunteers.add(assignment.volunteer_id);
    group.committees.set(committee, (group.committees.get(committee) || 0) + 1);
    groups.set(key, group);
  });

  const candidates = Array.from(groups.values()).sort((first, second) => {
    const firstCurrent = now < first.endsAt;
    const secondCurrent = now < second.endsAt;
    if (firstCurrent !== secondCurrent) return firstCurrent ? -1 : 1;
    if (firstCurrent) return first.startsAt.getTime() - second.startsAt.getTime();
    return second.endsAt.getTime() - first.endsAt.getTime();
  });
  const selected = candidates[0];
  if (!selected) return null;

  const primaryCommittee = Array.from(selected.committees.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0] || '';
  const official = getOfficialShiftTime(selected.dayKey, selected.shiftKey);
  const eventDate = new Date(`${parseDayKeyToDateStr(selected.dayKey)}T12:00:00${GUATEMALA_OFFSET}`);
  const day = format(eventDate, "EEEE d 'de' MMMM", { locale: es });

  return {
    status: now < selected.endsAt ? 'late' : 'absent',
    day: day.charAt(0).toUpperCase() + day.slice(1),
    shift: `${selected.shiftKey} (${official.timeLabel})`,
    count: selected.volunteers.size,
    minutesSinceStart: Math.max(0, Math.floor((now.getTime() - selected.startsAt.getTime()) / 60_000)),
    primaryCommittee,
    affectedCommittees: selected.committees.size,
  };
}
