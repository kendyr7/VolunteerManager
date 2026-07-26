import { getActiveEventDays, formatDateShort } from "@/lib/dates";

export function buildEventDayKeys(): string[] {
  return getActiveEventDays().map((date) => formatDateShort(date));
}

export function computeReliabilityMap(
  volunteers: any[],
  globalShifts: Record<string, Record<string, string[]>>,
  confirmedReminders: Record<string, boolean>
): Record<string, number | '-'> {
  const reliabilityMap: Record<string, number | '-'> = {};

  volunteers.forEach(vol => {
    let totalAssigned = 0;
    let totalConfirmed = 0;
    const volShifts = globalShifts[vol.id] || {};
    
    for (const day in volShifts) {
      for (const shift of volShifts[day]) {
        totalAssigned++;
        if (confirmedReminders[`${vol.id}-${day}-${shift}`]) {
          totalConfirmed++;
        }
      }
    }
    
    reliabilityMap[vol.id] = totalAssigned === 0 ? '-' : Math.round((totalConfirmed / totalAssigned) * 100);
  });

  return reliabilityMap;
}

export function processShiftsData(shiftsData: any[], volunteers: any[] = []) {
  const dayKeys = buildEventDayKeys();
  const emptyShifts = () =>
    Object.fromEntries(dayKeys.map((k) => [k, [] as string[]]));

  // Index volunteers by ID for quick committee lookup
  const volCommitteeMap: Record<string, string> = {};
  volunteers.forEach(v => {
    volCommitteeMap[v.id] = v.committees?.name || 'Sin comité';
  });

  const globalShifts: Record<string, Record<string, string[]>> = {};
  const checkedInMap: Record<string, boolean> = {};
  const checkedOutMap: Record<string, boolean> = {};
  const shiftCounts: Record<string, number> = {};
  
  // New: day -> shift -> committee -> volunteerIds[]
  const indexedAssignments: Record<string, Record<string, Record<string, string[]>>> = {};

  for (const s of shiftsData) {
    if (!s.volunteer_id) continue;

    // Basic stats
    shiftCounts[s.volunteer_id] = (shiftCounts[s.volunteer_id] || 0) + 1;

    // Personal schedule
    if (!globalShifts[s.volunteer_id]) {
      globalShifts[s.volunteer_id] = emptyShifts();
    }
    if (globalShifts[s.volunteer_id][s.day_key]) {
      if (!globalShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
        globalShifts[s.volunteer_id][s.day_key].push(s.shift_key);
      }
    }

    // Attendance maps
    const key = `${s.volunteer_id}-${s.day_key}-${s.shift_key}`;
    if (s.checked_in || s.checked_in_at || s.checked_out || s.checked_out_at) {
      checkedInMap[key] = true;
    }
    if (s.checked_out || s.checked_out_at) {
      checkedOutMap[key] = true;
    }

    // Assignments index (The core optimization)
    if (!indexedAssignments[s.day_key]) indexedAssignments[s.day_key] = {};
    if (!indexedAssignments[s.day_key][s.shift_key]) indexedAssignments[s.day_key][s.shift_key] = {};
    
    const committeeName = volCommitteeMap[s.volunteer_id] || 'Sin comité';
    if (!indexedAssignments[s.day_key][s.shift_key][committeeName]) {
      indexedAssignments[s.day_key][s.shift_key][committeeName] = [];
    }
    indexedAssignments[s.day_key][s.shift_key][committeeName].push(s.volunteer_id);
  }

  return { globalShifts, checkedInMap, checkedOutMap, shiftCounts, indexedAssignments };
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
