import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { consumeAuthRateLimit, getClientIp, logAuthRateLimitBlock } from '@/lib/auth-rate-limit';
import { AUTH_RATE_LIMITS, AUTH_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/auth-rate-limit-policy';
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
    const clientIp = getClientIp(request.headers);
    const [networkVolumeLimit, phoneLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: 'webauthn-options-volume-ip',
        identifier: clientIp,
        limit: AUTH_RATE_LIMITS.sharedNetworkVolume,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      consumeAuthRateLimit({
        scope: 'webauthn-options-phone',
        identifier: formattedPhone || rawDigits || rawPhoneInput,
        limit: AUTH_RATE_LIMITS.passkeyOptionsPerPhone,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);

    if (!networkVolumeLimit.allowed || !phoneLimit.allowed) {
      const blockedScope = !networkVolumeLimit.allowed ? 'webauthn-options-volume-ip' : 'webauthn-options-phone';
      const blockedLimit = !networkVolumeLimit.allowed ? networkVolumeLimit : phoneLimit;
      logAuthRateLimitBlock(blockedScope, blockedLimit);
      return NextResponse.json(
        { error: 'Demasiados intentos. Inténtalo más tarde.' },
        { status: 429, headers: { 'Retry-After': String(blockedLimit.retryAfterSeconds) } }
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

    const matchedUsers = [
      ...(profiles || []).map(p => ({ id: p.id, type: 'profile' as const })),
      ...(volunteers || []).map(v => ({ id: v.id, type: 'volunteer' as const })),
    ];

    const hasSelection = body.selectedUserId !== undefined || body.selectedUserType !== undefined;
    if (hasSelection && (typeof body.selectedUserId !== 'string' || !['profile', 'volunteer'].includes(body.selectedUserType))) {
      return NextResponse.json({ error: 'Selecciona un perfil válido.' }, { status: 400 });
    }
    // A shared phone must never offer another person's credentials after selection.
    const candidateUsers = hasSelection
      ? matchedUsers.filter(user => user.id === body.selectedUserId && user.type === body.selectedUserType)
      : matchedUsers;

    if (candidateUsers.length === 0) {
      const unknownPhoneLimit = await consumeAuthRateLimit({
        scope: 'webauthn-options-miss-ip',
        identifier: clientIp,
        limit: AUTH_RATE_LIMITS.unknownPhoneLookupsPerNetwork,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      });
      if (!unknownPhoneLimit.allowed) {
        logAuthRateLimitBlock('webauthn-options-miss-ip', unknownPhoneLimit);
        return NextResponse.json(
          { error: 'Demasiados intentos. Inténtalo más tarde.' },
          { status: 429, headers: { 'Retry-After': String(unknownPhoneLimit.retryAfterSeconds) } }
        );
      }
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

    // The returned credential, not query order, determines which account is
    // authenticated when a coordinator and a volunteer share a phone.
    const credentialOwners = candidateUsers
      .filter(user => passkeys.some(passkey => passkey.user_id === user.id))
      .map(user => ({ userId: user.id, userType: user.type }));

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

    cookieStore.set('webauthn_auth_user', JSON.stringify({
      ...(credentialOwners.length === 1 ? credentialOwners[0] : { candidates: credentialOwners }),
      phone: rawPhoneInput,
    }), {
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
