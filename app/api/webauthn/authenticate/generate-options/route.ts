import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { formatE164 } from '@/lib/whatsapp';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawPhoneInput = body.phone?.trim() || '';

    if (!rawPhoneInput) {
      return NextResponse.json({ error: 'Número de teléfono es requerido' }, { status: 400 });
    }

    const formattedPhone = formatE164(rawPhoneInput);
    const rawDigits = rawPhoneInput.replace(/\D/g, '');
    const targetPhones = Array.from(new Set([
      rawPhoneInput,
      formattedPhone,
      rawPhoneInput.replace(/\s+/g, ''),
      formattedPhone.replace('+', ''),
      rawDigits,
      rawDigits.length === 8 ? `505${rawDigits}` : rawDigits,
      rawDigits.length === 8 ? `+505${rawDigits}` : rawDigits,
      rawDigits.startsWith('505') && rawDigits.length > 8 ? rawDigits.slice(3) : rawDigits
    ])).filter(Boolean);

    const supabase = await getAdminSupabase();

    // Buscar si existe el teléfono en Profiles o Volunteers
    let userId = null;
    let userType = null;

    const { data: profile } = await supabase.from('profiles').select('id').in('phone', targetPhones).maybeSingle();
    if (profile) {
      userId = profile.id;
      userType = 'profile';
    } else {
      const { data: volunteer } = await supabase.from('volunteers').select('id').in('phone', targetPhones).maybeSingle();
      if (volunteer) {
        userId = volunteer.id;
        userType = 'volunteer';
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Usuario no encontrado con ese teléfono' }, { status: 404 });
    }

    // Buscar si este usuario tiene passkeys
    const { data: passkeys } = await supabase
      .from('passkeys')
      .select('*')
      .eq('user_id', userId);

    if (!passkeys || passkeys.length === 0) {
      return NextResponse.json({ error: 'No tienes huellas o dispositivos registrados' }, { status: 400 });
    }

    const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';

    const allowCredentials = passkeys.map((pk) => ({
      id: pk.credential_id, // Base64URL string provided by SimpleWebAuthn
      type: 'public-key' as const,
      transports: pk.transports || [],
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const cookieStore = await cookies();
    cookieStore.set('webauthn_auth_challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5,
      path: '/',
    });

    cookieStore.set('webauthn_auth_user', JSON.stringify({ userId, userType, phone: rawPhoneInput }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 5,
      path: '/',
    });

    return NextResponse.json(options);

  } catch (error: any) {
    console.error('Error generating auth options:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
