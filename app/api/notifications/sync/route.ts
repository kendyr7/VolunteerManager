import { notificationAccess, notificationError } from '@/lib/notifications/access';
import { dispatchNotificationInbox } from '@/lib/notifications/worker';
import { requireSameOrigin } from '@/lib/push/http';
import { consumeAuthRateLimit } from '@/lib/auth-rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { profileId, scopes } = await notificationAccess();
    if (!scopes.length) return Response.json({ processed: 0 });
    const limit = await consumeAuthRateLimit({ scope: 'notification-inbox-sync', identifier: profileId, limit: 6, windowSeconds: 60 });
    if (!limit.allowed) return Response.json({ error: 'Espera un momento antes de actualizar.' }, { status: 429 });
    // Only internal records. Loading the bell never sends push or requests permission.
    return Response.json(await dispatchNotificationInbox(true), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return notificationError(error); }
}
