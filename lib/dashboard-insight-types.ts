export type DashboardInsightTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

export interface DashboardInsightHighlight {
  id: string;
  label: string;
  icon: string;
  tone: DashboardInsightTone;
}

export interface DashboardInsight {
  template: string;
  highlights: DashboardInsightHighlight[];
  generatedAt: string;
}

export interface DashboardInsightCriticalShift {
  day: string;
  shift: string;
  committee: string;
  missing: number;
}

export interface DashboardInsightAreaCriticalShift {
  day: string;
  shift: string;
  committee: string;
  area: string;
  areaMissing: number;
  totalMissing: number;
  affectedAreas: number;
  configuredAreas: number;
}

export interface DashboardInsightAttendanceAttention {
  status: 'late' | 'absent';
  day: string;
  shift: string;
  count: number;
  minutesSinceStart: number;
  primaryCommittee: string;
  affectedCommittees: number;
}

export interface DashboardInsightContext {
  effectiveCommitteeScope: string;
  canSeeGlobal: boolean;
  globalCoveragePercentage: number;
  criticalShifts: DashboardInsightCriticalShift[];
  areaCriticalShifts: DashboardInsightAreaCriticalShift[];
  openAttendanceSessions: number;
  staleOpenAttendanceSessions: number;
  attendanceAttention: DashboardInsightAttendanceAttention | null;
}

export function dashboardInsightsEqual(first: DashboardInsight | null, second: DashboardInsight | null) {
  if (first === second) return true;
  if (!first || !second || first.template !== second.template) return false;
  return JSON.stringify(first.highlights) === JSON.stringify(second.highlights);
}
