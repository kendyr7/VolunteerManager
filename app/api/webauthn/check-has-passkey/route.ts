import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { consumeAuthRateLimit, getClientIp } from '@/lib/auth-rate-limit';
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
    const [ipLimit, phoneLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: 'webauthn-check-ip',
        identifier: getClientIp(request.headers),
        limit: 60,
        windowSeconds: 60,
      }),
      consumeAuthRateLimit({
        scope: 'webauthn-check-phone',
        identifier: formattedPhone || rawDigits || rawPhoneInput,
        limit: 20,
        windowSeconds: 15 * 60,
      }),
    ]);

    if (!ipLimit.allowed || !phoneLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
      return NextResponse.json(
        { hasPasskey: false, error: 'Demasiadas consultas. Inténtalo más tarde.' },
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

    const { data: profiles } = await supabase.from('profiles').select('id').in('phone', targetPhones);
    const { data: volunteers } = await supabase.from('volunteers').select('id').in('phone', targetPhones).neq('status', 'archived');

    const userIds = [
      ...(profiles || []).map(p => p.id),
      ...(volunteers || []).map(v => v.id),
    ];

    if (userIds.length === 0) {
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
