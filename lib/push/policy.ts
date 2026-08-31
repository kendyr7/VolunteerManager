import {
  hasCapability, normalizeAppRole, normalizeCoordinatorType,
  type AuthorizationSnapshot, type ConfigurablePermissionKey,
} from '@/lib/role-permissions';

export type PushKind = 'request' | 'coverage';
export type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushProfile = {
  id: string; role: string; coordinator_type: string | null;
  committee_id: string | null; status: string | null;
};

export function isPushRecipient(
  profile: PushProfile,
  permissions: Record<ConfigurablePermissionKey, boolean>,
  kind: PushKind,
  committeeId: string | null,
): boolean {
  if (profile.status === 'archived' || profile.status === 'inactive') return false;
  const role = normalizeAppRole(profile.role);
  const snapshot: AuthorizationSnapshot = {
    authenticated: true, userId: profile.id, userType: 'profile', role,
    coordinatorType: normalizeCoordinatorType(profile.coordinator_type) || 'committee',
    committeeId: profile.committee_id, committeeName: null, name: '', permissions,
  };
  if (role === 'Lector') return false;
  if (kind === 'request') {
    return hasCapability(snapshot, 'view_requests') && (
      hasCapability(snapshot, 'view_all_volunteers') ||
      Boolean(committeeId && committeeId === profile.committee_id)
    );
  }
  return hasCapability(snapshot, 'view_dashboard') && (
    hasCapability(snapshot, 'view_global_reports') ||
    Boolean(committeeId && committeeId === profile.committee_id)
  );
}

// Prevent subscriptions from becoming an arbitrary server-side HTTP proxy.
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    return url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname.endsWith('.push.services.mozilla.com') ||
      url.hostname === 'web.push.apple.com' ||
      url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.notify.windows.com');
  } catch { return false; }
}

export function parsePushSubscription(value: unknown): PushSubscriptionInput {
  const sub = value as Partial<PushSubscriptionInput> | null;
  const validKey = (key: unknown, bytes: number) => typeof key === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(key) && Buffer.from(key, 'base64url').length === bytes;
  if (!sub || !isAllowedPushEndpoint(sub.endpoint) ||
    !validKey(sub.keys?.p256dh, 65) || !validKey(sub.keys?.auth, 16)) {
    throw new Error('La suscripción del navegador no es válida.');
  }
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } };
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1));
}
