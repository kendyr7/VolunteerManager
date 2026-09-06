import { addDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

const EVENT_START_DATE = new Date(2026, 8, 10); // Sept 10, 2026 (Month is 0-indexed in JS Dates)
const EVENT_END_DATE = new Date(2026, 8, 26);   // Sept 26, 2026
export const SIMULATION_EVENT_DATE = new Date(2026, 8, 5);
export const SIMULATION_EVENT_DATE_ISO = '2026-09-05';
export const SIMULATION_EVENT_DAY_KEY = 'sáb 5';
export const SIMULATION_EVENT_SHIFT_KEY = 'T1';

export type EventDayKind = 'official' | 'simulation';
export type ShiftKey = 'T1' | 'T2' | 'T3' | 'T4';

export interface EventDaysOptions {
  includeSimulation?: boolean;
}

export interface OfficialShiftTime {
  shiftKey: ShiftKey;
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  startHour: number;
  endHour: number;
  hours: number;
  durationMinutes: number;
  timeLabel: string;
  shortTimeLabel: string;
  time: string; // Alias for timeLabel for backward compatibility with SHIFT_TIMES objects
}

function readEventDateParts(dayKey?: string | Date | null): { year: number; month: number; day: number } | null {
  if (!dayKey) return null;

  if (dayKey instanceof Date) {
    return {
      year: dayKey.getFullYear(),
      month: dayKey.getMonth() + 1,
      day: dayKey.getDate(),
    };
  }

  const raw = String(dayKey).trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return { year, month, day };
  }

  const dayNumber = Number(raw.match(/\d+/)?.[0]);
  if (!dayNumber) return null;
  return { year: 2026, month: 9, day: dayNumber };
}

export function isSimulationEventDay(dayKey?: string | Date | null): boolean {
  const parts = readEventDateParts(dayKey);
  return Boolean(parts && parts.year === 2026 && parts.month === 9 && parts.day === 5);
}

export function isOperationalEventDay(dayKey?: string | Date | null): boolean {
  if (!dayKey) return false;
  const parts = readEventDateParts(dayKey);
  if (!parts || parts.year !== 2026 || parts.month !== 9) return false;
  if (parts.day === 5) {
    if (typeof dayKey === 'string') {
      const raw = dayKey.trim().toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw === 'sáb 5' || raw === 'sab 5';
      }
    }
    return true;
  }
  if (parts.day >= 10 && parts.day <= 26) {
    const d = new Date(2026, 8, parts.day);
    if (d.getDay() === 0) return false; // Exclude Sundays
    if (typeof dayKey === 'string') {
      const raw = dayKey.trim().toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const expectedKey = formatDateShort(d).toLowerCase();
        return raw === expectedKey;
      }
    }
    return true;
  }
  return false;
}

export function getEventDayKind(dayKey?: string | Date | null): EventDayKind {
  return isSimulationEventDay(dayKey) ? 'simulation' : 'official';
}

export function isShiftAvailableForDay(dayKey: string | Date | null | undefined, shiftKey: string | null | undefined): boolean {
  if (!isSimulationEventDay(dayKey)) return /^T[1-4]$/i.test((shiftKey || '').trim());
  return (shiftKey || '').trim().toUpperCase() === SIMULATION_EVENT_SHIFT_KEY;
}

/**
 * Determines if a given day is an extended shift day.
 * Only September 14 and 15 use the extended T4 ending at 10:00 PM.
 */
export function isExtendedShiftDay(dayKey?: string | Date | null): boolean {
  if (!dayKey) return false;

  if (dayKey instanceof Date) {
    const dateNum = dayKey.getDate();
    const month = dayKey.getMonth(); // 8 = September in 0-indexed JS Date
    return month === 8 && (dateNum === 14 || dateNum === 15);
  }

  const raw = String(dayKey).trim().toLowerCase();

  // Check ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return isExtendedShiftDay(dateObj);
  }

  // Short event day_key format, e.g. "lun 14" or "mar 15".
  const dayNumber = Number(raw.match(/\d+/)?.[0]);
  return dayNumber === 14 || dayNumber === 15;
}

/**
 * Single Authoritative Source of Truth for Official Shift Schedule Times
 * - Días regulares: T1 (7-12), T2 (11-15), T3 (14-18), T4 (17-21, 4h)
 * - 14 y 15 Sep: T1 (7-12), T2 (11-15), T3 (14-18), T4 (17-22, 5h)
 */
