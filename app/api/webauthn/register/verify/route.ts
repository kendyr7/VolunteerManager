import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);
    const expectedChallenge = cookieStore.get('webauthn_challenge')?.value;
    const userInfoCookie = cookieStore.get('webauthn_user_info')?.value;

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!expectedChallenge || !userInfoCookie) {
      return NextResponse.json({ error: 'Falta el desafío de sesión' }, { status: 400 });
    }

    const { userId, userType } = JSON.parse(userInfoCookie);
    if (userId !== session.userId || userType !== session.userType) {
      return NextResponse.json({ error: 'El desafío no pertenece a la sesión activa' }, { status: 403 });
    }
    
    // Use fixed env-var rpID — critical for cross-env compatibility
    const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
    const expectedOrigin = process.env.WEBAUTHN_RP_ORIGIN || 'http://localhost:3000';

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
      });
    } catch (error: any) {
      console.error('Registration verification error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const supabase = await getAdminSupabase();
      
      const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
      const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

      const webauthnUserId = Buffer.from(userId).toString('base64');
      const publicKeyBuffer = Buffer.from(credentialPublicKey);

      // Derive a human-readable device name from transports
      const transports: string[] = body.response?.transports || [];
      let deviceName = 'Dispositivo desconocido';
      if (transports.includes('internal')) {
        // internal = built-in biometric (fingerprint, Face ID, Windows Hello, Touch ID)
        const ua = body.userAgent || '';
        if (/iPhone|iPad/.test(ua)) deviceName = 'Face ID / Touch ID (iPhone)';
        else if (/Mac/.test(ua)) deviceName = 'Touch ID (Mac)';
        else if (/Android/.test(ua)) deviceName = 'Huella dactilar (Android)';
        else deviceName = 'Biometría del dispositivo';
      } else if (transports.includes('usb')) {
        deviceName = 'Llave de seguridad USB';
      } else if (transports.includes('nfc')) {
        deviceName = 'Llave NFC';
      } else if (transports.includes('ble')) {
        deviceName = 'Dispositivo Bluetooth';
      } else if (transports.includes('hybrid')) {
        deviceName = 'Passkey sincronizada';
      }

      const { error: insertError } = await supabase
        .from('passkeys')
        .insert({
          user_id: userId,
          user_type: userType,
          webauthn_user_id: webauthnUserId,
          credential_id: credentialID,
          public_key: '\\x' + publicKeyBuffer.toString('hex'),
          counter,
          device_type: credentialDeviceType,
          device_name: deviceName,
          backed_up: credentialBackedUp,
          transports,
        });

      if (insertError) {
        console.error('Error insertando passkey:', insertError);
        return NextResponse.json({ error: 'Error al guardar la huella en la base de datos' }, { status: 500 });
      }

      // Limpiar cookies temporales
      cookieStore.delete('webauthn_challenge');
      cookieStore.delete('webauthn_user_info');

      return NextResponse.json({ verified: true, deviceName });
    }

    return NextResponse.json({ verified: false }, { status: 400 });
  } catch (error: any) {
    console.error('Error verifying registration:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
