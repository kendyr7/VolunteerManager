import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { verifySessionToken } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = await getAdminSupabase();

    const { data: passkeys, error } = await supabase
      .from('passkeys')
      .select('id, device_type, device_name, transports, created_at, last_used_at, backed_up')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ passkeys: passkeys || [] });
  } catch (error: any) {
    console.error('Error listing passkeys:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
