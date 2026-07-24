import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado. Inicia sesión primero.' }, { status: 401 });
    }
    
    const body = await request.json().catch(() => ({}));
    const userId = session.userId;
    const userType = session.userType || body.userType || 'profile';
    const phone = body.phone || session.userId;

    const rpName = 'Volunteer Manager';
    const host = request.headers.get('host') || 'localhost:3000';
    const rpID = host.split(':')[0];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: phone,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestationType: 'none',
    });

    cookieStore.set('webauthn_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5,
      path: '/',
    });

    cookieStore.set('webauthn_user_info', JSON.stringify({ userId, userType }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5,
      path: '/',
    });

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('Error generating registration options:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
