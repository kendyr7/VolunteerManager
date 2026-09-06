'use server'

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { requireCapability } from "@/lib/authorization";
import { hasCapability } from "@/lib/role-permissions";
import { getActiveEventDays, getAvailableShiftKeys, getOfficialShiftTime, getOperationalEventDays, isSimulationEventDay, isOperationalEventDay } from "@/lib/dates";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getGuatemalaHourFloat, calculateSessionMinutes, inferShiftsForSession } from "@/lib/session-utils";

export interface ReportItem {
  registrationId: string;
  volunteerId: string;
  volunteerName: string;
  age?: number | null;
  phone: string;
  neighborhood: string;
  stake: string;
  committeeId: string;
  committeeName: string;
  date: string;
  shiftNumber: number;
  startTime: string;
  endTime: string;
  isExtended: boolean;
  status: 'registered' | 'confirmed' | 'absent' | 'replaced';
  durationMinutes: number;
}

export interface CommitteeAttendance {
  committeeId: string;
  committeeName: string;
  assigned: number;
  checkedIn: number;
  absent: number;
  required: number;  // sum of all shift requirements for this committee
  attendanceRate: number;
  coverageRate: number; // checked-in / required
}

export interface AttendanceSummary {
  totalAssigned: number;
  totalCheckedIn: number;
  totalAbsent: number;
  totalRequired: number;
  attendanceRate: number;   // checkedIn / assigned
  coverageRate: number;     // checkedIn / required
  byCommittee: CommitteeAttendance[];
  byShift: { shiftKey: string; assigned: number; checkedIn: number; required: number; rate: number }[];
}

export interface CommitteeRecruitment {
  committeeId: string;
  committeeName: string;
  totalVolunteers: number;
  totalRequiredShifts: number;
  assignedShifts: number;
  missingShifts: number;
  coverageRate: number;
}

export interface AgeSegmentation {
  range: string;
  count: number;
  percentage: number;
}

export interface DailyCoverage {
  date: string;       // ISO date "2026-09-10"
  dayLabel: string;   // Short label "Jue 10 Sep"
  required: number;
  assigned: number;
  checkedIn: number;
  missing: number;
  coverageRate: number;
  byShift: Record<string, { required: number; assigned: number; checkedIn: number; missing: number }>;
}

export interface ReportsData {
  items: ReportItem[];
  uniqueNeighborhoods: string[];
  uniqueStakes: string[];
  uniqueCommittees: { id: string; name: string }[];
  attendanceSummary: AttendanceSummary;
  recruitmentSummary: CommitteeRecruitment[];
  ageSegmentation: AgeSegmentation[];
  dailyCoverage: DailyCoverage[];
}

interface ReportVolunteerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  age: string | number | null;
  phone: string | null;
  neighborhood: string | null;
  stake: string | null;
  status: string | null;
  committee_id: string | null;
  committees: { id: string; name: string; status?: string | null } | null;
}

interface ReportCommitteeRow {
  id: string;
  name: string;
  status?: string | null;
}

interface ReportShiftRow {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: string;
}

interface ReportSessionRow {
  id: string;
  volunteer_id: string;
  day_key: string;
  started_at: string;
  ended_at: string | null;
  status: 'open' | 'completed';
}

interface ReportRequirementRow {
  committee_id: string;
  shift_key: string;
  required: number;
}



// Build a lookup map from day_key -> ISO date string using the canonical event days from dates.ts
// e.g. "mié 16" -> "2026-09-16"
function buildDayKeyMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const date of getOperationalEventDays()) {
    const key = format(date, "EEE d", { locale: es }).toLowerCase();
    const iso = format(date, "yyyy-MM-dd");
    map.set(key, iso);
  }
  return map;
}

// Cached on module load (server singleton) — no hardcoded dates
const DAY_KEY_MAP = buildDayKeyMap();

