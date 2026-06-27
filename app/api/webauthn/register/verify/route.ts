import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const cookieStore = await cookies();
    const expectedChallenge = cookieStore.get('webauthn_challenge')?.value;
    const userInfoCookie = cookieStore.get('webauthn_user_info')?.value;

    if (!expectedChallenge || !userInfoCookie) {
      return NextResponse.json({ error: 'Falta el desafío de sesión' }, { status: 400 });
    }

    const { userId, userType } = JSON.parse(userInfoCookie);
    
    const host = request.headers.get('host') || 'localhost:3000';
    const rpID = host.split(':')[0];
    const expectedOrigin = host.includes('localhost') ? `http://${host}` : `https://${host}`;

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
      });
    } catch (error: any) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const supabase = await createClient();
      
      const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
      const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

      const webauthnUserId = Buffer.from(userId).toString('base64');
      const publicKeyBuffer = Buffer.from(credentialPublicKey);

      const { error: insertError } = await supabase
        .from('passkeys')
        .insert({
          user_id: userId,
          user_type: userType,
          webauthn_user_id: webauthnUserId,
          credential_id: credentialID,
          public_key: '\\x' + publicKeyBuffer.toString('hex'), // format bytea for Supabase
          counter,
          device_type: credentialDeviceType,
          backed_up: credentialBackedUp,
          transports: body.response.transports || [],
        });

      if (insertError) {
        console.error('Error insertando passkey:', insertError);
        return NextResponse.json({ error: 'Error al guardar la huella en la base de datos' }, { status: 500 });
      }

      // Limpiar cookies temporales
      cookieStore.delete('webauthn_challenge');
      cookieStore.delete('webauthn_user_info');

      return NextResponse.json({ verified: true });
    }

    return NextResponse.json({ verified: false }, { status: 400 });
  } catch (error: any) {
    console.error('Error verifying registration:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
