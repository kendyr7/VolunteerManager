import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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

  return response;
}