function parseDayKeyToDateStr(dayKey: string): string {
  if (!dayKey) return '';
  const raw = dayKey.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Remove dots and accents for robust matching
  const norm = raw.toLowerCase().replace(/\./g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const direct = DAY_KEY_MAP.get(raw.toLowerCase()) || DAY_KEY_MAP.get(norm);
  if (direct) return direct;

  for (const [k, v] of DAY_KEY_MAP.entries()) {
    const kNorm = k.toLowerCase().replace(/\./g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (kNorm === norm) return v;
  }

  // Fallback for dates like "mié 5" or "jue 6" outside standard Sep map
  const match = raw.match(/(\d{1,2})/);
  if (match) {
    const dayNum = parseInt(match[1]);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${currentYear}-${currentMonth}-${dayNum.toString().padStart(2, '0')}`;
  }

  return raw;
}


function parseGuatemalaShiftEnd(dayKey: string, shiftKey: string): Date {
  const isoDate = parseDayKeyToDateStr(dayKey);
  if (!isoDate || isoDate === dayKey) return new Date(); // unknown date, treat as past

  const official = getOfficialShiftTime(dayKey, shiftKey);
  const endHour = official.endHour;

  // Build the instant that corresponds to the Guatemala local end time.
  const [year, month, day] = isoDate.split('-').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, Math.floor(endHour) + 6, Math.round((endHour % 1) * 60), 0);
  return new Date(utcMillis);
}

export async function getReportsData(options: { includeSimulation?: boolean } = {}): Promise<{ error?: string; data?: ReportsData }> {
  try {
    const includeSimulation = options.includeSimulation === true;
    const authorization = await requireCapability('view_reports');
    const canSeeGlobalReports = hasCapability(authorization, 'view_global_reports');
    const userCommitteeId = authorization.committeeId;

    // Service Role fallback for Supabase RLS
    let supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } else {
      supabase = await createClient();
    }

    // Fetch independent report datasets concurrently and request only the fields used below.
    const [volsData, commsData, shiftsData, sessionsData, reqsData] = await Promise.all([
      fetchAllRows<ReportVolunteerRow>(
        supabase,
        'volunteers',
        'id, first_name, last_name, age, phone, neighborhood, stake, status, committee_id, committees(id, name, status)',
        query => query.or('status.is.null,status.neq.archived')
      ),
      fetchAllRows<ReportCommitteeRow>(
        supabase,
        'committees',
        'id, name, status',
        query => query.or('status.is.null,status.neq.archived')
      ),
      fetchAllRows<ReportShiftRow>(supabase, 'shifts', 'id, volunteer_id, day_key, shift_key'),
      fetchAllRows<ReportSessionRow>(
        supabase,
        'attendance_sessions',
        'id, volunteer_id, day_key, started_at, ended_at, status'
      ),
      fetchAllRows<ReportRequirementRow>(
        supabase,
        'committee_shift_requirements',
        'committee_id, shift_key, required'
      ),
    ]);

    // O(1) indexes replace the previous shifts x volunteers x audit-logs scans.
    const volunteersById = new Map<string, ReportVolunteerRow>();
    (volsData || []).forEach(vol => {
      if ((vol.status || '').toLowerCase() !== 'archived') {
        volunteersById.set(vol.id, vol);
      }
    });

    const reportShifts = (shiftsData || []).filter(shift => {
      const volunteer = volunteersById.get(shift.volunteer_id);
      return Boolean(volunteer)
        && (volunteer?.committees?.status || '').toLowerCase() !== 'archived'
        && isOperationalEventDay(shift.day_key)
        && (includeSimulation || !isSimulationEventDay(shift.day_key));
    });

    const normalizeDayKey = (value: string) => (value || '').toLowerCase().trim();
    const assignedShiftsByVolunteerDay = new Map<string, Set<string>>();
    reportShifts.forEach(shift => {
      const key = `${shift.volunteer_id}|${normalizeDayKey(shift.day_key)}`;
      if (!assignedShiftsByVolunteerDay.has(key)) assignedShiftsByVolunteerDay.set(key, new Set());
      assignedShiftsByVolunteerDay.get(key)!.add(shift.shift_key);
    });

    type SessionAttendance = { completedMinutes: number; hasOpen: boolean };
    const attendanceByShift = new Map<string, SessionAttendance>();

    (sessionsData || []).forEach(session => {
      if (!session.volunteer_id || !session.day_key || !session.started_at || !isOperationalEventDay(session.day_key)) return;
      const dayKey = normalizeDayKey(session.day_key);
      const assignmentKey = `${session.volunteer_id}|${dayKey}`;
      const assignedShiftKeys = assignedShiftsByVolunteerDay.get(assignmentKey);
      if (!assignedShiftKeys?.size) return;

      const assignedKeysList = Array.from(assignedShiftKeys);
      const startHour = getGuatemalaHourFloat(session.started_at);
      let endHour = session.ended_at ? getGuatemalaHourFloat(session.ended_at) : startHour;
      if (session.ended_at && endHour < startHour) endHour += 24;

      const matchedShifts = inferShiftsForSession(
        session.day_key,
        session.started_at,
        session.ended_at,
        assignedKeysList
      );
      const matchedKeys = matchedShifts.map(s => s.shiftKey);
      const targetKeys = matchedKeys.length > 0 ? matchedKeys : assignedKeysList;

      if (session.status === 'completed' && Boolean(session.ended_at)) {
        const calc = calculateSessionMinutes(session.started_at, session.ended_at);
        const totalSessionMinutes = calc.isClosed ? calc.totalWorkedMinutes : 0;

        if (totalSessionMinutes > 0) {
          if (targetKeys.length === 1) {
            const shiftKey = targetKeys[0];
            const key = `${session.volunteer_id}|${dayKey}|${shiftKey}`;
            const current = attendanceByShift.get(key) || { completedMinutes: 0, hasOpen: false };
            current.completedMinutes += totalSessionMinutes;
            attendanceByShift.set(key, current);
          } else {
            const overlaps = targetKeys.map(shiftKey => {
              const official = getOfficialShiftTime(session.day_key, shiftKey);
              const oStart = Math.max(startHour, official.startHour);
              const oEnd = Math.min(endHour, official.endHour);
              const overlap = Math.max(0, oEnd - oStart);
              return { shiftKey, overlap: overlap > 0 ? overlap : official.hours };
            });
            const totalOverlap = overlaps.reduce((sum, o) => sum + o.overlap, 0);

            let allocated = 0;
            overlaps.forEach((o, index) => {
              const isLast = index === overlaps.length - 1;
              const mins = isLast
                ? Math.max(0, totalSessionMinutes - allocated)
                : Math.round(totalSessionMinutes * (o.overlap / totalOverlap));
              allocated += mins;

              const key = `${session.volunteer_id}|${dayKey}|${o.shiftKey}`;
              const current = attendanceByShift.get(key) || { completedMinutes: 0, hasOpen: false };
              current.completedMinutes += mins;
              attendanceByShift.set(key, current);
            });
          }
        }
      } else if (session.status === 'open') {
        targetKeys.forEach(shiftKey => {
          const official = getOfficialShiftTime(session.day_key, shiftKey);
          if (startHour < official.endHour && startHour >= official.startHour) {
            const key = `${session.volunteer_id}|${dayKey}|${shiftKey}`;
            const current = attendanceByShift.get(key) || { completedMinutes: 0, hasOpen: false };
            current.hasOpen = true;
            attendanceByShift.set(key, current);
          }
        });
      }
    });

    // Build requirements map: committeeId -> shiftKey -> required
    const reqsMap: Record<string, Record<string, number>> = {};
    (reqsData || []).forEach(r => {
      if (!reqsMap[r.committee_id]) reqsMap[r.committee_id] = {};
      reqsMap[r.committee_id][r.shift_key] = r.required;
    });

    // Default requirements if table is empty
    const DEFAULT_REQ = 4;
    const getRequired = (commId: string, shiftKey: string) =>
      reqsMap[commId]?.[shiftKey] ?? DEFAULT_REQ;

    // 5. Process data in memory
    const items: ReportItem[] = [];
    const neighborhoodsSet = new Set<string>();
    const stakesSet = new Set<string>();
    const committeesMap = new Map<string, string>();
    
    // Populate all committees registered in database
    (commsData || []).forEach(c => {
      if (c.id && c.name) {
        if (!canSeeGlobalReports && c.id !== userCommitteeId) {
          return;
        }
        committeesMap.set(c.id, c.name);
      }
    });
    
    const now = new Date();

    reportShifts.forEach(s => {
      // Find matching volunteer
      const vol = volunteersById.get(s.volunteer_id);
      if (!vol) return;
      if ((vol.status || '').toLowerCase() === 'archived') return;
      if ((vol.committees?.status || '').toLowerCase() === 'archived') return;

      const committeeName = vol.committees?.name || 'Sin comité';
      const committeeId = vol.committees?.id || 'sin-comite';

      if (!canSeeGlobalReports && vol.committee_id !== userCommitteeId) {
        return;
      }

      // Map values
      if (vol.neighborhood) neighborhoodsSet.add(vol.neighborhood);
      if (vol.stake) stakesSet.add(vol.stake);
      committeesMap.set(committeeId, committeeName);

      const officialShift = getOfficialShiftTime(s.day_key, s.shift_key);
      const shiftMeta = { start: officialShift.startTime, end: officialShift.endTime };
      const dateStr = parseDayKeyToDateStr(s.day_key);
      const shiftNum = parseInt(s.shift_key.substring(1)) || 1;

      let status: 'registered' | 'confirmed' | 'absent' | 'replaced' = 'registered';
      let durationMinutes = 0;

      const attendanceKey = `${s.volunteer_id}|${normalizeDayKey(s.day_key)}|${s.shift_key}`;
      const attendance = attendanceByShift.get(attendanceKey);

      if (attendance && attendance.completedMinutes > 0) {
        status = 'confirmed';
        durationMinutes = attendance.completedMinutes;
      } else if (!attendance?.hasOpen) {
        const shiftEndTime = parseGuatemalaShiftEnd(s.day_key, s.shift_key);
        if (now > shiftEndTime) status = 'absent';
      }

      /* Legacy attendance inference removed. attendance_sessions is the sole source of worked time. */
      /*
        // PRIMARY PATH: Evaluate exclusively from attendance_sessions for this specific day_key
        const matchingSessions = userSessions.filter((sess: any) => {
          const sessDay = sess.day_key || sess.dayKey || '';
          if (sessDay.toLowerCase().trim() !== s.day_key.toLowerCase().trim()) return false;
          
          const relatedShifts = inferShiftsForSession(sessDay, sess.started_at, sess.ended_at, ['T1', 'T2', 'T3', 'T4']);
          return relatedShifts.some(r => r.shiftKey === s.shift_key);
        });

        if (matchingSessions.length > 0) {
          const hasCompleted = matchingSessions.some(m => m.status === 'completed');
          const hasOpen = matchingSessions.some(m => m.status === 'open');

          if (hasCompleted) {
            status = 'confirmed';
            // Sum worked minutes across all completed sessions matching this day & shift slot
            durationMinutes = matchingSessions.reduce((sum, sess) => {
              if (sess.status === 'completed') {
                const calc = calculateSessionMinutes(sess.started_at, sess.ended_at);
                return sum + (calc.isClosed ? calc.totalWorkedMinutes : 0);
              }
              return sum;
            }, 0);
          } else if (hasOpen) {
            // OPEN session: status remains registered / in_service (0 final worked minutes counted until completed)
            status = 'registered';
            durationMinutes = 0;
          }
        } else {
          const shiftEndTime = parseGuatemalaShiftEnd(s.day_key, s.shift_key);
          if (now > shiftEndTime) {
            status = 'absent';
          }
        }
      } else {
        // FALLBACK PATH: Legacy evaluation for historical records without attendance_sessions
        const volNameLower = `${vol.first_name || ''} ${vol.last_name || ''}`.trim().toLowerCase();
        const relevantAuditLogs = (auditLogsData || []).filter((l: any) => {
          const desc = (l.description || '').toLowerCase();
          const det = (l.details || '').toLowerCase();
          const matchName = volNameLower && (desc.includes(volNameLower) || det.includes(volNameLower));
          const matchDay = desc.includes(s.day_key.toLowerCase()) || det.includes(s.day_key.toLowerCase());
          const matchShift = desc.includes(s.shift_key.toLowerCase()) || det.includes(s.shift_key.toLowerCase());
          return matchName && matchDay && matchShift;
        });

        const isAuditConfirmed = relevantAuditLogs.some((l: any) => {
          const d = (l.description || '').toLowerCase();
          return d.includes('check-in') || d.includes('escaneó') || d.includes('salida') || d.includes('ajustó hora de salida') || d.includes('completó');
        });

        const isConfirmed = Boolean(s.checked_in || s.checked_out || s.checked_in_at || s.checked_out_at || s.status === 'completed' || s.status === 'confirmed') || isAuditConfirmed;

        if (isConfirmed) {
          status = 'confirmed';
          durationMinutes = getUnifiedShiftWorkedMinutes(s.day_key, s.shift_key, shiftsData, auditLogsData);
          if (durationMinutes <= 0) {
            durationMinutes = shiftMeta.hours * 60;
          }
        } else {
          const shiftEndTime = parseGuatemalaShiftEnd(s.day_key, s.shift_key);
          if (now > shiftEndTime) {
            status = 'absent';
          }
        }
      */

      items.push({
        registrationId: s.id,
        volunteerId: vol.id,
        volunteerName: `${vol.first_name || ''} ${vol.last_name || ''}`.trim(),
        age: vol.age != null ? Number(vol.age) : null,
        phone: vol.phone || '',
        neighborhood: vol.neighborhood || 'Sin barrio',
        stake: vol.stake || 'Sin estaca',
        committeeId: committeeId,
        committeeName: committeeName,
        date: dateStr,
        shiftNumber: shiftNum,
        startTime: shiftMeta.start,
        endTime: shiftMeta.end,
        isExtended: s.shift_key === 'T4', // T4 is 5 hours
        status,
        durationMinutes
      });
    });

    /* Removed: audit logs must never synthesize attendance or worked hours.
    const createdKeys = new Set(items.map(i => `${i.volunteerId}_${i.date}_T${i.shiftNumber}`));
    
    (auditLogsData || []).forEach((log: any) => {
      const desc = (log.description || '').toLowerCase();
      if (desc.includes('check-in') || desc.includes('registró asistencia') || desc.includes('ajustó hora de salida')) {
        volsData?.forEach((vol: any) => {
          const volNameLower = `${vol.first_name || ''} ${vol.last_name || ''}`.trim().toLowerCase();
          if (volNameLower && desc.includes(volNameLower)) {
            const match = desc.match(/(jue\s+\d+|vie\s+\d+|sáb\s+\d+|dom\s+\d+|lun\s+\d+|mar\s+\d+|mié\s+\d+)\s*[-:]?\s*(t[1-4])/i);
            if (match) {
              const dayKey = match[1];
              const shiftKey = match[2].toUpperCase();
              const dateStr = parseDayKeyToDateStr(dayKey);
              const shiftNum = parseInt(shiftKey.substring(1)) || 1;
              const itemKey = `${vol.id}_${dateStr}_T${shiftNum}`;

              if (!createdKeys.has(itemKey)) {
                createdKeys.add(itemKey);
                const committeeName = vol.committees?.name || 'Sin comité';
                const committeeId = vol.committees?.id || 'sin-comite';
                const officialShift = getOfficialShiftTime(dayKey, shiftKey);
                const shiftMeta = { start: officialShift.startTime, end: officialShift.endTime, hours: officialShift.hours };

                let durationMinutes = 34;
                if (dayKey.includes('11') && shiftKey === 'T4') durationMinutes = 34;
                if (dayKey.includes('12') && shiftKey === 'T3') durationMinutes = 23;

                items.push({
                  registrationId: `audit-${vol.id}-${dayKey}-${shiftKey}`,
                  volunteerId: vol.id,
                  volunteerName: `${vol.first_name || ''} ${vol.last_name || ''}`.trim(),
                  age: vol.age ? parseInt(vol.age) : null,
                  phone: vol.phone || '',
                  neighborhood: vol.neighborhood || 'Sin barrio',
                  stake: vol.stake || 'Sin estaca',
                  committeeId,
                  committeeName,
                  date: dateStr,
                  shiftNumber: shiftNum,
                  startTime: shiftMeta.start,
                  endTime: shiftMeta.end,
                  isExtended: shiftKey === 'T4',
                  status: 'confirmed',
                  durationMinutes
                });
              }
            }
          }
        });
      }
    }); */

    const uniqueNeighborhoods = Array.from(neighborhoodsSet).sort();
    const uniqueStakes = Array.from(stakesSet).sort();
    const uniqueCommittees = Array.from(committeesMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

    // Calculate requirements accurately per unique (day_key, shift_key) slot
    const activeDayShiftSlots = new Set<string>();
    reportShifts.forEach(s => {
      if (s.day_key && s.shift_key) {
        activeDayShiftSlots.add(`${s.day_key}_${s.shift_key}`);
      }
    });

    const commAttMap: Record<string, CommitteeAttendance> = {};
    const shiftAttMap: Record<string, { assigned: number; checkedIn: number; required: number }> = {};
    for (const sk of ['T1', 'T2', 'T3', 'T4']) {
      shiftAttMap[sk] = { assigned: 0, checkedIn: 0, required: 0 };
    }

    // Initialize committee required totals based on unique slots
    uniqueCommittees.forEach(c => {
      let commReqTotal = 0;
      activeDayShiftSlots.forEach(slot => {
        const sk = slot.split('_')[1];
        commReqTotal += getRequired(c.id, sk);
      });

      commAttMap[c.id] = {
        committeeId: c.id,
        committeeName: c.name,
        assigned: 0,
        checkedIn: 0,
        absent: 0,
        required: commReqTotal,
        attendanceRate: 0,
        coverageRate: 0,
      };
    });

    // Calculate shift requirements per shift key across committees
    activeDayShiftSlots.forEach(slot => {
      const sk = slot.split('_')[1];
      if (shiftAttMap[sk]) {
        uniqueCommittees.forEach(c => {
          shiftAttMap[sk].required += getRequired(c.id, sk);
        });
      }
    });

    items.forEach(item => {
      const cId = item.committeeId;
      const sk = `T${item.shiftNumber}`;

      if (!commAttMap[cId]) {
        commAttMap[cId] = {
          committeeId: cId,
          committeeName: item.committeeName,
          assigned: 0, checkedIn: 0, absent: 0, required: 0,
          attendanceRate: 0, coverageRate: 0,
        };
      }

      commAttMap[cId].assigned++;
      if (shiftAttMap[sk]) shiftAttMap[sk].assigned++;

      if (item.status === 'confirmed') {
        commAttMap[cId].checkedIn++;
        if (shiftAttMap[sk]) shiftAttMap[sk].checkedIn++;
      } else if (item.status === 'absent') {
        commAttMap[cId].absent++;
      }
    });

    const byCommittee: CommitteeAttendance[] = Object.values(commAttMap).map(c => ({
      ...c,
      attendanceRate: c.assigned > 0 ? Math.round((c.checkedIn / c.assigned) * 100) : 0,
      coverageRate: c.required > 0 ? Math.round((c.checkedIn / c.required) * 100) : 0,
    }));

    const byShift = ['T1', 'T2', 'T3', 'T4'].map(sk => ({
      shiftKey: sk,
      ...shiftAttMap[sk],
      rate: shiftAttMap[sk].assigned > 0
        ? Math.round((shiftAttMap[sk].checkedIn / shiftAttMap[sk].assigned) * 100) : 0,
    }));

    const totalCheckedIn = items.filter(i => i.status === 'confirmed').length;
    const totalAbsent = items.filter(i => i.status === 'absent').length;
    const totalAssigned = items.length;
    const totalRequired = Object.values(commAttMap).reduce((s, c) => s + c.required, 0);

    const attendanceSummary: AttendanceSummary = {
      totalAssigned,
      totalCheckedIn,
      totalAbsent,
      totalRequired,
      attendanceRate: totalAssigned > 0 ? Math.round((totalCheckedIn / totalAssigned) * 100) : 0,
      coverageRate: totalRequired > 0 ? Math.round((totalCheckedIn / totalRequired) * 100) : 0,
      byCommittee,
      byShift,
    };

    // --- 1. RECRUITMENT BY COMMITTEE (Voluntarios por Comité y Faltantes) ---
    const recruitmentSummary: CommitteeRecruitment[] = uniqueCommittees.map(c => {
      // Filter volunteers belonging to this committee
      const committeeVols = (volsData || []).filter((v: any) => {
        const commName = v.committees?.name || 'Sin comité';
        const commId = v.committees?.id || 'sin-comite';
        return commId === c.id || commName.trim().toLowerCase() === c.name.trim().toLowerCase();
      });

      const totalVolunteers = committeeVols.length;
      const commAtt = commAttMap[c.id];
      const totalRequiredShifts = commAtt ? commAtt.required : 0;
      const assignedShifts = commAtt ? commAtt.assigned : 0;
      const missingShifts = Math.max(0, totalRequiredShifts - assignedShifts);
      const coverageRate = totalRequiredShifts > 0 ? Math.round((assignedShifts / totalRequiredShifts) * 100) : 0;

      return {
        committeeId: c.id,
        committeeName: c.name,
        totalVolunteers,
        totalRequiredShifts,
        assignedShifts,
        missingShifts,
        coverageRate,
      };
    });

    // --- 2. AGE SEGMENTATION (Distribución Demográfica por Edad) ---
    const ageCounts: Record<string, number> = {
      '< 18': 0,
      '18 - 25': 0,
      '26 - 35': 0,
      '36 - 50': 0,
      '50+': 0,
      'Sin edad': 0,
    };

    const relevantVols = (volsData || []).filter((v: any) => {
      return canSeeGlobalReports || v.committee_id === userCommitteeId;
    });

    relevantVols.forEach((v: any) => {
      const ageNum = parseInt(v.age);
      if (isNaN(ageNum) || ageNum <= 0) {
        ageCounts['Sin edad']++;
      } else if (ageNum < 18) {
        ageCounts['< 18']++;
      } else if (ageNum <= 25) {
        ageCounts['18 - 25']++;
      } else if (ageNum <= 35) {
        ageCounts['26 - 35']++;
      } else if (ageNum <= 50) {
        ageCounts['36 - 50']++;
      } else {
        ageCounts['50+']++;
      }
    });

    const totalVolsCount = relevantVols.length;
    const ageSegmentation: AgeSegmentation[] = Object.entries(ageCounts).map(([range, count]) => ({
      range,
      count,
      percentage: totalVolsCount > 0 ? Math.round((count / totalVolsCount) * 100) : 0,
    }));

    // --- 3. DAILY COVERAGE BREAKDOWN (Informe de Cobertura por Día) ---
    const dailyCoverageMap: Record<string, DailyCoverage> = {};

    for (const dateObj of getActiveEventDays({ includeSimulation })) {
      const isoDate = format(dateObj, 'yyyy-MM-dd');
      const dayLabel = format(dateObj, 'EEE d MMM', { locale: es });
      const dayKeyStr = format(dateObj, 'EEE d', { locale: es }).toLowerCase();

      let dayRequired = 0;
      const byShift: Record<string, { required: number; assigned: number; checkedIn: number; missing: number }> = {
        T1: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T2: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T3: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
        T4: { required: 0, assigned: 0, checkedIn: 0, missing: 0 },
      };

      const availableShiftKeys = getAvailableShiftKeys(dayKeyStr);

      uniqueCommittees.forEach(c => {
        availableShiftKeys.forEach(sk => {
          const req = getRequired(c.id, sk);
          byShift[sk].required += req;
          dayRequired += req;
        });
      });

      // Filter shifts for this date
      const dayShifts = items.filter(i => i.date === isoDate);

      let dayAssigned = 0;
      let dayCheckedIn = 0;

      dayShifts.forEach(i => {
        const sk = `T${i.shiftNumber}`;
        dayAssigned++;
        if (byShift[sk]) byShift[sk].assigned++;

        if (i.status === 'confirmed') {
          dayCheckedIn++;
          if (byShift[sk]) byShift[sk].checkedIn++;
        }
      });

      availableShiftKeys.forEach(sk => {
        byShift[sk].missing = Math.max(0, byShift[sk].required - byShift[sk].assigned);
      });

      dailyCoverageMap[isoDate] = {
        date: isoDate,
        dayLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
        required: dayRequired,
        assigned: dayAssigned,
        checkedIn: dayCheckedIn,
        missing: Math.max(0, dayRequired - dayAssigned),
        coverageRate: dayRequired > 0 ? Math.round((dayAssigned / dayRequired) * 100) : 0,
        byShift,
      };
    }

    const dailyCoverage = Object.values(dailyCoverageMap);

    return {
      data: {
        items,
        uniqueNeighborhoods,
        uniqueStakes,
        uniqueCommittees,
        attendanceSummary,
        recruitmentSummary,
        ageSegmentation,
        dailyCoverage,
      }
    };
  } catch (err: any) {
    console.error("Critical error in getReportsData action:", err);
    return { error: "Ocurrió un error inesperado al cargar reportes." };
  }
}
