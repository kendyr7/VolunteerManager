import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    
    const body = await request.json();
    const { userId, userType, phone } = body; // from the client

    if (!userId || !userType || !phone) {
      return NextResponse.json({ error: 'Faltan datos del usuario' }, { status: 400 });
    }

    // Validar que el token de sesión corresponda al usuario de la solicitud
    if (session.userId !== userId) {
      return NextResponse.json({ error: 'Prohibido: Token de sesión no coincide con el usuario.' }, { status: 403 });
    }

    const rpName = 'Volunteer Manager';
    // Use the host header for RP ID
    const host = request.headers.get('host') || 'localhost:3000';
    const rpID = host.split(':')[0]; // get domain without port

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(userId), // SimpleWebAuthn expects Uint8Array
      userName: phone,
      // Require user verification (biometrics)
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      attestationType: 'none',
    });

    // Save the challenge in a cookie for the verification step
    cookieStore.set('webauthn_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    });

    // Save user info for verification
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
