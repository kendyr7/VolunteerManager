import { getUnifiedShiftTimes, getUnifiedShiftWorkedMinutes, formatUnifiedDuration } from '@/lib/shift-calculations';
import { inferAdditionalCompletedShifts, inferShiftsForSession, calculateSessionMinutes, getSessionShiftCompletedAt } from '@/lib/session-utils';
import { isSimulationEventDay, isOperationalEventDay } from '@/lib/dates';

export interface VolunteerShiftItem {
  id: string;
  dayKey: string;
  shiftKey: string;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  workedMinutes: number;
  isAdditional: boolean;
}

export interface VolunteerSessionItem {
  id: string;
  dayKey: string;
  startedAt: string;
  endedAt?: string | null;
  status: 'open' | 'completed';
  autoClosed: boolean;
  workedMinutes: number;
  provisionalMinutes: number;
  relatedShiftKeys: string[];
  additionalShiftKeys: string[];
}

export interface VolunteerProfileMetrics {
  volunteerId: string;
  totalWorkedMinutes: number;
  totalWorkedDisplay: string;
  kpiValue: string;
  kpiLabel: 'MIN.' | 'HORAS';
  
  completedShiftsCount: number;
  scheduledCompletedShiftsCount: number;
  additionalCompletedShiftsCount: number;
  scheduledShiftsCount: number;
  attendancePercentage: number;
  
  shiftsList: VolunteerShiftItem[];
  sessionsList: VolunteerSessionItem[];
  activeSession: VolunteerSessionItem | null;
  activeShift: VolunteerShiftItem | null;
  nextShift: VolunteerShiftItem | null;
  
  isCheckedInNow: boolean;
  isWorkingNow: boolean;
}

/**
 * Pure domain function to build complete Volunteer Profile ViewModel metrics.
 * Uses attendance_sessions as Primary Source of Truth with fallback to legacy shifts.
 */
