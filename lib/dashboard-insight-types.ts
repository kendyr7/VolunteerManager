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

export interface DashboardInsightContext {
  effectiveCommitteeScope: string;
  canSeeGlobal: boolean;
  globalCoveragePercentage: number;
  criticalShifts: DashboardInsightCriticalShift[];
  areaCriticalShifts: DashboardInsightAreaCriticalShift[];
  openAttendanceSessions: number;
  staleOpenAttendanceSessions: number;
}
