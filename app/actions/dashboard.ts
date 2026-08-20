'use server'

import { getAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { requireCapability } from "@/lib/authorization";
import { hasCapability } from "@/lib/role-permissions";
import { getActiveEventDays, formatDateShort, getOfficialShiftTime } from "@/lib/dates";
import { inferShiftsForSession } from "@/lib/session-utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface HeatmapShiftItem {
  shift: string;
  required: number;
  assigned: number;
  coverage: number;
}

export interface HeatmapDayData {
  day: string;
  shortLabel: string;
  dayLabel: string;
  shifts: HeatmapShiftItem[];
}

export interface DashboardCommitteeStatus {
  id: number;
  name: string;
  coverage: number;
  missing: number;
  status: 'success' | 'warning' | 'high_risk';
}

export interface CriticalShiftItem {
  id: number;
  day: string;
  shift: string;
  committee: string;
  enrolled: number;
  required: number;
  missing: number;
}

export interface DashboardGlobalStats {
  totalRecruited: number;
  targetVolunteers: number;
  recruitmentPercentage: number;
  globalCoveragePercentage: number;
  criticalAlerts: number;
  attendanceRate: number;
  checkedInCount: number;
  totalAssigned: number;
}

export interface DashboardOperationalData {
  canSeeGlobal: boolean;
  effectiveCommitteeScope: string;
  heatmapMatrix: HeatmapDayData[];
  volsPerDay: Record<string, number>;
  shiftsPerDay: Record<string, number>;
  totalVolsWithShifts: number;
  committeeStatus: DashboardCommitteeStatus[];
  criticalShifts: CriticalShiftItem[];
  globalStats: DashboardGlobalStats;
}

interface CommitteeRow {
  id: string;
  name: string;
  status?: string | null;
}