export function getVolunteerProfileMetrics(
  volunteerId: string,
  shiftsData: any[] = [],
  auditLogsData: any[] = [],
  sessionsData: any[] = [],
  options: { includeSimulation?: boolean } = {}
): VolunteerProfileMetrics {
  const includeSimulation = options.includeSimulation === true;
  if (!volunteerId) {
    return {
      volunteerId: '',
      totalWorkedMinutes: 0,
      totalWorkedDisplay: '0 min',
      kpiValue: '0',
      kpiLabel: 'HORAS',
      completedShiftsCount: 0,
      scheduledCompletedShiftsCount: 0,
      additionalCompletedShiftsCount: 0,
      scheduledShiftsCount: 0,
      attendancePercentage: 100,
      shiftsList: [],
      sessionsList: [],
      activeSession: null,
      activeShift: null,
      nextShift: null,
      isCheckedInNow: false,
      isWorkingNow: false,
    };
  }

  // Filter shifts belonging to this volunteer
  const userShifts = shiftsData.filter((s: any) => {
    const sVolId = s.volunteer_id || s.volunteerId || s.volunteer?.id;
    return !sVolId || sVolId === volunteerId;
  });

  // Filter attendance sessions belonging to this volunteer
  const userSessions = sessionsData.filter((s: any) => {
    const sVolId = s.volunteer_id || s.volunteerId;
    return !sVolId || sVolId === volunteerId;
  });

  let totalWorkedMinutes = 0;
  let scheduledCompletedShiftsCount = 0;
  let additionalCompletedShiftsCount = 0;
  const sessionsList: VolunteerSessionItem[] = [];
  const coveredShiftKeySet = new Set<string>();
  const scheduledCompletedKeySet = new Set<string>();
  const additionalCompletedKeySet = new Set<string>();
  const additionalShiftDetails = new Map<string, { dayKey: string; shiftKey: string; startedAt: string; endedAt: string | null }>();
  const daysWithSessionsSet = new Set<string>();

  let isCheckedInNow = false;
  let activeSessionItem: VolunteerSessionItem | null = null;

  // Primary Path: Calculate worked minutes from continuous attendance_sessions
  userSessions.forEach((sess: any) => {
    const dayKey = sess.day_key || sess.dayKey || '';
    const startedAt = sess.started_at || sess.startedAt || '';
    const endedAt = sess.ended_at || sess.endedAt || null;
    const status = sess.status || (endedAt ? 'completed' : 'open');
    const autoClosed = Boolean(sess.auto_closed || sess.autoClosed);

    const isOperationalDay = isOperationalEventDay(dayKey);
    if (!isOperationalDay) return;

    const countsTowardOfficialMetrics = isOperationalDay && (includeSimulation || !isSimulationEventDay(dayKey));

    if (dayKey) {
      daysWithSessionsSet.add(dayKey.toLowerCase().trim());
    }

    const calc = calculateSessionMinutes(startedAt, endedAt);
    if (countsTowardOfficialMetrics && status === 'completed' && calc.isClosed) {
      totalWorkedMinutes += calc.totalWorkedMinutes;
    }

    const assignedShiftKeys = userShifts
      .filter((s: any) => (s.day_key || s.dayKey || '').toLowerCase().trim() === dayKey.toLowerCase().trim())
      .map((s: any) => s.shift_key || s.shiftKey);

    const relatedShifts = assignedShiftKeys.length > 0
      ? inferShiftsForSession(dayKey, startedAt, endedAt, assignedShiftKeys)
      : [];
    const additionalShifts = status === 'completed'
      ? inferAdditionalCompletedShifts(dayKey, startedAt, endedAt, assignedShiftKeys)
      : [];
    const assignedRelatedKeys = relatedShifts.map(s => s.shiftKey);
    const additionalKeys = additionalShifts.map(s => s.shiftKey);
    const relatedKeys = Array.from(new Set([...assignedRelatedKeys, ...additionalKeys]));

    assignedRelatedKeys.forEach(k => {
      if (status === 'completed' || getSessionShiftCompletedAt(dayKey, k, startedAt, endedAt, assignedShiftKeys)) {
        const key = `${dayKey}-${k}`;
        coveredShiftKeySet.add(key);
        if (countsTowardOfficialMetrics && !scheduledCompletedKeySet.has(key)) {
          scheduledCompletedKeySet.add(key);
          scheduledCompletedShiftsCount++;
        }
      }
    });

    additionalKeys.forEach(k => {
      const key = `${dayKey}-${k}`;
      coveredShiftKeySet.add(key);
      additionalShiftDetails.set(key, { dayKey, shiftKey: k, startedAt, endedAt });
      if (countsTowardOfficialMetrics && !additionalCompletedKeySet.has(key)) {
        additionalCompletedKeySet.add(key);
        additionalCompletedShiftsCount++;
      }
    });

    const sessItem: VolunteerSessionItem = {
      id: sess.id || `${dayKey}-${startedAt}`,
      dayKey,
      startedAt,
      endedAt,
      status,
      autoClosed,
      workedMinutes: calc.totalWorkedMinutes,
      provisionalMinutes: calc.provisionalMinutes,
      relatedShiftKeys: relatedKeys,
      additionalShiftKeys: additionalKeys,
    };

    sessionsList.push(sessItem);

    if (status === 'open') {
      isCheckedInNow = true;
      activeSessionItem = sessItem;
    }
  });

  // Fallback Path: Evaluate legacy shift worked minutes ONLY for days without attendance_sessions
  const shiftsList: VolunteerShiftItem[] = [];
  const countedKeys = new Set<string>();

  userShifts.forEach((rec: any) => {
    const dayKey = rec.day_key || rec.dayKey || '';
    const shiftKey = rec.shift_key || rec.shiftKey || '';
    if (!dayKey || !shiftKey) return;

    const isOperationalDay = isOperationalEventDay(dayKey);
    if (!isOperationalDay) return;

    const normDayKey = dayKey.toLowerCase().trim();
    const hasSessionForThisDay = daysWithSessionsSet.has(normDayKey);
    const countsTowardOfficialMetrics = isOperationalDay && (includeSimulation || !isSimulationEventDay(dayKey));

    const key = `${dayKey}-${shiftKey}`;
    const isCheckedOut = Boolean(rec.checked_out || rec.checked_out_at || rec.status === 'completed');
    const isCheckedIn = Boolean(rec.checked_in || rec.checked_in_at || rec.status === 'confirmed');

    let workedMinutes = 0;
    if (isCheckedOut || isCheckedIn) {
      workedMinutes = getUnifiedShiftWorkedMinutes(dayKey, shiftKey, userShifts, auditLogsData);
    }

    if (countsTowardOfficialMetrics && !hasSessionForThisDay && isCheckedOut && !countedKeys.has(key)) {
      countedKeys.add(key);
      totalWorkedMinutes += workedMinutes;
      scheduledCompletedShiftsCount++;
    }

    if (!hasSessionForThisDay && isCheckedIn && !isCheckedOut) {
      isCheckedInNow = true;
    }

    shiftsList.push({
      id: rec.id || key,
      dayKey,
      shiftKey,
      isCheckedIn: isCheckedIn || coveredShiftKeySet.has(key),
      isCheckedOut: isCheckedOut || coveredShiftKeySet.has(key),
      checkedInAt: rec.checked_in_at || null,
      checkedOutAt: rec.checked_out_at || null,
      workedMinutes,
      isAdditional: false,
    });
  });

  additionalShiftDetails.forEach((detail, key) => {
    if (shiftsList.some(shift => `${shift.dayKey}-${shift.shiftKey}` === key)) return;
    shiftsList.push({
      id: `additional-${volunteerId}-${key}`,
      dayKey: detail.dayKey,
      shiftKey: detail.shiftKey,
      isCheckedIn: false,
      isCheckedOut: true,
      checkedInAt: detail.startedAt,
      checkedOutAt: detail.endedAt,
      workedMinutes: 0,
      isAdditional: true,
    });
  });

  // Dynamic KPI display formatting
  let kpiValue = '0';
  let kpiLabel: 'MIN.' | 'HORAS' = 'HORAS';

  if (totalWorkedMinutes > 0 && totalWorkedMinutes < 60) {
    kpiValue = `${totalWorkedMinutes}`;
    kpiLabel = 'MIN.';
  } else if (totalWorkedMinutes >= 60) {
    kpiValue = formatUnifiedDuration(totalWorkedMinutes);
    kpiLabel = 'HORAS';
  }

  const scheduledShiftsCount = userShifts.filter((shift: any) => {
    const dKey = shift.day_key || shift.dayKey;
    return isOperationalEventDay(dKey) && (includeSimulation || !isSimulationEventDay(dKey));
  }).length;
  const attendancePercentage = scheduledShiftsCount > 0
    ? Math.round((scheduledCompletedShiftsCount / scheduledShiftsCount) * 100)
    : 100;
  const completedShiftsCount = scheduledCompletedShiftsCount + additionalCompletedShiftsCount;

  const activeShift = shiftsList.find(s => s.isCheckedIn && !s.isCheckedOut) || null;
  const nextShift = shiftsList.find(s => !s.isCheckedIn && !s.isCheckedOut) || null;

  return {
    volunteerId,
    totalWorkedMinutes,
    totalWorkedDisplay: formatUnifiedDuration(totalWorkedMinutes),
    kpiValue,
    kpiLabel,
    completedShiftsCount,
    scheduledCompletedShiftsCount,
    additionalCompletedShiftsCount,
    scheduledShiftsCount,
    attendancePercentage,
    shiftsList,
    sessionsList,
    activeSession: activeSessionItem,
    activeShift,
    nextShift,
    isCheckedInNow,
    isWorkingNow: isCheckedInNow,
  };
}
