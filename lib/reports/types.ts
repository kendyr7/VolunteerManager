export type ReportShiftStatus = 'registered' | 'in_progress' | 'checkout_pending' | 'confirmed' | 'absent' | 'replaced';

export interface ReportItem {
  registrationId: string;
  volunteerId: string;
  volunteerName: string;
  age: number | null;
  phone: string;
  neighborhood: string;
  stake: string;
  committeeId: string;
  committeeName: string;
  areaId?: string | null;
  areaName?: string;
  date: string;
  shiftNumber: number;
  startTime: string;
  endTime: string;
  isExtended: boolean;
  status: ReportShiftStatus;
  durationMinutes: number;
}

export interface ReportVolunteer {
  id: string;
  name: string;
  age: number | null;
  phone: string;
  neighborhood: string;
  stake: string;
  committeeId: string;
  committeeName: string;
}

export interface ReportRequirement {
  committeeId: string;
  date: string;
  shiftKey: string;
  required: number;
}

export interface ReportEventDay {
  date: string;
  dayLabel: string;
  shiftKeys: string[];
}

export interface ReportCommittee {
  id: string;
  name: string;
}

export interface ReportFilters {
  search?: string;
  committeeIds?: readonly string[];
  neighborhoods?: readonly string[];
  stakes?: readonly string[];
  statuses?: readonly ReportShiftStatus[];
  dates?: readonly string[];
}

export interface ReportsData {
  items: ReportItem[];
  volunteers: ReportVolunteer[];
  requirements: ReportRequirement[];
  eventDays: ReportEventDay[];
  uniqueNeighborhoods: string[];
  uniqueStakes: string[];
  uniqueCommittees: ReportCommittee[];
}

export interface CommitteeAttendance {
  committeeId: string;
  committeeName: string;
  assigned: number;
  checkedIn: number;
  absent: number;
  required: number;
  attendanceRate: number;
  coverageRate: number;
}

export interface AttendanceSummary {
  totalAssigned: number;
  totalCheckedIn: number;
  totalAbsent: number;
  totalRequired: number;
  totalCoveredRequired: number;
  attendanceRate: number;
  coverageRate: number;
  byCommittee: CommitteeAttendance[];
  byShift: Array<{ shiftKey: string; assigned: number; checkedIn: number; required: number; rate: number }>;
}

export interface CommitteeRecruitment {
  committeeId: string;
  committeeName: string;
  totalVolunteers: number;
  totalRequiredShifts: number;
  assignedShifts: number;
  coveredRequiredShifts: number;
  missingShifts: number;
  coverageRate: number;
}

export interface AgeSegmentation {
  range: string;
  count: number;
  percentage: number;
}

export interface DailyCoverage {
  date: string;
  dayLabel: string;
  required: number;
  assigned: number;
  covered: number;
  checkedIn: number;
  missing: number;
  coverageRate: number;
  byShift: Record<string, { required: number; assigned: number; covered: number; checkedIn: number; missing: number }>;
}

export interface VolunteerReportSummary {
  id: string;
  name: string;
  phone: string;
  neighborhood: string;
  stake: string;
  committee: string;
  totalShifts: number;
  confirmed: number;
  absent: number;
  reliability: number;
  minutes: number;
}

export interface CommitteeReportSummary {
  id: string;
  name: string;
  volunteersCount: number;
  attendeesCount: number;
  totalShifts: number;
  confirmed: number;
  absent: number;
  pending: number;
  attendanceRate: number;
  totalMinutes: number;
  avgMinutes: number;
}

export interface ReportView {
  items: ReportItem[];
  recruitmentVolunteers: ReportVolunteer[];
  kpiStats: {
    totalShifts: number;
    confirmedShifts: number;
    absentShifts: number;
    pendingShifts: number;
    replacedShifts: number;
    totalMinutes: number;
    attendanceRate: number;
  };
  volunteerRanking: VolunteerReportSummary[];
  committeeSummary: CommitteeReportSummary[];
  committeeTotals: Omit<CommitteeReportSummary, 'id' | 'name'>;
  attendanceSummary: AttendanceSummary;
  recruitmentSummary: CommitteeRecruitment[];
  ageSegmentation: AgeSegmentation[];
  dailyCoverage: DailyCoverage[];
}
