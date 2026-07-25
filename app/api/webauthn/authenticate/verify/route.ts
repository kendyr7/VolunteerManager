import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { signSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const cookieStore = await cookies();
    const expectedChallenge = cookieStore.get('webauthn_auth_challenge')?.value;
    const authUserInfo = cookieStore.get('webauthn_auth_user')?.value;

    if (!expectedChallenge || !authUserInfo) {
      return NextResponse.json({ error: 'Falta el desafío de sesión' }, { status: 400 });
    }

    const { userId, userType, phone } = JSON.parse(authUserInfo);
    
    const supabase = await getAdminSupabase();
    
    // Buscar la credencial enviada por el cliente
    const { data: passkey } = await supabase
      .from('passkeys')
      .select('*')
      .eq('credential_id', body.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!passkey) {
      return NextResponse.json({ error: 'Credencial no encontrada o no pertenece al usuario' }, { status: 400 });
    }

    // Use fixed env-var rpID — critical for cross-env compatibility
    const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
    const expectedOrigin = process.env.WEBAUTHN_RP_ORIGIN || 'http://localhost:3000';

    const credential = {
      publicKey: Buffer.from(passkey.public_key.replace('\\x', ''), 'hex'),
      id: passkey.credential_id,
      counter: Number(passkey.counter),
      transports: passkey.transports || [],
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential,
      });
    } catch (error: any) {
      console.error('WebAuthn verification error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { verified, authenticationInfo } = verification;

    if (verified) {
      // Update counter for replay protection
      await supabase
        .from('passkeys')
        .update({ 
          counter: authenticationInfo.newCounter,
          last_used_at: new Date().toISOString()
        })
        .eq('id', passkey.id);

      // Limpiar cookies temporales
      cookieStore.delete('webauthn_auth_challenge');
      cookieStore.delete('webauthn_auth_user');

      // Replicar lógica de login EXACTAMENTE igual que auth.ts — usando signSession()
      let role = 'Lector';
      let committeeName = '';
      let redirectTo = '/calendar';
      let name = '';

      if (userType === 'profile') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*, committees(name)')
          .eq('id', userId)
          .single();

        if (!profile) {
          return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
        }

        role = profile.role;
        committeeName = profile.committees?.name || '';
        name = profile.full_name;

        // Use proper signSession — identical to auth.ts
        const sessionToken = signSession({
          userId: profile.id,
          userType: 'profile',
          role,
          committee: committeeName,
        });

        cookieStore.set('session', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });

        if (role === 'Admin') redirectTo = '/dashboard';
        if (role === 'Editor') redirectTo = '/volunteers';
        if (role === 'Lector') redirectTo = '/shifts';

      } else {
        const { data: volunteer } = await supabase
          .from('volunteers')
          .select('*, committees(name)')
          .eq('id', userId)
          .single();

        if (!volunteer) {
          return NextResponse.json({ error: 'Voluntario no encontrado' }, { status: 404 });
        }

        committeeName = volunteer.committees?.name || '';
        name = `${volunteer.first_name} ${volunteer.last_name}`.trim();

        // Use proper signSession — identical to auth.ts
        const sessionToken = signSession({
          userId: volunteer.id,
          userType: 'volunteer',
          role: 'Lector',
          committee: committeeName,
        });

        cookieStore.set('session', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
      }

      return NextResponse.json({ 
        verified: true, 
        redirectTo, 
        role, 
        committee: committeeName,
        name,
        phone,
      });
    }

    return NextResponse.json({ verified: false }, { status: 400 });
  } catch (error: any) {
    console.error('Error verifying auth:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
