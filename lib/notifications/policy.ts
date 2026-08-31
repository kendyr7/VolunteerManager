import { isPushRecipient, type PushProfile } from '@/lib/push/policy';
import type { ConfigurablePermissionKey } from '@/lib/role-permissions';

export const NOTIFICATION_RETENTION_DAYS = 30;
export const NOTIFICATION_PAGE_SIZE = 30;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type NotificationItem = {
  id: string; kind: 'request' | 'coverage'; title: string; body: string;
  url: string; created_at: string; read_at: string | null;
};
export type NotificationPage = { items: NotificationItem[]; unreadCount: number; todayCount: number; nextCursor: string | null; asOf: string };

export function notificationScopes(profile: PushProfile, permissions: Record<ConfigurablePermissionKey, boolean>) {
  const result: string[] = [];
  for (const kind of ['request', 'coverage'] as const) {
    if (isPushRecipient(profile, permissions, kind, null)) result.push(`kind.eq.${kind}`);
    else if (profile.committee_id && UUID_PATTERN.test(profile.committee_id) && isPushRecipient(profile, permissions, kind, profile.committee_id)) {
      result.push(`and(kind.eq.${kind},committee_id.eq.${profile.committee_id})`);
    }
  }
  return result;
}

export function parseNotificationCursor(value: string | null): { date: string; id: string } | null {
  if (!value) return null;
  if (value.length > 300) throw new Error('Cursor inválido.');
  const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (!parsed || typeof parsed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(parsed.date) ||
    !Number.isFinite(Date.parse(parsed.date)) || typeof parsed.id !== 'string' || !UUID_PATTERN.test(parsed.id)) throw new Error('Cursor inválido.');
  return { date: parsed.date, id: parsed.id };
}

export function notificationFilter(scopes: string[], cursor: ReturnType<typeof parseNotificationCursor> = null) {
  if (!cursor) return scopes.join(',');
  const page = `or(created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},id.lt.${cursor.id}))`;
  return scopes.map(scope => `and(${scope},${page})`).join(',');
}

export function safeNotificationLink(value: string) {
  try {
    const url = new URL(value, 'https://inbox.invalid');
    return url.origin === 'https://inbox.invalid' && ['/dashboard', '/replacements'].includes(url.pathname)
      ? `${url.pathname}${url.search}` : '/dashboard';
  } catch { return '/dashboard'; }
}
