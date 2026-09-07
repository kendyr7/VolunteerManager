import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { consumeAuthRateLimit, getClientIp, logAuthRateLimitBlock } from '@/lib/auth-rate-limit';
import { AUTH_RATE_LIMITS, AUTH_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/auth-rate-limit-policy';
import { formatE164 } from '@/lib/whatsapp';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPhoneInput = searchParams.get('phone') || '';

    if (!rawPhoneInput) {
      return NextResponse.json({ hasPasskey: false });
    }

    const formattedPhone = formatE164(rawPhoneInput);
    const rawDigits = rawPhoneInput.replace(/\D/g, '');
    const clientIp = getClientIp(request.headers);
    const [networkVolumeLimit, phoneLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: 'webauthn-check-volume-ip',
        identifier: clientIp,
        limit: AUTH_RATE_LIMITS.sharedNetworkVolume,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      consumeAuthRateLimit({
        scope: 'webauthn-check-phone',
        identifier: formattedPhone || rawDigits || rawPhoneInput,
        limit: AUTH_RATE_LIMITS.passkeyChecksPerPhone,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);

    if (!networkVolumeLimit.allowed || !phoneLimit.allowed) {
      const blockedScope = !networkVolumeLimit.allowed ? 'webauthn-check-volume-ip' : 'webauthn-check-phone';
      const blockedLimit = !networkVolumeLimit.allowed ? networkVolumeLimit : phoneLimit;
      logAuthRateLimitBlock(blockedScope, blockedLimit);
      return NextResponse.json(
        { hasPasskey: false, error: 'Demasiadas consultas. Inténtalo más tarde.' },
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

    const { data: profiles } = await supabase.from('profiles').select('id').in('phone', targetPhones);
    const { data: volunteers } = await supabase.from('volunteers').select('id').in('phone', targetPhones).neq('status', 'archived');

    const userIds = [
      ...(profiles || []).map(p => p.id),
      ...(volunteers || []).map(v => v.id),
    ];

    if (userIds.length === 0) {
      const unknownPhoneLimit = await consumeAuthRateLimit({
        scope: 'webauthn-check-miss-ip',
        identifier: clientIp,
        limit: AUTH_RATE_LIMITS.unknownPhoneLookupsPerNetwork,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      });
      if (!unknownPhoneLimit.allowed) {
        logAuthRateLimitBlock('webauthn-check-miss-ip', unknownPhoneLimit);
        return NextResponse.json(
          { hasPasskey: false, error: 'Demasiadas consultas. Inténtalo más tarde.' },
          { status: 429, headers: { 'Retry-After': String(unknownPhoneLimit.retryAfterSeconds) } }
        );
      }
      return NextResponse.json({ hasPasskey: false });
    }

    const { data: passkeys } = await supabase
      .from('passkeys')
      .select('id')
      .in('user_id', userIds);

    return NextResponse.json({ hasPasskey: !!(passkeys && passkeys.length > 0) });
  } catch (error: any) {
    console.error('Error checking passkey status:', error);
    return NextResponse.json({ hasPasskey: false });
  }
}
