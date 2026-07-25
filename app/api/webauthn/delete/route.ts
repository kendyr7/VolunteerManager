import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySessionToken } from '@/lib/auth';

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || '';
    const session = verifySessionToken(sessionCookie);
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { passkeyId } = body;

    if (!passkeyId) {
      return NextResponse.json({ error: 'Falta el ID de la passkey' }, { status: 400 });
    }

    const supabase = await createClient();

    // First verify the passkey belongs to the authenticated user (or they're admin)
    const { data: passkey } = await supabase
      .from('passkeys')
      .select('id, user_id')
      .eq('id', passkeyId)
      .maybeSingle();

    if (!passkey) {
      return NextResponse.json({ error: 'Passkey no encontrada' }, { status: 404 });
    }

    // Security: only the owner or an Admin can delete
    if (passkey.user_id !== session.userId && session.role !== 'Admin') {
      return NextResponse.json({ error: 'Prohibido: Permisos insuficientes.' }, { status: 403 });
    }

    // Delete only the specific passkey
    const { error } = await supabase
      .from('passkeys')
      .delete()
      .eq('id', passkeyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting passkey:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
