import { getAuthorizationSnapshot } from '@/lib/authorization';
import { roleDisplayName } from '@/lib/role-permissions';

export async function getCurrentUserSession() {
  try {
    const snapshot = await getAuthorizationSnapshot();
    return {
      userId: snapshot.userId,
      userName: snapshot.name,
      userRole: roleDisplayName(snapshot),
      committee: snapshot.committeeName,
      committeeId: snapshot.committeeId,
      coordinatorType: snapshot.coordinatorType,
      authenticated: snapshot.authenticated,
    };
  } catch (err) {
    console.error("Error fetching current user session:", err);
    return {
      userId: null,
      userName: '',
      userRole: 'Lector' as const,
      committee: null,
      committeeId: null,
      coordinatorType: null,
      authenticated: false,
    };
  }
}
