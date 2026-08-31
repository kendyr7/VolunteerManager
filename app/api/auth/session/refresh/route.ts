import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PUSH_DEVICE_COOKIE } from '@/lib/push/device';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySessionToken,
} from '@/lib/auth';

export async function POST() {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get('session')?.value || '';
  const session = verifySessionToken(currentToken);

  if (!session) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  }

  const refreshedToken = signSession({
    userId: session.userId,
    userType: session.userType,
    role: session.role,
    committee: session.committee,
  });

  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set('session', refreshedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  const deviceId = cookieStore.get(PUSH_DEVICE_COOKIE)?.value;
  if (deviceId && session.userType === 'profile') {
    const db = await getAdminSupabase();
    const { data, error } = await db.from('push_subscriptions').update({
      expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('device_id', deviceId).eq('profile_id', session.userId).select('id').maybeSingle();
    if (!error && data) response.cookies.set(PUSH_DEVICE_COOKIE, deviceId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/', maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return response;
}
