import type { DashboardOperationalData } from '@/app/actions/dashboard';
import type { DashboardInsight } from '@/lib/dashboard-insight-types';
import { dashboardScopeMatches } from '@/lib/dashboard-scope';

export const DASHBOARD_SIMULATION_STORAGE_KEY = 'volunteer-manager.dashboard.include-simulation';
const DASHBOARD_SESSION_CACHE_KEY = 'volunteer-manager.dashboard.prepared-v1';

export interface PreparedDashboardSession {
  version: 1;
  includeSimulation: boolean;
  data: DashboardOperationalData;
  insight: DashboardInsight | null;
  preparedAt: string;
}

export function readPreparedDashboardSession(): PreparedDashboardSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.sessionStorage.getItem(DASHBOARD_SESSION_CACHE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<PreparedDashboardSession>;
    if (
      parsed.version !== 1
      || typeof parsed.includeSimulation !== 'boolean'
      || !parsed.data
      || typeof parsed.data.effectiveCommitteeScope !== 'string'
      || typeof parsed.preparedAt !== 'string'
    ) {
      window.sessionStorage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
      return null;
    }

    return parsed as PreparedDashboardSession;
  } catch {
    return null;
  }
}

export function writePreparedDashboardSession(
  payload: Omit<PreparedDashboardSession, 'version' | 'preparedAt'>
) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(DASHBOARD_SESSION_CACHE_KEY, JSON.stringify({
      version: 1,
      ...payload,
      preparedAt: new Date().toISOString(),
    } satisfies PreparedDashboardSession));
  } catch {
    // Storage can be disabled. The dashboard will use its normal loading path.
  }
}

export function clearPreparedDashboardSession() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
  } catch {
    // Clearing an optional cache must never block login or logout.
  }
}

export function preparedDashboardMatches(
  prepared: PreparedDashboardSession,
  targetCommittee: string,
  includeSimulation: boolean,
  authorizationKey: string
) {
  if (prepared.includeSimulation !== includeSimulation) return false;
  if (prepared.data.authorizationKey !== authorizationKey) return false;
  return dashboardScopeMatches(prepared.data.effectiveCommitteeScope, targetCommittee);
}
