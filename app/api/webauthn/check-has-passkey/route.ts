import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

    const supabase = await createClient();

    let userId: string | null = null;

    const { data: profile } = await supabase.from('profiles').select('id').in('phone', targetPhones).maybeSingle();
    if (profile) {
      userId = profile.id;
    } else {
      const { data: volunteer } = await supabase.from('volunteers').select('id').in('phone', targetPhones).maybeSingle();
      if (volunteer) {
        userId = volunteer.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ hasPasskey: false });
    }

    const { data: passkeys } = await supabase
      .from('passkeys')
      .select('id')
      .eq('user_id', userId);

    return NextResponse.json({ hasPasskey: !!(passkeys && passkeys.length > 0) });
  } catch (error: any) {
    console.error('Error checking passkey status:', error);
    return NextResponse.json({ hasPasskey: false });
  }
}
