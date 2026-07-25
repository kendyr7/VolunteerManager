import { getActiveEventDays, formatDateShort } from "@/lib/dates";

export function buildEventDayKeys(): string[] {
  return getActiveEventDays().map((date) => formatDateShort(date));
}

export function processShiftsData(shiftsData: any[]) {
  const dayKeys = buildEventDayKeys();
  const emptyShifts = () =>
    Object.fromEntries(dayKeys.map((k) => [k, [] as string[]]));

  const globalShifts: Record<string, Record<string, string[]>> = {};
  const checkedInMap: Record<string, boolean> = {};
  const checkedOutMap: Record<string, boolean> = {};
  const shiftCounts: Record<string, number> = {};

  for (const s of shiftsData) {
    if (!s.volunteer_id) continue;

    shiftCounts[s.volunteer_id] = (shiftCounts[s.volunteer_id] || 0) + 1;

    if (!globalShifts[s.volunteer_id]) {
      globalShifts[s.volunteer_id] = emptyShifts();
    }
    if (!globalShifts[s.volunteer_id][s.day_key]) {
      globalShifts[s.volunteer_id][s.day_key] = [];
    }
    if (!globalShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
      globalShifts[s.volunteer_id][s.day_key].push(s.shift_key);
    }

    const key = `${s.volunteer_id}-${s.day_key}-${s.shift_key}`;
    if (s.checked_in || s.checked_in_at || s.checked_out || s.checked_out_at) {
      checkedInMap[key] = true;
    }
    if (s.checked_out || s.checked_out_at) {
      checkedOutMap[key] = true;
    }
  }

  return { globalShifts, checkedInMap, checkedOutMap, shiftCounts };
}

export function parseRequirementsData(
  requirementsData: any[],
  committeesList: { id: string; name: string }[]
): Record<string, Record<string, number>> {
  const updatedReqs: Record<string, Record<string, number>> = {};

  requirementsData.forEach((r: any) => {
    const commName =
      r.committees?.name ||
      committeesList.find((c) => c.id === r.committee_id)?.name;
    if (commName) {
      if (!updatedReqs[commName]) updatedReqs[commName] = {};
      updatedReqs[commName][r.shift_key] = r.required;
    }
  });

  return updatedReqs;
}
