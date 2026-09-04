import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { enqueueCoverageScan, loadPermissions, resolveEvent, type EventRow } from '@/lib/push/service';
import { isPushRecipient, type PushProfile } from '@/lib/push/policy';

function check(error: { message: string } | null) { if (error) throw new Error(error.message); }

// Generates one durable item per account, not per browser. The push transport and
// permission prompt are deliberately absent from this function.
export async function dispatchNotificationInbox(scanCoverage = false) {
  const db = await getAdminSupabase();
  const token = randomUUID();
  const { data: claimed, error } = await db.rpc('claim_push_worker', { p_token: token });
  check(error);
  if (!claimed) return { busy: true, processed: 0 };
  const started = Date.now();
  let processed = 0;
  try {
    // Probe first: do not mark any event processed if the additive migration is missing.
    check((await db.from('notification_inbox').select('id').limit(1)).error);
    const permissions = await loadPermissions(db);
    const profiles: PushProfile[] = [];
    for (let page = 0; page < 30; page++) {
      const { data, error: profileError } = await db.from('profiles')
        .select('id,role,coordinator_type,committee_id,status').in('role', ['Admin', 'Editor'])
        .order('id').range(page * 1000, page * 1000 + 999);
      check(profileError);
      profiles.push(...(data || []) as PushProfile[]);
      if ((data?.length || 0) < 1000) break;
      if (page === 29) throw new Error('Demasiados destinatarios para este lote.');
    }
    if (scanCoverage && profiles.length) await enqueueCoverageScan(db, new Date());
    const { data: events, error: eventsError } = await db.from('push_events').select('*')
      .is('inbox_processed_at', null).order('created_at').limit(20);
    check(eventsError);
    for (const event of (events || []) as EventRow[]) {
      if (Date.now() - started > 15000) break;
      const resolved = await resolveEvent(db, event, new Date());
      if (resolved) {
        const recipients = profiles.filter(profile => isPushRecipient(profile, permissions, event.kind, resolved.committeeId));
        let complete = true;
        for (let offset = 0; offset < recipients.length; offset += 200) {
          if (Date.now() - started > 15000) { complete = false; break; }
          const rows = recipients.slice(offset, offset + 200).map(profile => ({
            profile_id: profile.id, kind: event.kind, committee_id: resolved.committeeId,
            dedupe_key: resolved.dedupeKey, title: resolved.payload.title,
            body: resolved.payload.body,
            url: event.kind === 'request' ? `/replacements?requestId=${event.request_id}` : resolved.payload.url,
            created_at: event.created_at,
          }));
          // Do not reset read_at when another device or retry observes the same event.
          check((await db.from('notification_inbox').upsert(rows, { onConflict: 'profile_id,dedupe_key', ignoreDuplicates: true })).error);
        }
        if (!complete) break;
      }
      check((await db.from('push_events').update({ inbox_processed_at: new Date().toISOString() }).eq('id', event.id)).error);
      processed++;
    }
    check((await db.from('notification_inbox').delete().lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString())).error);
    // Keep the shared outbox bounded even when external push is disabled.
    check((await db.from('push_events').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())).error);
    return { busy: false, processed };
  } finally {
    check((await db.from('push_worker_lease').delete().eq('id', true).eq('token', token)).error);
  }
}
