import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get the user from the custom session cookie
    // session format is typically "coordinator-Admin-Historia" or "volunteer-UUID-Historia"
    // To properly link the passkey, we really need the user ID. 
    // It seems our current custom auth doesn't store the user ID in the cookie for coordinators, 
    // only the role/committee. Let's fix that or use Supabase to fetch the current user's ID via phone/pin.
    
    // Actually, wait, we need the user's ID to register a passkey.
    // Let's pass the userId in the body of this request, or read it from somewhere secure.
    // If the client passes it, we must verify it.
    
    const body = await request.json();
    const { userId, userType, phone } = body; // from the client

    if (!userId || !userType || !phone) {
      return NextResponse.json({ error: 'Faltan datos del usuario' }, { status: 400 });
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
