import { format } from 'date-fns';
import { formatDateShort, getOperationalEventDays } from './dates';

/** Convert the schedule's short keys ("vie 11") to unique calendar dates. */
export function getJournalDays(shifts: ReadonlyArray<{ day_key: string }>): string[] {
  const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const assigned = new Set(shifts.map(shift => normalize(shift.day_key)));
  return getOperationalEventDays()
    .filter(date => assigned.has(normalize(formatDateShort(date))) || assigned.has(format(date, 'yyyy-MM-dd')))
    .map(date => format(date, 'yyyy-MM-dd'))
    .sort();
}
