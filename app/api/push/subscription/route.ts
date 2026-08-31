import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getPushConfig } from '@/lib/push/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { PUSH_DEVICE_COOKIE } from '@/lib/push/device';
import { parsePushSubscription } from '@/lib/push/policy';
import { requirePushUser, requireSameOrigin, requirePushRateLimit, pushHttpError } from '@/lib/push/http';
import { requireAuthenticated } from '@/lib/authorization';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requirePushUser();
    const config = getPushConfig();
    if (!config) return Response.json({ configured: false, active: false }, { headers: { 'Cache-Control': 'no-store' } });
    const jar = await cookies();
    const deviceId = jar.get(PUSH_DEVICE_COOKIE)?.value;
    const db = await getAdminSupabase();
    // Probe schema even on first registration, so missing migrations are explained before asking permission.
    const { data, error } = await db.from('push_subscriptions')
      .select('requests_enabled,coverage_enabled,expires_at').eq('profile_id', user.userId!)
      .eq('device_id', deviceId || '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (error) throw error;
    return Response.json({ configured: true, publicKey: config.publicKey,
      active: Boolean(data && Date.parse(data.expires_at) > Date.now()),
      requests: data?.requests_enabled ?? true, coverage: data?.coverage_enabled ?? true,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return pushHttpError(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePushUser();
    if (!getPushConfig()) return Response.json({ error: 'Las notificaciones todavía no están configuradas.' }, { status: 503 });
    await requirePushRateLimit(user.userId!);
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    let input;
    try { input = parsePushSubscription(JSON.parse(raw)); }
    catch { return Response.json({ error: 'Suscripción inválida.' }, { status: 400 }); }
    const jar = await cookies();
    const deviceId = jar.get(PUSH_DEVICE_COOKIE)?.value || randomUUID();
    const db = await getAdminSupabase();
    // Preserve preferences for the same device/account, never inherit another account's consent.
    const { data: previous, error: lookupError } = await db.from('push_subscriptions').select('*').eq('device_id', deviceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (previous && previous.endpoint !== input.endpoint) {
      const { error } = await db.from('push_subscriptions').delete().eq('id', previous.id);
      if (error) throw error;
    }
    const sameAccount = previous?.profile_id === user.userId;
    const { error } = await db.from('push_subscriptions').upsert({
      device_id: deviceId, profile_id: user.userId, endpoint: input.endpoint,
      p256dh: input.keys.p256dh, auth: input.keys.auth,
      requests_enabled: sameAccount ? previous.requests_enabled : true,
      coverage_enabled: sameAccount ? previous.coverage_enabled : true,
      created_at: sameAccount ? previous.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    jar.set(PUSH_DEVICE_COOKIE, deviceId, { httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE_SECONDS });
    return Response.json({ success: true });
  } catch (error) { return pushHttpError(error); }
}

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePushUser();
    await requirePushRateLimit(user.userId!);
    const raw = await request.text();
    if (raw.length > 1024) return Response.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); }
    catch { return Response.json({ error: 'Preferencias inválidas.' }, { status: 400 }); }
    if (!body || typeof body.requests !== 'boolean' || typeof body.coverage !== 'boolean') {
      return Response.json({ error: 'Preferencias inválidas.' }, { status: 400 });
    }
    const deviceId = (await cookies()).get(PUSH_DEVICE_COOKIE)?.value;
    if (!deviceId) return Response.json({ error: 'Activa primero este dispositivo.' }, { status: 409 });
    const db = await getAdminSupabase();
    const { data, error } = await db.from('push_subscriptions').update({ requests_enabled: body.requests,
      coverage_enabled: body.coverage, updated_at: new Date().toISOString(),
    }).eq('device_id', deviceId).eq('profile_id', user.userId!).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Activa primero este dispositivo.' }, { status: 409 });
    return Response.json({ success: true });
  } catch (error) { return pushHttpError(error); }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireAuthenticated();
    const jar = await cookies();
    const deviceId = jar.get(PUSH_DEVICE_COOKIE)?.value;
    if (deviceId) {
      const db = await getAdminSupabase();
      const { error } = await db.from('push_subscriptions').delete().eq('device_id', deviceId).eq('profile_id', user.userId!);
      if (error) throw error;
      jar.delete(PUSH_DEVICE_COOKIE);
    }
    return Response.json({ success: true });
  } catch (error) { return pushHttpError(error); }
}