export function getOfficialShiftTime(
  dayKey?: string | Date | null,
  shiftKey?: string | null
): OfficialShiftTime {
  const normKey = (shiftKey || 'T1').toUpperCase().trim();
  const idNum = parseInt(normKey.replace('T', ''), 10) || 1;
  const isExtended = isExtendedShiftDay(dayKey);

  if (isSimulationEventDay(dayKey) && normKey === SIMULATION_EVENT_SHIFT_KEY) {
    return {
      shiftKey: SIMULATION_EVENT_SHIFT_KEY,
      id: 1,
      name: 'Turno de simulación',
      startTime: '9:00 AM',
      endTime: '2:00 PM',
      startHour: 9.0,
      endHour: 14.0,
      hours: 5,
      durationMinutes: 300,
      timeLabel: '9:00 AM - 2:00 PM',
      shortTimeLabel: '9 AM-2 PM',
      time: '9:00 AM - 2:00 PM',
    };
  }

  if (normKey === 'T2') {
    return {
      shiftKey: 'T2',
      id: 2,
      name: 'Turno 2',
      startTime: '11:00 AM',
      endTime: '3:00 PM',
      startHour: 11.0,
      endHour: 15.0,
      hours: 4,
      durationMinutes: 240,
      timeLabel: '11:00 AM - 3:00 PM',
      shortTimeLabel: '11 AM-3 PM',
      time: '11:00 AM - 3:00 PM',
    };
  }

  if (normKey === 'T3') {
    return {
      shiftKey: 'T3',
      id: 3,
      name: 'Turno 3',
      startTime: '2:00 PM',
      endTime: '6:00 PM',
      startHour: 14.0,
      endHour: 18.0,
      hours: 4,
      durationMinutes: 240,
      timeLabel: '2:00 PM - 6:00 PM',
      shortTimeLabel: '2-6 PM',
      time: '2:00 PM - 6:00 PM',
    };
  }

  if (normKey === 'T4') {
    if (isExtended) {
      return {
        shiftKey: 'T4',
        id: 4,
        name: 'Turno 4',
        startTime: '5:00 PM',
        endTime: '10:00 PM',
        startHour: 17.0,
        endHour: 22.0,
        hours: 5,
        durationMinutes: 300,
        timeLabel: '5:00 PM - 10:00 PM',
        shortTimeLabel: '5-10 PM',
        time: '5:00 PM - 10:00 PM',
      };
    }
    return {
      shiftKey: 'T4',
      id: 4,
      name: 'Turno 4',
      startTime: '5:00 PM',
      endTime: '9:00 PM',
      startHour: 17.0,
      endHour: 21.0,
      hours: 4,
      durationMinutes: 240,
      timeLabel: '5:00 PM - 9:00 PM',
      shortTimeLabel: '5-9 PM',
      time: '5:00 PM - 9:00 PM',
    };
  }

  // Default: T1 (Turno 1)
  return {
    shiftKey: 'T1',
    id: 1,
    name: 'Turno 1',
    startTime: '7:00 AM',
    endTime: '12:00 PM',
    startHour: 7.0,
    endHour: 12.0,
    hours: 5,
    durationMinutes: 300,
    timeLabel: '7:00 AM - 12:00 PM',
    shortTimeLabel: '7-12 AM',
    time: '7:00 AM - 12:00 PM',
  };
}

export function getOfficialShiftTimesList(dayKey?: string | Date | null): OfficialShiftTime[] {
  if (isSimulationEventDay(dayKey)) {
    return [getOfficialShiftTime(dayKey, SIMULATION_EVENT_SHIFT_KEY)];
  }

  return [
    getOfficialShiftTime(dayKey, 'T1'),
    getOfficialShiftTime(dayKey, 'T2'),
    getOfficialShiftTime(dayKey, 'T3'),
    getOfficialShiftTime(dayKey, 'T4'),
  ];
}

export function getAvailableShiftKeys(dayKey?: string | Date | null): ShiftKey[] {
  return getOfficialShiftTimesList(dayKey).map(shift => shift.shiftKey);
}

// Backward compatibility export (uses default list)
export const SHIFT_TIMES = getOfficialShiftTimesList();

export function getActiveEventDays(options: EventDaysOptions = {}) {
  const days: Date[] = [];
  const { includeSimulation = false } = options;

  if (includeSimulation) {
    days.push(new Date(SIMULATION_EVENT_DATE));
  }

  const endDate = new Date(EVENT_END_DATE);
  let currentDate = new Date(EVENT_START_DATE); // Clone to avoid mutating the constant

  while (currentDate <= endDate) {
    // Excluir domingos (0 en JS es domingo)
    if (currentDate.getDay() !== 0) {
      days.push(new Date(currentDate)); // push a clone
    }
    currentDate = addDays(currentDate, 1);
  }

  return days;
}

export function getOperationalEventDays(): Date[] {
  return getActiveEventDays({ includeSimulation: true });
}

export function isHoliday(date: Date) {
  const sep14 = new Date(2026, 8, 14);
  const sep15 = new Date(2026, 8, 15);
  return isSameDay(date, sep14) || isSameDay(date, sep15);
}

export function formatDateShort(date: Date) {
  // Ej: Jue 10
  return format(date, "EEE d", { locale: es });
}

export function formatMonthName(date: Date) {
  return format(date, "MMMM", { locale: es });
}

/**
 * Converts short day_key (e.g. "vie 11", "sáb 12") or ISO date string to "YYYY-MM-DD"
 */
export function parseDayKeyToDateStr(dayKey?: string | Date | null): string {
  if (!dayKey) return '2026-09-11';
  if (dayKey instanceof Date) {
    return format(dayKey, "yyyy-MM-dd");
  }
  const raw = String(dayKey).trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const numMatch = raw.match(/\d+/);
  if (numMatch) {
    const dayNum = String(parseInt(numMatch[0], 10)).padStart(2, '0');
    return `2026-09-${dayNum}`;
  }
  return '2026-09-11';
}
