import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
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

    let userId: string | null = null;

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