export async function getDashboardOperationalDataAction(
  requestedCommittee = 'todos'
): Promise<{ data?: DashboardOperationalData; error?: string }> {
  try {
    const authorization = await requireCapability('view_dashboard');
    const canSeeGlobal = hasCapability(authorization, 'view_global_reports');
    const userCommitteeId = authorization.committeeId;

    const supabase = getAdminClient();

    // Fetch active committees
    const { data: commsDataRaw, error: commsErr } = await supabase
      .from('committees')
      .select('id, name, status')
      .or('status.is.null,status.neq.archived');

    if (commsErr) {
      return { error: `Error loading committees: ${commsErr.message}` };
    }

    const activeCommittees = ((commsDataRaw || []) as CommitteeRow[]).filter(
      (committee) => (committee.status || '').toLowerCase() !== 'archived'
    );
    const committeeNameById = new Map<string, string>();
    activeCommittees.forEach((committee) => committeeNameById.set(committee.id, committee.name));

    // Determine effective committee filter
    let effectiveCommittee = 'todos';
    if (!canSeeGlobal) {
      if (!userCommitteeId) {
        return {
          data: {
            canSeeGlobal: false,
            effectiveCommitteeScope: '',
            heatmapMatrix: [],
            volsPerDay: {},
            shiftsPerDay: {},
            totalVolsWithShifts: 0,
            committeeStatus: [],
            criticalShifts: [],
            globalStats: {
              totalRecruited: 0,
              targetVolunteers: 0,
              recruitmentPercentage: 0,
              globalCoveragePercentage: 0,
              criticalAlerts: 0,
              attendanceRate: 0,
              checkedInCount: 0,
              totalAssigned: 0,
            },
          },
        };
      }
      effectiveCommittee = committeeNameById.get(userCommitteeId) || authorization.committeeName || '';
    } else {
      effectiveCommittee = requestedCommittee || 'todos';
    }

    // Event days (active official event days). Build these before the queries so
    // shifts and sessions outside the event never need to leave Postgres.
    const EVENT_DAYS_RAW = getActiveEventDays();
    const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date).split(' ')[0],
      dateNum: formatDateShort(date).split(' ')[1],
    }));
    const activeEventDayKeyList = EVENT_DAYS.map(day => day.key);
    const activeEventDayKeys = new Set(activeEventDayKeyList);

    // Fetch shift requirements, active volunteers, shifts, and attendance sessions.
    const [reqsData, volsData, shiftsData, sessionsData] = await Promise.all([
      fetchAllRows<{ committee_id: string; shift_key: string; required: number }>(
        supabase,
        'committee_shift_requirements',
        'committee_id, shift_key, required'
      ),
      fetchAllRows<{ id: string; committee_id: string; status: string }>(
        supabase,
        'volunteers',
        'id, committee_id, status',
        (q) => q.or('status.is.null,status.neq.archived')
      ),
      fetchAllRows<{ id: string; volunteer_id: string; day_key: string; shift_key: string; checked_in?: boolean }>(
        supabase,
        'shifts',
        'id, volunteer_id, day_key, shift_key, checked_in',
        (query) => query.in('day_key', activeEventDayKeyList)
      ),
      fetchAllRows<{ id: string; volunteer_id: string; day_key: string; started_at: string; ended_at?: string | null; status?: string }>(
        supabase,
        'attendance_sessions',
        'id, volunteer_id, day_key, started_at, ended_at, status',
        (query) => query.in('day_key', activeEventDayKeyList)
      ),
    ]);

    // Build requirements by committee name
    const committeeRequirements: Record<string, Record<string, number>> = {};
    activeCommittees.forEach((committee) => {
      committeeRequirements[committee.name] = { T1: 0, T2: 0, T3: 0, T4: 0 };
    });

    (reqsData || []).forEach(row => {
      const cName = committeeNameById.get(row.committee_id);
      if (cName && committeeRequirements[cName]) {
        committeeRequirements[cName][row.shift_key] = row.required || 0;
      }
    });

    // Map volunteers to committee name
    const volunteerCommitteeMap = new Map<string, string>();
    (volsData || []).forEach(v => {
      if ((v.status || '').toLowerCase() !== 'archived') {
        const cName = committeeNameById.get(v.committee_id) || 'Sin comité';
        volunteerCommitteeMap.set(v.id, cName);
      }
    });

    // Target committees to aggregate
    const isFiltered = effectiveCommittee && effectiveCommittee !== 'todos' && effectiveCommittee !== 'all';
    const targetCommittees: string[] = isFiltered
      ? [effectiveCommittee]
      : activeCommittees.map((committee) => committee.name);

    const relevantCommitteesSet = new Set(targetCommittees);

    // Index assignments once. Looking through the full shifts array for every
    // attendance session grows quadratically as attendance history increases.
    const assignedShiftsByVolunteerDay = new Map<string, string[]>();
    (shiftsData || []).forEach(shift => {
      if (!shift.volunteer_id || !activeEventDayKeys.has(shift.day_key)) return;
      const key = `${shift.volunteer_id}-${shift.day_key}`;
      const assigned = assignedShiftsByVolunteerDay.get(key) || [];
      if (!assigned.includes(shift.shift_key)) assigned.push(shift.shift_key);
      assignedShiftsByVolunteerDay.set(key, assigned);
    });

    // Primary source of truth for attendance: attendance_sessions.
    const checkedInMap: Record<string, boolean> = {};
    (sessionsData || []).forEach(sess => {
      const vId = sess.volunteer_id;
      const dayKey = sess.day_key;
      if (!vId || !dayKey) return;

      const startedAt = sess.started_at;
      const endedAt = sess.ended_at || null;

      const assignedForVolAndDay = assignedShiftsByVolunteerDay.get(`${vId}-${dayKey}`) || [];

      const targetShiftKeys = assignedForVolAndDay.length > 0 ? assignedForVolAndDay : ['T1', 'T2', 'T3', 'T4'];
      const relatedShifts = inferShiftsForSession(dayKey, startedAt, endedAt, targetShiftKeys);

      relatedShifts.forEach(rs => {
        const k = `${vId}-${dayKey}-${rs.shiftKey}`;
        checkedInMap[k] = true;
      });
    });

    // Fallback: shifts table legacy check-in flag
    (shiftsData || []).forEach(s => {
      if (s.checked_in) {
        checkedInMap[`${s.volunteer_id}-${s.day_key}-${s.shift_key}`] = true;
      }
    });

    // Map shifts by volunteer strictly for active event days
    const globalShifts: Record<string, Record<string, string[]>> = {};
    (volsData || []).forEach(v => {
      if ((v.status || '').toLowerCase() !== 'archived') {
        globalShifts[v.id] = Object.fromEntries(EVENT_DAYS.map(d => [d.key, []]));
      }
    });

    (shiftsData || []).forEach(shift => {
      if (!shift.volunteer_id || !activeEventDayKeys.has(shift.day_key)) return;
      if (!globalShifts[shift.volunteer_id]) {
        globalShifts[shift.volunteer_id] = Object.fromEntries(EVENT_DAYS.map(d => [d.key, []]));
      }
      if (!globalShifts[shift.volunteer_id][shift.day_key]) {
        globalShifts[shift.volunteer_id][shift.day_key] = [];
      }
      if (!globalShifts[shift.volunteer_id][shift.day_key].includes(shift.shift_key)) {
        globalShifts[shift.volunteer_id][shift.day_key].push(shift.shift_key);
      }
    });

    // Calculate Heatmap Matrix
    const heatmapMatrix: HeatmapDayData[] = EVENT_DAYS.map(day => {
      const shiftsItems: HeatmapShiftItem[] = ['T1', 'T2', 'T3', 'T4'].map(shiftId => {
        let totalReq = 0;
        let totalAssignedShift = 0;

        targetCommittees.forEach(commName => {
          totalReq += committeeRequirements[commName]?.[shiftId] ?? 0;

          // Count volunteers belonging to this committee with this shift
          volunteerCommitteeMap.forEach((cName, volId) => {
            if (cName === commName) {
              const vShifts = globalShifts[volId];
              if (vShifts && vShifts[day.key] && vShifts[day.key].includes(shiftId)) {
                totalAssignedShift++;
              }
            }
          });
        });

        const coverage = totalReq === 0 ? 1 : totalAssignedShift / totalReq;
        return { shift: shiftId, required: totalReq, assigned: totalAssignedShift, coverage };
      });

      return { day: day.key, shortLabel: day.label, dayLabel: day.dateNum, shifts: shiftsItems };
    });

    // Volunteers per day (unique in relevant scope)
    const volsPerDay: Record<string, number> = {};
    const shiftsPerDay: Record<string, number> = {};
    const uniqueVolsTotal = new Set<string>();

    EVENT_DAYS.forEach(day => {
      const uniqueVolsDay = new Set<string>();
      let dayShiftsCount = 0;

      volunteerCommitteeMap.forEach((cName, volId) => {
        if (relevantCommitteesSet.has(cName)) {
          const vShifts = globalShifts[volId];
          if (vShifts && vShifts[day.key] && vShifts[day.key].length > 0) {
            uniqueVolsDay.add(volId);
            uniqueVolsTotal.add(volId);
            dayShiftsCount += vShifts[day.key].length;
          }
        }
      });

      volsPerDay[day.key] = uniqueVolsDay.size;
      shiftsPerDay[day.key] = dayShiftsCount;
    });

    // Committee Status list
    const committeesToProcess = isFiltered
      ? activeCommittees.filter((committee) => committee.name === effectiveCommittee)
      : activeCommittees;

    const committeeStatus: DashboardCommitteeStatus[] = committeesToProcess.map((committee, index) => {
      let totalReq = 0;
      let totalAssignedComm = 0;
      let totalMissing = 0;

      EVENT_DAYS.forEach(day => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[committee.name]?.[shiftId] ?? 0;
          totalReq += req;

          let count = 0;
          volunteerCommitteeMap.forEach((cName, volId) => {
            if (cName === committee.name) {
              const shifts = globalShifts[volId];
              if (shifts && shifts[day.key] && shifts[day.key].includes(shiftId)) {
                count++;
              }
            }
          });

          totalAssignedComm += Math.min(count, req);
          if (count < req) {
            totalMissing += (req - count);
          }
        });
      });

      const coverage = totalReq > 0 ? Math.round((totalAssignedComm / totalReq) * 100) : 100;
      let status: 'success' | 'warning' | 'high_risk' = "success";
      if (coverage < 60) status = "high_risk";
      else if (coverage < 85) status = "warning";

      return {
        id: index + 1,
        name: committee.name,
        coverage,
        missing: totalMissing,
        status,
      };
    }).sort((a: DashboardCommitteeStatus, b: DashboardCommitteeStatus) => a.coverage - b.coverage);

    // Critical Shifts (top 5 shortages)
    const criticalList: CriticalShiftItem[] = [];
    EVENT_DAYS.forEach(day => {
      targetCommittees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          if (req === 0) return;

          let count = 0;
          volunteerCommitteeMap.forEach((cName, volId) => {
            if (cName === comm) {
              const shifts = globalShifts[volId];
              if (shifts && shifts[day.key] && shifts[day.key].includes(shiftId)) {
                count++;
              }
            }
          });

          if (count < req) {
            const shiftInfo = getOfficialShiftTime(formatDateShort(day.date), shiftId);
            const dayLabel = format(day.date, "EEEE d 'de' MMMM", { locale: es });
            criticalList.push({
              id: 0,
              day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
              shift: `${shiftId} (${shiftInfo.timeLabel})`,
              committee: comm,
              enrolled: count,
              required: req,
              missing: req - count,
            });
          }
        });
      });
    });

    const criticalShifts = criticalList
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 5)
      .map((item, index) => ({ ...item, id: index + 1 }));

    // Global stats: exact matching to dashboard calculations
    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    let criticalAlerts = 0;

    EVENT_DAYS.forEach(day => {
      targetCommittees.forEach(comm => {
        ['T1', 'T2', 'T3', 'T4'].forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          let count = 0;
          volunteerCommitteeMap.forEach((cName, volId) => {
            if (cName === comm) {
              const shifts = globalShifts[volId];
              if (shifts && shifts[day.key] && shifts[day.key].includes(shiftId)) {
                count++;
              }
            }
          });

          totalAssignedInRequired += Math.min(count, req);
          if (count < req) {
            criticalAlerts++;
          }
        });
      });
    });

    let totalRecruited = 0;
    const relevantVolunteerIds = new Set<string>();
    volunteerCommitteeMap.forEach((cName, volId) => {
      if (relevantCommitteesSet.has(cName)) {
        totalRecruited++;
        relevantVolunteerIds.add(volId);
      }
    });

    const targetVolunteers = totalRequired;
    const recruitmentPercentage = targetVolunteers > 0
      ? Math.round((totalRecruited / targetVolunteers) * 100)
      : 0;

    const globalCoveragePercentage = totalRequired > 0
      ? Math.round((totalAssignedInRequired / totalRequired) * 100)
      : 100;

    let totalGlobalAssigned = 0;
    let totalGlobalCheckedIn = 0;
    Object.entries(globalShifts).forEach(([volId, days]) => {
      if (!relevantVolunteerIds.has(volId)) return;
      Object.entries(days).forEach(([day, shifts]) => {
        shifts.forEach(shift => {
          totalGlobalAssigned++;
          if (checkedInMap[`${volId}-${day}-${shift}`]) {
            totalGlobalCheckedIn++;
          }
        });
      });
    });

    const attendanceRate = totalGlobalAssigned > 0
      ? Math.round((totalGlobalCheckedIn / totalGlobalAssigned) * 100)
      : 0;

    const globalStats: DashboardGlobalStats = {
      totalRecruited,
      targetVolunteers,
      recruitmentPercentage,
      globalCoveragePercentage,
      criticalAlerts,
      attendanceRate,
      checkedInCount: totalGlobalCheckedIn,
      totalAssigned: totalGlobalAssigned,
    };

    return {
      data: {
        canSeeGlobal,
        effectiveCommitteeScope: effectiveCommittee,
        heatmapMatrix,
        volsPerDay,
        shiftsPerDay,
        totalVolsWithShifts: uniqueVolsTotal.size,
        committeeStatus,
        criticalShifts,
        globalStats,
      },
    };
  } catch (err: unknown) {
    console.error('Error calculating dashboard operational data:', err);
    return { error: err instanceof Error ? err.message : 'Error al calcular datos del dashboard' };
  }
}
