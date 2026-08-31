import { timingSafeEqual } from 'node:crypto';
import { dispatchPushQueue } from '@/lib/push/service';
import { dispatchNotificationInbox } from '@/lib/notifications/worker';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function run(request: Request, secret: string | undefined, scan: boolean) {
  if (!authorized(request, secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const inbox = await dispatchNotificationInbox(scan);
    return Response.json({ ...await dispatchPushQueue(scan), inbox });
  }
  catch {
    console.error('[PUSH] Falló el procesamiento de la cola.');
    return Response.json({ error: 'Push queue unavailable' }, { status: 503 });
  }
}

// Vercel daily fallback, independent of WhatsApp's enabled flag.
export async function GET(request: Request) { return run(request, process.env.CRON_SECRET, true); }
// Supabase webhook / minute scheduler. Only wakes the queue: never trusts body recipients or text.
export async function POST(request: Request) { return run(request, process.env.PUSH_DISPATCH_SECRET, new URL(request.url).searchParams.get('scan') === '1'); }
