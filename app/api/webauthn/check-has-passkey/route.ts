import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPhone = searchParams.get('phone') || '';
    const phone = rawPhone.replace(/\s+/g, '');

    if (!phone) {
      return NextResponse.json({ hasPasskey: false });
    }

    const supabase = await createClient();

    let userId: string | null = null;

    const { data: profile } = await supabase.from('profiles').select('id').eq('phone', phone).maybeSingle();
    if (profile) {
      userId = profile.id;
    } else {
      const { data: volunteer } = await supabase.from('volunteers').select('id').eq('phone', phone).maybeSingle();
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
