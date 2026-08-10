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
    const score = vol.reliability_score ?? vol.reliability ?? 100;
    reliabilityMap[vol.id] = score;
  });

  return reliabilityMap;
}

export function processShiftsData(shiftsData: any[], volunteers: any[] = [], sessionsData: any[] = []) {
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
  const activeSessionsByVolunteer: Record<string, any> = {};
  const completedSessionsByVolunteer: Record<string, any[]> = {};
  const sessionOpenShiftKeys: Record<string, boolean> = {};
  const sessionCompletedShiftKeys: Record<string, boolean> = {};

  // 1. Process attendance_sessions (Primary Source of Truth)
  (sessionsData || []).forEach((sess: any) => {
    const vId = sess.volunteer_id || sess.volunteerId;
    const dayKey = sess.day_key || sess.dayKey || '';
    if (!vId || !dayKey) return;

    const startedAt = sess.started_at || sess.startedAt || '';
    const endedAt = sess.ended_at || sess.endedAt || null;
    const status = sess.status || (endedAt ? 'completed' : 'open');

    // Infer related shifts via temporal intersection
    const assignedForVolAndDay = shiftsData
      .filter((s: any) => (s.volunteer_id || s.volunteerId) === vId && (s.day_key || s.dayKey) === dayKey)
      .map((s: any) => s.shift_key || s.shiftKey);

    const targetShiftKeys = assignedForVolAndDay.length > 0 ? assignedForVolAndDay : ['T1', 'T2', 'T3', 'T4'];
    const { inferShiftsForSession } = require('@/lib/session-utils');
    const relatedShifts = inferShiftsForSession(dayKey, startedAt, endedAt, targetShiftKeys);

    if (status === 'open') {
      activeSessionsByVolunteer[vId] = sess;
      relatedShifts.forEach((rs: any) => {
        const k = `${vId}-${dayKey}-${rs.shiftKey}`;
        sessionOpenShiftKeys[k] = true;
        checkedInMap[k] = true;
      });
    } else if (status === 'completed') {
      if (!completedSessionsByVolunteer[vId]) completedSessionsByVolunteer[vId] = [];
      completedSessionsByVolunteer[vId].push(sess);

      relatedShifts.forEach((rs: any) => {
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
