import { getUnifiedShiftTimes, getUnifiedShiftWorkedMinutes, formatUnifiedDuration } from '@/lib/shift-calculations';
import { inferShiftsForSession, calculateSessionMinutes } from '@/lib/session-utils';

export interface VolunteerShiftItem {
  id: string;
  dayKey: string;
  shiftKey: string;
  isCheckedIn: boolean;
  isCheckedOut: boolean;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  workedMinutes: number;
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
}

export interface VolunteerProfileMetrics {
  volunteerId: string;
  totalWorkedMinutes: number;
  totalWorkedDisplay: string;
  kpiValue: string;
  kpiLabel: 'MIN.' | 'HORAS';
  
  completedShiftsCount: number;
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
  sessionsData: any[] = []
): VolunteerProfileMetrics {
  if (!volunteerId) {
    return {
      volunteerId: '',
      totalWorkedMinutes: 0,
      totalWorkedDisplay: '0 min',
      kpiValue: '0',
      kpiLabel: 'HORAS',
      completedShiftsCount: 0,
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
  let completedShiftsCount = 0;
  const sessionsList: VolunteerSessionItem[] = [];
  const coveredShiftKeySet = new Set<string>();
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

    if (dayKey) {
      daysWithSessionsSet.add(dayKey.toLowerCase().trim());
    }

    const calc = calculateSessionMinutes(startedAt, endedAt);
    if (status === 'completed' && calc.isClosed) {
      totalWorkedMinutes += calc.totalWorkedMinutes;
    }

    const assignedShiftKeys = userShifts
      .filter((s: any) => (s.day_key || s.dayKey || '').toLowerCase().trim() === dayKey.toLowerCase().trim())
      .map((s: any) => s.shift_key || s.shiftKey);

    const relatedShifts = inferShiftsForSession(dayKey, startedAt, endedAt, assignedShiftKeys.length > 0 ? assignedShiftKeys : ['T1', 'T2', 'T3', 'T4']);
    const relatedKeys = relatedShifts.map(s => s.shiftKey);

    if (status === 'completed') {
      relatedKeys.forEach(k => {
        if (!coveredShiftKeySet.has(`${dayKey}-${k}`)) {
          coveredShiftKeySet.add(`${dayKey}-${k}`);
          completedShiftsCount++;
        }
      });
    }

    const sessItem: VolunteerSessionItem = {
      id: sess.id || `${dayKey}-${startedAt}`,
      dayKey,
      startedAt,
      endedAt,
      status,
      autoClosed,
      workedMinutes: calc.totalWorkedMinutes,
      provisionalMinutes: calc.provisionalMinutes,
      relatedShiftKeys: relatedKeys
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

    const normDayKey = dayKey.toLowerCase().trim();
    const hasSessionForThisDay = daysWithSessionsSet.has(normDayKey);

    const key = `${dayKey}-${shiftKey}`;
    const isCheckedOut = Boolean(rec.checked_out || rec.checked_out_at || rec.status === 'completed');
    const isCheckedIn = Boolean(rec.checked_in || rec.checked_in_at || rec.status === 'confirmed');

    let workedMinutes = 0;
    if (isCheckedOut || isCheckedIn) {
      workedMinutes = getUnifiedShiftWorkedMinutes(dayKey, shiftKey, userShifts, auditLogsData);
    }

    if (!hasSessionForThisDay && isCheckedOut && !countedKeys.has(key)) {
      countedKeys.add(key);
      totalWorkedMinutes += workedMinutes;
      completedShiftsCount++;
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

  const scheduledShiftsCount = userShifts.length;
  const attendancePercentage = scheduledShiftsCount > 0
    ? Math.round((completedShiftsCount / scheduledShiftsCount) * 100)
    : 100;

  const activeShift = shiftsList.find(s => s.isCheckedIn && !s.isCheckedOut) || null;
  const nextShift = shiftsList.find(s => !s.isCheckedIn && !s.isCheckedOut) || null;

  return {
    volunteerId,
    totalWorkedMinutes,
    totalWorkedDisplay: formatUnifiedDuration(totalWorkedMinutes),
    kpiValue,
    kpiLabel,
    completedShiftsCount,
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
