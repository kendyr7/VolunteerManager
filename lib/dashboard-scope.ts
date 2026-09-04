import { hasCapability, type AuthorizationSnapshot } from '@/lib/role-permissions';

// Cache identity only; the server still authorizes every dashboard request.
export function getDashboardAuthorizationKey(snapshot: AuthorizationSnapshot): string {
  return JSON.stringify([
    snapshot.authenticated,
    snapshot.userId,
    snapshot.userType,
    snapshot.role,
    snapshot.coordinatorType,
    snapshot.committeeId,
    snapshot.committeeName,
    hasCapability(snapshot, 'view_dashboard'),
    hasCapability(snapshot, 'view_global_reports'),
  ]);
}

export function dashboardScopeMatches(effectiveScope: string, requestedScope: string): boolean {
  const normalize = (scope: string) => {
    const value = scope.trim().toLowerCase();
    return value === 'all' ? 'todos' : value;
  };
  return normalize(effectiveScope) === normalize(requestedScope);
}
