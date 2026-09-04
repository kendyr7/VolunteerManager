import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import webpush from 'web-push';
import { after } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPushConfig } from './config';
import { isPushRecipient, parsePushSubscription, retryDelaySeconds, type PushKind, type PushPayload, type PushProfile } from './policy';
import { CONFIGURABLE_PERMISSION_DEFAULTS, CONFIGURABLE_PERMISSION_KEYS, type ConfigurablePermissionKey } from '@/lib/role-permissions';
import { getOperationalEventDays, formatDateShort, parseDayKeyToDateStr, getOfficialShiftTime, getAvailableShiftKeys } from '@/lib/dates';
import type { SupabaseClient } from '@supabase/supabase-js';

export type EventRow = {
  id: string; kind: PushKind; request_id: string | null; committee_id: string | null;
  day_key: string | null; shift_key: string | null; created_at: string;
};
type Subscription = {
  id: string; profile_id: string; endpoint: string; p256dh: string; auth: string;
  requests_enabled: boolean; coverage_enabled: boolean; expires_at: string; created_at: string;
};
type ResolvedEvent = { committeeId: string | null; payload: PushPayload; dedupeKey: string; expiresAt: string };
const MAX_EVENT_AGE = 24 * 60 * 60 * 1000;

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// Keep operational context readable within the push notification's size limits.
// Phone numbers and personal reasons must never be selected for these messages.
function notificationLabel(value: string | null | undefined, fallback: string, limit = 70) {
  const text = value?.replace(/\s+/g, ' ').trim() || fallback;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function notificationSlot(dayKey: string | null | undefined, shiftKey: string | null | undefined) {
  const day = dayKey && getOperationalEventDays().find(date => parseDayKeyToDateStr(date) === parseDayKeyToDateStr(dayKey));
  const dateLabel = day
    ? new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Guatemala', weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(`${parseDayKeyToDateStr(day)}T12:00:00-06:00`))
    : notificationLabel(dayKey, 'Fecha por confirmar', 30);
  return `${dateLabel} · ${notificationLabel(shiftKey, 'Turno por confirmar', 20)}`;
}

export function schedulePushDispatch() {
  after(async () => {
    try {
      const { dispatchNotificationInbox } = await import('../notifications/worker');
      await dispatchNotificationInbox();
    } catch { console.error('[INBOX] No se pudo actualizar la bandeja; se reintentará al consultar.'); }
    try { await dispatchPushQueue(); }
    catch { console.error('[PUSH] No se pudo procesar la cola; se reintentará en la siguiente ejecución.'); }
  });
}

export async function sendWebPush(subscription: Subscription, payload: PushPayload, kind: PushKind = 'request', ttl = 3600) {
  const config = getPushConfig();
  if (!config) throw new Error('Las notificaciones todavía no están configuradas.');
  const target = parsePushSubscription({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
  await webpush.sendNotification(target, JSON.stringify({ ...payload, recipientId: subscription.profile_id }), {
    vapidDetails: config, timeout: 4000, TTL: Math.max(0, Math.min(3600, Math.floor(ttl))),
    urgency: kind === 'coverage' ? 'high' : 'normal',
    topic: createHash('sha256').update(payload.tag).digest('base64url').slice(0, 32),
  });
}

export async function resolveEvent(db: SupabaseClient, event: EventRow, now: Date): Promise<ResolvedEvent | null> {
  if (now.getTime() - Date.parse(event.created_at) > MAX_EVENT_AGE) return null;
  if (event.kind === 'request') {
    const { data: request, error } = await db.from('shift_change_requests')
      .select('status, volunteer_id, current_day_key, current_shift_key, requested_day_key, requested_shift_key').eq('id', event.request_id).maybeSingle();
    check(error);
    if (!request || request.status !== 'pending') return null;
    const { data: volunteer, error: volunteerError } = await db.from('volunteers')
      .select('committee_id, status, first_name, last_name').eq('id', request.volunteer_id).maybeSingle();
    check(volunteerError);
    if (!volunteer || volunteer.status === 'archived') return null;
    const { data: committee, error: committeeError } = volunteer.committee_id
      ? await db.from('committees').select('name').eq('id', volunteer.committee_id).maybeSingle()
      : { data: null, error: null };
    check(committeeError);
    const name = notificationLabel([volunteer.first_name, volunteer.last_name].filter(Boolean).join(' '), 'Voluntario sin nombre');
    const committeeName = notificationLabel(committee?.name, 'Sin subcomité asignado');
    return {
      committeeId: volunteer.committee_id, dedupeKey: `request:${event.request_id}`,
      expiresAt: new Date(Date.parse(event.created_at) + MAX_EVENT_AGE).toISOString(),
      payload: { title: `Solicitud de cambio · ${name}`,
        body: `${committeeName}. Actual: ${notificationSlot(request.current_day_key, request.current_shift_key)}. Solicitado: ${notificationSlot(request.requested_day_key, request.requested_shift_key)}.`,
        url: `/replacements?requestId=${event.request_id}`, tag: `request:${event.request_id}` },
    };
  }
  if (!event.committee_id || !event.day_key || !event.shift_key) return null;
  const day = getOperationalEventDays().find(date => parseDayKeyToDateStr(date) === parseDayKeyToDateStr(event.day_key));
  if (!day || !getAvailableShiftKeys(day).includes(event.shift_key as 'T1')) return null;
  const hour = getOfficialShiftTime(day, event.shift_key).startHour;
  const startsAt = new Date(`${parseDayKeyToDateStr(day)}T${String(Math.floor(hour)).padStart(2, '0')}:00:00-06:00`);
  const remaining = startsAt.getTime() - now.getTime();
  if (remaining <= 0 || remaining > 48 * 60 * 60 * 1000) return null;
  const [{ data: requirement, error: reqError }, { count, error: countError }, { data: committee, error: committeeError }] = await Promise.all([
    db.from('committee_shift_requirements').select('required').eq('committee_id', event.committee_id).eq('shift_key', event.shift_key).maybeSingle(),
    db.from('shifts').select('id, volunteers!inner(committee_id,status)', { count: 'exact', head: true })
      .eq('volunteers.committee_id', event.committee_id).neq('volunteers.status', 'archived')
      .eq('day_key', event.day_key).eq('shift_key', event.shift_key),
    db.from('committees').select('status,name').eq('id', event.committee_id).maybeSingle(),
  ]);
  check(reqError); check(countError); check(committeeError);
  if (!committee || committee.status === 'archived' || !requirement?.required || (count ?? 0) >= requirement.required) return null;
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(now);
  const key = `coverage:${event.committee_id}:${event.day_key}:${event.shift_key}:${dateKey}`;
  return {
    committeeId: event.committee_id, dedupeKey: key,
    expiresAt: new Date(Math.min(startsAt.getTime(), Date.parse(`${dateKey}T00:00:00-06:00`) + MAX_EVENT_AGE)).toISOString(),
    payload: { title: `Cobertura crítica · ${notificationLabel(committee.name, 'Subcomité sin nombre')}`,
      body: `${notificationSlot(event.day_key, event.shift_key)}: ${count ?? 0} de ${requirement.required} puestos cubiertos. ${requirement.required - (count ?? 0) === 1 ? 'Falta 1 persona' : `Faltan ${requirement.required - (count ?? 0)} personas`}.`,
      url: '/dashboard', tag: key },
  };
}

export async function loadPermissions(db: SupabaseClient) {
  const { data, error } = await db.from('system_settings').select('key,value').in('key', CONFIGURABLE_PERMISSION_KEYS);
  check(error); // Fail closed rather than use stale or incomplete authorization.
  const permissions = { ...CONFIGURABLE_PERMISSION_DEFAULTS };
  for (const row of data || []) permissions[row.key as ConfigurablePermissionKey] = row.value === 'true';
  return permissions;
}

async function activeSubscriptions(db: SupabaseClient) {
  const rows: Subscription[] = [];
  for (let page = 0; page < 30; page++) {
    const { data, error } = await db.from('push_subscriptions').select('*')
      .gt('expires_at', new Date().toISOString()).order('id').range(page * 1000, page * 1000 + 999);
    check(error);
    rows.push(...(data || []) as Subscription[]);
    if ((data?.length || 0) < 1000) return rows;
  }
  throw new Error('Demasiadas suscripciones para este lote.');
}

export async function enqueueCoverageScan(db: SupabaseClient, now: Date) {
  const { data: committees, error } = await db.from('committees').select('id').neq('status', 'archived');
  check(error);
  const rows = getOperationalEventDays().flatMap(day => {
    const dayKey = formatDateShort(day);
    return getAvailableShiftKeys(day).flatMap(shiftKey => {
      const hour = getOfficialShiftTime(day, shiftKey).startHour;
      const start = Date.parse(`${parseDayKeyToDateStr(day)}T${String(hour).padStart(2, '0')}:00:00-06:00`);
      if (start <= now.getTime() || start - now.getTime() > 48 * 3600000) return [];
      return (committees || []).map(committee => ({ kind: 'coverage', committee_id: committee.id,
        day_key: dayKey, shift_key: shiftKey,
        event_key: `scan:${now.toISOString().slice(0, 13)}:${committee.id}:${dayKey}:${shiftKey}` }));
    });
  });
  if (rows.length) check((await db.from('push_events').upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true })).error);
}

export async function dispatchPushQueue(scanCoverage = false) {
  if (!getPushConfig()) return { enabled: false, sent: 0 };
  const db = await getAdminSupabase();
  const token = randomUUID();
  const { data: claimed, error: lockError } = await db.rpc('claim_push_worker', { p_token: token });
  check(lockError);
  if (!claimed) return { busy: true, sent: 0 };
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  try {
    const permissions = await loadPermissions(db);
    const subscriptions = await activeSubscriptions(db);
    const profiles = new Map<string, PushProfile>();
    const profileIds = [...new Set(subscriptions.map(sub => sub.profile_id))];
    for (let offset = 0; offset < profileIds.length; offset += 200) {
      const { data, error } = await db.from('profiles').select('id,role,coordinator_type,committee_id,status')
        .in('id', profileIds.slice(offset, offset + 200));
      check(error);
      for (const profile of data || []) profiles.set(profile.id, profile as PushProfile);
    }
    if (scanCoverage && subscriptions.length) await enqueueCoverageScan(db, new Date());
    // Bounded expansion; a database webhook or scheduled dispatch continues the queue.
    const { data: events, error } = await db.from('push_events').select('*')
      .is('processed_at', null).order('created_at').limit(20);
    check(error);
    for (const event of (events || []) as EventRow[]) {
      if (Date.now() - started > 20000) break;
      const resolved = await resolveEvent(db, event, new Date());
      if (resolved) {
        const candidates = subscriptions.filter(sub => {
          const profile = profiles.get(sub.profile_id);
          return profile && Date.parse(sub.created_at) <= Date.parse(event.created_at) &&
            (event.kind === 'request' ? sub.requests_enabled : sub.coverage_enabled) &&
            isPushRecipient(profile, permissions, event.kind, resolved.committeeId);
        });
        let expanded = true;
        for (let offset = 0; offset < candidates.length; offset += 200) {
          if (Date.now() - started > 20000) { expanded = false; break; }
          const rows = candidates.slice(offset, offset + 200).map(sub => ({ event_id: event.id, subscription_id: sub.id,
            dedupe_key: resolved.dedupeKey, payload: resolved.payload, expires_at: resolved.expiresAt,
          }));
          check((await db.from('push_deliveries').upsert(rows, { onConflict: 'subscription_id,dedupe_key', ignoreDuplicates: true })).error);
        }
        if (!expanded) break;
      }
      check((await db.from('push_events').update({ processed_at: new Date().toISOString() }).eq('id', event.id)).error);
    }
    const { data: jobs, error: jobsError } = await db.from('push_deliveries').select('*')
      .in('status', ['pending', 'sending']).lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at').limit(30);
    check(jobsError);
    for (let offset = 0; offset < (jobs?.length || 0) && Date.now() - started < 45000; offset += 5) {
      const results = await Promise.allSettled((jobs || []).slice(offset, offset + 5).map(async job => {
        const now = new Date();
        const [{ data: sub, error: subError }, { data: event, error: eventError }] = await Promise.all([
          db.from('push_subscriptions').select('*').eq('id', job.subscription_id).maybeSingle(),
          db.from('push_events').select('*').eq('id', job.event_id).maybeSingle(),
        ]);
        check(subError); check(eventError);
        const resolved = event ? await resolveEvent(db, event as EventRow, now) : null;
        const { data: profile, error: profileError } = sub
          ? await db.from('profiles').select('id,role,coordinator_type,committee_id,status').eq('id', sub.profile_id).maybeSingle()
          : { data: null, error: null };
        check(profileError);
        if (!sub || !profile || !resolved || Date.parse(sub.expires_at) <= now.getTime() ||
          Date.parse(job.expires_at) <= now.getTime() || Date.parse(sub.created_at) > Date.parse(event.created_at) ||
          !(event.kind === 'request' ? sub.requests_enabled : sub.coverage_enabled) ||
          !isPushRecipient(profile as PushProfile, permissions, event.kind, resolved.committeeId)) {
          check((await db.from('push_deliveries').update({ status: 'skipped', updated_at: now.toISOString() }).eq('id', job.id)).error);
          return;
        }
        const attempts = job.attempts + 1;
        if (attempts > 5) {
          check((await db.from('push_deliveries').update({ status: 'failed', error_code: 'RETRY_LIMIT', updated_at: now.toISOString() }).eq('id', job.id)).error);
          return;
        }
        check((await db.from('push_deliveries').update({ status: 'sending', attempts,
          next_attempt_at: new Date(now.getTime() + 180000).toISOString(), updated_at: now.toISOString(),
        }).eq('id', job.id)).error);
        let status = 'sent';
        let code: string | null = null;
        let nextAttempt = now;
        try {
          // Recomputed payload avoids stale coverage counts after a retry.
          const ttl = (Math.min(Date.parse(job.expires_at), Date.parse(resolved.expiresAt)) - Date.now()) / 1000;
          await sendWebPush(sub as Subscription, { ...resolved.payload, tag: job.dedupe_key }, event.kind, ttl);
          sent++;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
          code = statusCode ? String(statusCode) : 'NETWORK_OR_CONFIG';
          if (statusCode === 404 || statusCode === 410) {
            check((await db.from('push_subscriptions').delete().eq('id', sub.id)).error);
            return;
          }
          status = attempts < 5 && (statusCode === 0 || statusCode === 429 || statusCode >= 500) ? 'pending' : 'failed';
          nextAttempt = new Date(now.getTime() + retryDelaySeconds(attempts) * 1000);
          failed++;
        }
        check((await db.from('push_deliveries').update({ status, error_code: code,
          next_attempt_at: nextAttempt.toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job.id)).error);
      }));
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    }
    // Seven-day operational retention; never log endpoints, keys, or payloads.
    check((await db.from('push_events').delete().lt('created_at', new Date(Date.now() - 7 * MAX_EVENT_AGE).toISOString())).error);
    check((await db.from('push_subscriptions').delete().lt('expires_at', new Date().toISOString())).error);
    return { enabled: true, sent, failed };
  } finally {
    check((await db.from('push_worker_lease').delete().eq('id', true).eq('token', token)).error);
  }
}
