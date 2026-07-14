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

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Falta el ID de usuario' }, { status: 400 });
    }

    // Admin Check: Solo el dueño de la passkey o un Admin puede borrarla
    if (session.userId !== userId && session.role !== 'Admin') {
      return NextResponse.json({ error: 'Prohibido: Permisos insuficientes.' }, { status: 403 });
    }

    const supabase = await createClient();

    // Eliminar las llaves asociadas al usuario
    const { error } = await supabase
      .from('passkeys')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting passkey:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
