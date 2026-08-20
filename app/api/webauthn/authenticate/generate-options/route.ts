import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { consumeAuthRateLimit, getClientIp } from '@/lib/auth-rate-limit';
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
    const [ipLimit, phoneLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: 'webauthn-options-ip',
        identifier: getClientIp(request.headers),
        limit: 30,
        windowSeconds: 15 * 60,
      }),
      consumeAuthRateLimit({
        scope: 'webauthn-options-phone',
        identifier: formattedPhone || rawDigits || rawPhoneInput,
        limit: 10,
        windowSeconds: 15 * 60,
      }),
    ]);

    if (!ipLimit.allowed || !phoneLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
      return NextResponse.json(
        { error: 'Demasiados intentos. Inténtalo más tarde.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

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

    // Buscar si existe el teléfono en Profiles o Volunteers (evitando crashes por maybeSingle)
    const { data: profiles } = await supabase.from('profiles').select('id').in('phone', targetPhones);
    const { data: volunteers } = await supabase.from('volunteers').select('id').in('phone', targetPhones).neq('status', 'archived');

    const candidateUsers = [
      ...(profiles || []).map(p => ({ id: p.id, type: 'profile' as const })),
      ...(volunteers || []).map(v => ({ id: v.id, type: 'volunteer' as const })),
    ];

    if (candidateUsers.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado con ese teléfono' }, { status: 404 });
    }

    const candidateIds = candidateUsers.map(u => u.id);

    // Buscar si estos usuarios tienen passkeys
    const { data: passkeys } = await supabase
      .from('passkeys')
      .select('*')
      .in('user_id', candidateIds);

    if (!passkeys || passkeys.length === 0) {
      return NextResponse.json({ error: 'No tienes huellas o dispositivos registrados' }, { status: 400 });
    }

    const activeUserId = passkeys[0].user_id;
    const activeUserObj = candidateUsers.find(u => u.id === activeUserId) || candidateUsers[0];
    const userId = activeUserObj.id;
    const userType = activeUserObj.type;

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
      sameSite: 'lax',
      maxAge: 60 * 5,
      path: '/',
    });

    cookieStore.set('webauthn_auth_user', JSON.stringify({ userId, userType, phone: rawPhoneInput }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5,
      path: '/',
    });

    return NextResponse.json(options);

  } catch (error: any) {
    console.error('Error generating auth options:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
