'use server'

import { getAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { requireCapability } from "@/lib/authorization";
import { hasCapability } from "@/lib/role-permissions";
import {
  getActiveEventDays,
  getAvailableShiftKeys,
  getOperationalEventDays,
  formatDateShort,
  getOfficialShiftTime,
} from "@/lib/dates";
import { inferShiftsForSession } from "@/lib/session-utils";
import { buildInstantDashboardInsight, generateDashboardInsight } from "@/lib/ai/dashboard-insight";
import type {
  DashboardInsight,
  DashboardInsightAreaCriticalShift,
} from "@/lib/dashboard-insight-types";
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

interface DashboardAreaRow {
  id: string;
  committee_id: string;
  name: string;
  status?: string | null;
}

interface DashboardAreaRequirementRow {
  area_id: string;
  day_key: string;
  shift_key: string;
  required_count: number;
}

interface DashboardShiftRow {
  id: string;
  volunteer_id: string;
  day_key: string;
  shift_key: string;
  checked_in?: boolean;
  area_id?: string | null;
}

export async function getDashboardOperationalDataAction(
  requestedCommittee = 'todos',
  includeSimulation = false,
  includeInsight = false,
  insightMode: 'instant' | 'ai' = 'ai'
): Promise<{ data?: DashboardOperationalData; insight?: DashboardInsight | null; error?: string }> {
  const actionStartedAt = performance.now();
  let queryDurationMs = 0;
  let insightDurationMs = 0;
  try {
    const safeRequestedCommittee = typeof requestedCommittee === 'string'
      ? requestedCommittee.trim().slice(0, 120) || 'todos'
      : 'todos';
    const shouldIncludeSimulation = includeSimulation === true;
    const shouldIncludeInsight = includeInsight === true;
    const authorization = await requireCapability('view_dashboard');
    const canSeeGlobal = hasCapability(authorization, 'view_global_reports');
    const userCommitteeId = authorization.committeeId;

    const supabase = getAdminClient();

    if (!canSeeGlobal && !userCommitteeId) {
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

    // Event days (active official event days). Build these before the queries so
    // shifts and sessions outside the event never need to leave Postgres.
    const EVENT_DAYS_RAW = getActiveEventDays({ includeSimulation: shouldIncludeSimulation });
    const EVENT_DAYS = EVENT_DAYS_RAW.map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date).split(' ')[0],
      dateNum: formatDateShort(date).split(' ')[1],
    }));
    const activeEventDayKeyList = EVENT_DAYS.map(day => day.key);
    const activeEventDayKeys = new Set(activeEventDayKeyList);
    const insightEventDays = (shouldIncludeInsight ? getOperationalEventDays() : EVENT_DAYS_RAW).map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date).split(' ')[0],
      dateNum: formatDateShort(date).split(' ')[1],
    }));
    const queriedEventDayKeyList = Array.from(new Set([
      ...activeEventDayKeyList,
      ...insightEventDays.map(day => day.key),
    ]));
    const queriedEventDayKeys = new Set(queriedEventDayKeyList);

    // Fetch every independent dataset in one network round. Previously the
    // committees request delayed all six operational queries.
    const queryStartedAt = performance.now();
    const [committeesResult, reqsData, volsData, shiftsData, sessionsData, areasData, areaRequirementsData] = await Promise.all([
      supabase
        .from('committees')
        .select('id, name, status')
        .or('status.is.null,status.neq.archived'),
      fetchAllRows<{ committee_id: string; shift_key: string; required: number }>(
        supabase,
        'committee_shift_requirements',
        'committee_id, shift_key, required',
        (query) => !canSeeGlobal && userCommitteeId
          ? query.eq('committee_id', userCommitteeId)
          : query
      ),
      fetchAllRows<{ id: string; committee_id: string; status: string }>(
        supabase,
        'volunteers',
        'id, committee_id, status',
        (query) => {
          let scopedQuery = query.or('status.is.null,status.neq.archived');
          if (!canSeeGlobal && userCommitteeId) scopedQuery = scopedQuery.eq('committee_id', userCommitteeId);
          return scopedQuery;
        }
      ),
      fetchAllRows<DashboardShiftRow>(
        supabase,
        'shifts',
        canSeeGlobal
          ? 'id, volunteer_id, day_key, shift_key, checked_in, area_id'
          : 'id, volunteer_id, day_key, shift_key, checked_in, area_id, volunteers!inner(committee_id)',
        (query) => {
          let scopedQuery = query.in('day_key', queriedEventDayKeyList);
          if (!canSeeGlobal && userCommitteeId) {
            scopedQuery = scopedQuery.eq('volunteers.committee_id', userCommitteeId);
          }
          return scopedQuery;
        }
      ),
      fetchAllRows<{ id: string; volunteer_id: string; day_key: string; started_at: string; ended_at?: string | null; status?: string }>(
        supabase,
        'attendance_sessions',
        canSeeGlobal
          ? 'id, volunteer_id, day_key, started_at, ended_at, status'
          : 'id, volunteer_id, day_key, started_at, ended_at, status, volunteers!inner(committee_id)',
        (query) => {
          let scopedQuery = query.in('day_key', queriedEventDayKeyList);
          if (!canSeeGlobal && userCommitteeId) {
            scopedQuery = scopedQuery.eq('volunteers.committee_id', userCommitteeId);
          }
          return scopedQuery;
        }
      ),
      shouldIncludeInsight
        ? fetchAllRows<DashboardAreaRow>(
            supabase,
            'committee_areas',
            'id, committee_id, name, status',
            (query) => {
              let scopedQuery = query.or('status.is.null,status.neq.archived');
              if (!canSeeGlobal && userCommitteeId) scopedQuery = scopedQuery.eq('committee_id', userCommitteeId);
              return scopedQuery;
            }
          )
        : Promise.resolve([]),
      shouldIncludeInsight
        ? fetchAllRows<DashboardAreaRequirementRow>(
            supabase,
            'area_shift_requirements',
            canSeeGlobal
              ? 'area_id, day_key, shift_key, required_count'
              : 'area_id, day_key, shift_key, required_count, committee_areas!inner(committee_id)',
            (query) => {
              let scopedQuery = query.in('day_key', queriedEventDayKeyList);
              if (!canSeeGlobal && userCommitteeId) {
                scopedQuery = scopedQuery.eq('committee_areas.committee_id', userCommitteeId);
              }
              return scopedQuery;
            }
          )
        : Promise.resolve([]),
    ]);
    queryDurationMs = performance.now() - queryStartedAt;

    if (committeesResult.error) {
      return { error: `Error loading committees: ${committeesResult.error.message}` };
    }

    const activeCommittees = ((committeesResult.data || []) as CommitteeRow[]).filter(
      (committee) => (committee.status || '').toLowerCase() !== 'archived'
    );
    const committeeNameById = new Map<string, string>();
    activeCommittees.forEach((committee) => committeeNameById.set(committee.id, committee.name));

    const effectiveCommittee = canSeeGlobal
      ? safeRequestedCommittee
      : committeeNameById.get(userCommitteeId || '') || authorization.committeeName || '';

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
      if (!shift.volunteer_id || !queriedEventDayKeys.has(shift.day_key)) return;
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
      if (!shift.volunteer_id || !queriedEventDayKeys.has(shift.day_key)) return;
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

    const assignmentCountByCommitteeSlot = new Map<string, number>();
    volunteerCommitteeMap.forEach((committee, volunteerId) => {
      const days = globalShifts[volunteerId];
      if (!days) return;
      Object.entries(days).forEach(([dayKey, shiftKeys]) => {
        shiftKeys.forEach(shiftKey => {
          const key = `${committee}|${dayKey}|${shiftKey}`;
          assignmentCountByCommitteeSlot.set(
            key,
            (assignmentCountByCommitteeSlot.get(key) || 0) + 1
          );
        });
      });
    });

    const assignedCount = (committee: string, dayKey: string, shiftKey: string) =>
      assignmentCountByCommitteeSlot.get(`${committee}|${dayKey}|${shiftKey}`) || 0;

    // Calculate Heatmap Matrix
    const heatmapMatrix: HeatmapDayData[] = EVENT_DAYS.map(day => {
      const availableShiftKeys = new Set(getAvailableShiftKeys(day.key));
      const shiftsItems: HeatmapShiftItem[] = ['T1', 'T2', 'T3', 'T4'].map(shiftId => {
        if (!availableShiftKeys.has(shiftId as 'T1' | 'T2' | 'T3' | 'T4')) {
          return { shift: shiftId, required: 0, assigned: 0, coverage: 1 };
        }

        let totalReq = 0;
        let totalAssignedShift = 0;

        targetCommittees.forEach(commName => {
          totalReq += committeeRequirements[commName]?.[shiftId] ?? 0;
          totalAssignedShift += assignedCount(commName, day.key, shiftId);
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
        getAvailableShiftKeys(day.key).forEach(shiftId => {
          const req = committeeRequirements[committee.name]?.[shiftId] ?? 0;
          totalReq += req;

          const count = assignedCount(committee.name, day.key, shiftId);

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
    const buildCriticalShifts = (
      days: typeof EVENT_DAYS,
      prioritizeUpcoming = false
    ): CriticalShiftItem[] => {
      const criticalList: CriticalShiftItem[] = [];
      days.forEach(day => {
        targetCommittees.forEach(comm => {
          getAvailableShiftKeys(day.key).forEach(shiftId => {
            const req = committeeRequirements[comm]?.[shiftId] ?? 0;
            if (req === 0) return;

            const count = assignedCount(comm, day.key, shiftId);

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

      return criticalList
        .sort((a, b) => {
          if (prioritizeUpcoming) {
            const aDay = Number(a.day.match(/\d+/)?.[0] || 0);
            const bDay = Number(b.day.match(/\d+/)?.[0] || 0);
            if (aDay !== bDay) return aDay - bDay;
          }
          return b.missing - a.missing;
        })
        .slice(0, 5)
        .map((item, index) => ({ ...item, id: index + 1 }));
    };

    const criticalShifts = buildCriticalShifts(EVENT_DAYS);
    const insightCriticalShifts = shouldIncludeInsight
      ? buildCriticalShifts(insightEventDays, true)
      : criticalShifts;

    const targetCommitteeIds = new Set(
      activeCommittees
        .filter(committee => relevantCommitteesSet.has(committee.name))
        .map(committee => committee.id)
    );
    const activeAreaById = new Map(
      (areasData || [])
        .filter(area => (
          targetCommitteeIds.has(area.committee_id)
          && (area.status || 'active').toLowerCase() !== 'archived'
        ))
        .map(area => [area.id, area])
    );
    const assignedByAreaSlot = new Map<string, number>();
    (shiftsData || []).forEach(shift => {
      if (!shift.area_id || !activeAreaById.has(shift.area_id)) return;
      const key = `${shift.area_id}|${shift.day_key}|${shift.shift_key}`;
      assignedByAreaSlot.set(key, (assignedByAreaSlot.get(key) || 0) + 1);
    });

    const buildAreaCriticalShifts = (
      days: typeof insightEventDays,
      prioritizeUpcoming = false
    ): DashboardInsightAreaCriticalShift[] => {
      const dayByKey = new Map(days.map(day => [day.key, day]));
      const groups = new Map<string, {
        day: (typeof days)[number];
        shiftKey: string;
        committee: string;
        configuredAreas: number;
        affected: Array<{ name: string; missing: number }>;
      }>();

      (areaRequirementsData || []).forEach(requirement => {
        const required = Number(requirement.required_count || 0);
        const area = activeAreaById.get(requirement.area_id);
        const day = dayByKey.get(requirement.day_key);
        if (!area || !day || required <= 0) return;
        if (!getAvailableShiftKeys(day.key).includes(requirement.shift_key as 'T1' | 'T2' | 'T3' | 'T4')) return;

        const committee = committeeNameById.get(area.committee_id);
        if (!committee) return;
        const groupKey = `${area.committee_id}|${requirement.day_key}|${requirement.shift_key}`;
        const group = groups.get(groupKey) || {
          day,
          shiftKey: requirement.shift_key,
          committee,
          configuredAreas: 0,
          affected: [],
        };
        group.configuredAreas += 1;

        const assigned = assignedByAreaSlot.get(
          `${requirement.area_id}|${requirement.day_key}|${requirement.shift_key}`
        ) || 0;
        if (assigned < required) {
          group.affected.push({ name: area.name, missing: required - assigned });
        }
        groups.set(groupKey, group);
      });

      return Array.from(groups.values())
        .filter(group => group.affected.length > 0)
        .map(group => {
          const prioritizedAreas = [...group.affected].sort((a, b) => b.missing - a.missing);
          const priorityArea = prioritizedAreas[0];
          const shiftInfo = getOfficialShiftTime(group.day.key, group.shiftKey);
          const dayLabel = format(group.day.date, "EEEE d 'de' MMMM", { locale: es });

          return {
            day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
            shift: `${group.shiftKey} (${shiftInfo.timeLabel})`,
            committee: group.committee,
            area: priorityArea.name,
            areaMissing: priorityArea.missing,
            totalMissing: prioritizedAreas.reduce((total, area) => total + area.missing, 0),
            affectedAreas: prioritizedAreas.length,
            configuredAreas: group.configuredAreas,
          };
        })
        .sort((a, b) => {
          if (prioritizeUpcoming) {
            const aDay = Number(a.day.match(/\d+/)?.[0] || 0);
            const bDay = Number(b.day.match(/\d+/)?.[0] || 0);
            if (aDay !== bDay) return aDay - bDay;
          }
          return b.totalMissing - a.totalMissing;
        })
        .slice(0, 5);
    };

    const insightAreaCriticalShifts = shouldIncludeInsight
      ? buildAreaCriticalShifts(insightEventDays, true)
      : [];

    // Global stats: exact matching to dashboard calculations
    let totalRequired = 0;
    let totalAssignedInRequired = 0;
    let criticalAlerts = 0;

    EVENT_DAYS.forEach(day => {
      targetCommittees.forEach(comm => {
        getAvailableShiftKeys(day.key).forEach(shiftId => {
          const req = committeeRequirements[comm]?.[shiftId] ?? 0;
          totalRequired += req;

          const count = assignedCount(comm, day.key, shiftId);

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
        if (!activeEventDayKeys.has(day)) return;
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

    const data: DashboardOperationalData = {
      canSeeGlobal,
      effectiveCommitteeScope: effectiveCommittee,
      heatmapMatrix,
      volsPerDay,
      shiftsPerDay,
      totalVolsWithShifts: uniqueVolsTotal.size,
      committeeStatus,
      criticalShifts,
      globalStats,
    };

    let insight: DashboardInsight | null | undefined;
    if (shouldIncludeInsight) {
      const openSessions = (sessionsData || []).filter(session => {
        if (!relevantVolunteerIds.has(session.volunteer_id) || session.ended_at) return false;
        const status = (session.status || 'open').toLowerCase();
        return status !== 'completed' && status !== 'closed';
      });
      const guatemalaDateKey = (value: Date | string) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Guatemala',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
        return `${part('year')}-${part('month')}-${part('day')}`;
      };
      const todayInGuatemala = guatemalaDateKey(new Date());
      const staleOpenAttendanceSessions = openSessions.filter(session => {
        const sessionDate = guatemalaDateKey(session.started_at);
        return Boolean(sessionDate && sessionDate < todayInGuatemala);
      }).length;

      const insightContext = {
        effectiveCommitteeScope: effectiveCommittee,
        canSeeGlobal,
        globalCoveragePercentage,
        criticalShifts: insightCriticalShifts,
        areaCriticalShifts: insightAreaCriticalShifts,
        openAttendanceSessions: openSessions.length,
        staleOpenAttendanceSessions,
      };
      const insightStartedAt = performance.now();
      insight = insightMode === 'instant'
        ? buildInstantDashboardInsight(authorization, insightContext)
        : await generateDashboardInsight(authorization, insightContext);
      insightDurationMs = performance.now() - insightStartedAt;
    }

    const totalDurationMs = performance.now() - actionStartedAt;
    if (totalDurationMs >= 1_000) {
      console.info('[DASHBOARD_TIMING]', JSON.stringify({
        scope: canSeeGlobal ? 'global' : 'committee',
        mode: shouldIncludeInsight ? insightMode : 'data_only',
        totalMs: Math.round(totalDurationMs),
        queryMs: Math.round(queryDurationMs),
        insightMs: Math.round(insightDurationMs),
      }));
    }
    return { data, insight };
  } catch (err: unknown) {
    console.error('Error calculating dashboard operational data:', err);
    return { error: err instanceof Error ? err.message : 'Error al calcular datos del dashboard' };
  }
}
