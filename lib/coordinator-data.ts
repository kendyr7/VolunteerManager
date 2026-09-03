import { getOperationalEventDays, formatDateShort, isSimulationEventDay } from "@/lib/dates";
import { inferShiftsForSession } from '@/lib/session-utils';

export interface CoordinatorVolunteerData {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  stake?: string | null;
  ward?: string | null;
  neighborhood?: string | null;
  committee_id?: string | null;
  committee?: string | null;
  age?: number | null;
  status?: string | null;
  created_at?: string | null;
  reliability_score?: number | null;
  reliability?: number | null;
  committees?: { name?: string | null } | null;
}

export interface CoordinatorShiftData {
  id: string;
  volunteer_id: string;
  volunteerId?: string;
  day_key: string;
  dayKey?: string;
  shift_key: string;
  shiftKey?: string;
  checked_in?: boolean;
  checked_in_at?: string | null;
  checked_out?: boolean;
  checked_out_at?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  area_description?: string | null;
  committee_areas?: unknown;
}

export interface CoordinatorSessionData {
  id: string;
  volunteer_id: string;
  volunteerId?: string;
  day_key: string;
  dayKey?: string;
  started_at: string;
  startedAt?: string;
  ended_at?: string | null;
  endedAt?: string | null;
  status: string;
  auto_closed?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CoordinatorRequirementData {
  committee_id: string;
  shift_key: string;
  required: number;
  committees?: { name?: string | null } | null;
}

export function buildEventDayKeys(): string[] {
  return getOperationalEventDays().map((date) => formatDateShort(date));
}

export function computeReliabilityMap(
  volunteers: CoordinatorVolunteerData[]
): Record<string, number | '-'> {
  const reliabilityMap: Record<string, number | '-'> = {};

  volunteers.forEach(vol => {
    const score = vol.reliability_score ?? vol.reliability ?? 100;
    reliabilityMap[vol.id] = score;
  });

  return reliabilityMap;
}

export function processShiftsData(
  shiftsData: CoordinatorShiftData[],
  volunteers: CoordinatorVolunteerData[] = [],
  sessionsData: CoordinatorSessionData[] = []
) {
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

  // Session-aware maps
  const activeSessionsByVolunteer: Record<string, CoordinatorSessionData> = {};
  const completedSessionsByVolunteer: Record<string, CoordinatorSessionData[]> = {};
  const sessionOpenShiftKeys: Record<string, boolean> = {};
  const sessionCompletedShiftKeys: Record<string, boolean> = {};

  const assignedShiftKeysByVolunteerDay = new Map<string, string[]>();
  for (const shift of shiftsData) {
    const volunteerId = shift.volunteer_id || shift.volunteerId;
    const dayKey = shift.day_key || shift.dayKey;
    const shiftKey = shift.shift_key || shift.shiftKey;
    if (!volunteerId || !dayKey || !shiftKey) continue;
    const key = `${volunteerId}|${dayKey}`;
    const assigned = assignedShiftKeysByVolunteerDay.get(key) || [];
    if (!assigned.includes(shiftKey)) assigned.push(shiftKey);
    assignedShiftKeysByVolunteerDay.set(key, assigned);
  }

  // 1. Process attendance_sessions (Primary Source of Truth)
  (sessionsData || []).forEach((sess) => {
    const vId = sess.volunteer_id || sess.volunteerId;
    const dayKey = sess.day_key || sess.dayKey || '';
    if (!vId || !dayKey) return;

    const startedAt = sess.started_at || sess.startedAt || '';
    const endedAt = sess.ended_at || sess.endedAt || null;
    const status = sess.status || (endedAt ? 'completed' : 'open');

    // Infer related shifts via temporal intersection
    const assignedForVolAndDay = assignedShiftKeysByVolunteerDay.get(`${vId}|${dayKey}`) || [];

    const targetShiftKeys = assignedForVolAndDay.length > 0 ? assignedForVolAndDay : ['T1', 'T2', 'T3', 'T4'];
    const relatedShifts = inferShiftsForSession(dayKey, startedAt, endedAt, targetShiftKeys);

    if (status === 'open') {
      activeSessionsByVolunteer[vId] = sess;
      relatedShifts.forEach((rs) => {
        const k = `${vId}-${dayKey}-${rs.shiftKey}`;
        sessionOpenShiftKeys[k] = true;
        checkedInMap[k] = true;
      });
    } else if (status === 'completed') {
      if (!completedSessionsByVolunteer[vId]) completedSessionsByVolunteer[vId] = [];
      completedSessionsByVolunteer[vId].push(sess);

      relatedShifts.forEach((rs) => {
        const k = `${vId}-${dayKey}-${rs.shiftKey}`;
        sessionCompletedShiftKeys[k] = true;
        checkedInMap[k] = true;
        checkedOutMap[k] = true;
      });
    }
  });

  // 2. Process assigned shifts
  for (const s of shiftsData) {
    if (!s.volunteer_id) continue;

    // Basic stats
    if (!isSimulationEventDay(s.day_key)) {
      shiftCounts[s.volunteer_id] = (shiftCounts[s.volunteer_id] || 0) + 1;
    }

    // Personal schedule
    if (!globalShifts[s.volunteer_id]) {
      globalShifts[s.volunteer_id] = emptyShifts();
    }
    if (globalShifts[s.volunteer_id][s.day_key]) {
      if (!globalShifts[s.volunteer_id][s.day_key].includes(s.shift_key)) {
        globalShifts[s.volunteer_id][s.day_key].push(s.shift_key);
      }
    }

    // Attendance maps (Legacy fallback if shift has legacy flags)
    const key = `${s.volunteer_id}-${s.day_key}-${s.shift_key}`;
    if (s.checked_in || s.checked_in_at || s.checked_out || s.checked_out_at) {
      checkedInMap[key] = true;
      if (s.id) checkedInMap[s.id] = true;
    }
    if (s.checked_out || s.checked_out_at) {
      checkedOutMap[key] = true;
      if (s.id) checkedOutMap[s.id] = true;
      if (s.volunteer_id) checkedOutMap[s.volunteer_id] = true;
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

  return {
    globalShifts,
    checkedInMap,
    checkedOutMap,
    shiftCounts,
    indexedAssignments,
    activeSessionsByVolunteer,
    completedSessionsByVolunteer,
    sessionOpenShiftKeys,
    sessionCompletedShiftKeys,
  };
}

export function parseRequirementsData(
  requirementsData: CoordinatorRequirementData[],
  committeesList: { id: string; name: string }[]
): Record<string, Record<string, number>> {
  const updatedReqs: Record<string, Record<string, number>> = {};

  requirementsData.forEach((r) => {
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
