import { notificationAccess, notificationError } from '@/lib/notifications/access';
import { requireSameOrigin } from '@/lib/push/http';
import { notificationDayStart } from '@/lib/notifications/presentation';
import { notificationFilter, parseNotificationCursor, safeNotificationLink, UUID_PATTERN, NOTIFICATION_PAGE_SIZE, NOTIFICATION_RETENTION_DAYS, type NotificationItem } from '@/lib/notifications/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { db, profileId, scopes } = await notificationAccess();
    const params = new URL(request.url).searchParams;
    let cursor;
    try { cursor = parseNotificationCursor(params.get('cursor')); }
    catch { return Response.json({ error: 'Página inválida. Vuelve a abrir las notificaciones.' }, { status: 400 }); }
    const asOf = new Date().toISOString();
    if (!scopes.length) return Response.json({ items: [], unreadCount: 0, todayCount: 0, nextCursor: null, asOf }, { headers: { 'Cache-Control': 'no-store' } });
    const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86400000).toISOString();
    let itemsQuery = db.from('notification_inbox').select('id,kind,title,body,url,created_at,read_at')
      .eq('profile_id', profileId).gte('created_at', cutoff).lte('created_at', asOf).lte('inserted_at', asOf)
      .or(notificationFilter(scopes, cursor)).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(NOTIFICATION_PAGE_SIZE + 1);
    if (params.get('filter') === 'unread') itemsQuery = itemsQuery.is('read_at', null);
    if (params.get('filter') === 'read') itemsQuery = itemsQuery.not('read_at', 'is', null);
    const [{ data, error }, { count, error: countError }, { count: todayCount, error: todayError }] = await Promise.all([
      itemsQuery,
      db.from('notification_inbox').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)
        .gte('created_at', cutoff).lte('created_at', asOf).lte('inserted_at', asOf).or(notificationFilter(scopes)).is('read_at', null),
      db.from('notification_inbox').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)
        .gte('created_at', notificationDayStart(asOf)).lte('created_at', asOf).lte('inserted_at', asOf).or(notificationFilter(scopes)),
    ]);
    if (error) throw error;
    if (countError) throw countError;
    if (todayError) throw todayError;
    const items = ((data || []) as NotificationItem[]).slice(0, NOTIFICATION_PAGE_SIZE).map(item => ({ ...item, url: safeNotificationLink(item.url) }));
    const last = items.at(-1);
    const nextCursor = (data?.length || 0) > NOTIFICATION_PAGE_SIZE && last
      ? Buffer.from(JSON.stringify({ date: last.created_at, id: last.id })).toString('base64url') : null;
    return Response.json({ items, unreadCount: count || 0, todayCount: todayCount || 0, nextCursor, asOf }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return notificationError(error); }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const { db, profileId, scopes } = await notificationAccess();
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return Response.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
      body = JSON.parse(raw);
    } catch { return Response.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
    const all = body?.all === true;
    const validBefore = typeof body?.before === 'string' && Number.isFinite(Date.parse(body.before)) && Date.parse(body.before) <= Date.now();
    const validIds = Array.isArray(body?.ids) && body.ids.length > 0 && body.ids.length <= NOTIFICATION_PAGE_SIZE && body.ids.every((id: unknown) => typeof id === 'string' && UUID_PATTERN.test(id));
    if ((all && !validBefore) || (!all && !validIds)) return Response.json({ error: 'Selecciona notificaciones válidas.' }, { status: 400 });
    if (scopes.length) {
      let query = db.from('notification_inbox').update({ read_at: new Date().toISOString() })
        .eq('profile_id', profileId).or(notificationFilter(scopes)).is('read_at', null)
        .gte('created_at', new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86400000).toISOString());
      query = all ? query.lte('inserted_at', new Date(body.before).toISOString()) : query.in('id', body.ids);
      const { error } = await query;
      if (error) throw error;
    }
    return Response.json({ success: true });
  } catch (error) { return notificationError(error); }
}
