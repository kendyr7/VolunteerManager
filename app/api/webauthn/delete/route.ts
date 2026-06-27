import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Falta el ID de usuario' }, { status: 400 });
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
