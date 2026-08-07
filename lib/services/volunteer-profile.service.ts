import { getUnifiedShiftTimes, getUnifiedShiftWorkedMinutes, formatUnifiedDuration } from '@/lib/shift-calculations';

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
  activeShift: VolunteerShiftItem | null;
  nextShift: VolunteerShiftItem | null;
  
  isCheckedInNow: boolean;
  isWorkingNow: boolean;
}

/**
 * Pure domain function to build complete Volunteer Profile ViewModel metrics.
 * Pure logic - zero React dependencies.
 */
export function getVolunteerProfileMetrics(
  volunteerId: string,
  shiftsData: any[] = [],
  auditLogsData: any[] = []
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
      activeShift: null,
      nextShift: null,
      isCheckedInNow: false,
      isWorkingNow: false,
    };
  }

  // Filter shifts belonging to this volunteer (O(1) if already filtered or O(k) for volunteer shifts)
  const userShifts = shiftsData.filter((s: any) => {
    const sVolId = s.volunteer_id || s.volunteerId || s.volunteer?.id;
    return !sVolId || sVolId === volunteerId;
  });

  const countedKeys = new Set<string>();
  let totalWorkedMinutes = 0;
  let completedShiftsCount = 0;
  const shiftsList: VolunteerShiftItem[] = [];

  // Process explicitly assigned / recorded shifts in DB
  userShifts.forEach((rec: any) => {
    const dayKey = rec.day_key || rec.dayKey || '';
    const shiftKey = rec.shift_key || rec.shiftKey || '';
    if (!dayKey || !shiftKey) return;

    const key = `${dayKey}-${shiftKey}`;
    const isCheckedOut = Boolean(rec.checked_out || rec.checked_out_at || rec.status === 'completed');
    const isCheckedIn = Boolean(rec.checked_in || rec.checked_in_at || rec.status === 'confirmed');

    let workedMinutes = 0;
    if (isCheckedOut || isCheckedIn) {
      workedMinutes = getUnifiedShiftWorkedMinutes(dayKey, shiftKey, userShifts, auditLogsData);
    }

    if (isCheckedOut && !countedKeys.has(key)) {
      countedKeys.add(key);
      totalWorkedMinutes += workedMinutes;
      completedShiftsCount++;
    }

    shiftsList.push({
      id: rec.id || key,
      dayKey,
      shiftKey,
      isCheckedIn,
      isCheckedOut,
      checkedInAt: rec.checked_in_at || null,
      checkedOutAt: rec.checked_out_at || null,
      workedMinutes,
    });
  });

  // Calculate dynamic KPI display formatting
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
    activeShift,
    nextShift,
    isCheckedInNow: Boolean(activeShift),
    isWorkingNow: Boolean(activeShift),
  };
}
