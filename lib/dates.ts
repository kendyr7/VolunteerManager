import { addDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

const EVENT_START_DATE = new Date(2026, 8, 10); // Sept 10, 2026 (Month is 0-indexed in JS Dates)
const EVENT_END_DATE = new Date(2026, 8, 26);   // Sept 26, 2026

export const SHIFT_TIMES = [
  { id: 1, name: "Turno 1", time: "8:00 AM - 12:00 PM", hours: 4 },
  { id: 2, name: "Turno 2", time: "11:00 AM - 3:00 PM", hours: 4 },
  { id: 3, name: "Turno 3", time: "2:00 PM - 6:00 PM", hours: 4 },
  { id: 4, name: "Turno 4", time: "5:00 PM - 10:00 PM", hours: 5 },
];

export function getActiveEventDays() {
  const days: Date[] = [];
  const endDate = new Date(2026, 8, 26);
  let currentDate = new Date(2026, 8, 10); // Clone to avoid mutating the constant

  while (currentDate <= endDate) {
    // Excluir domingos (0 en JS es domingo)
    if (currentDate.getDay() !== 0) {
      days.push(new Date(currentDate)); // push a clone
    }
    currentDate = addDays(currentDate, 1);
  }

  return days;
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
