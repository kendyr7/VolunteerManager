import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');

  if (!session) {
    return NextResponse.json({ token: null }, { status: 401 });
  }

  // En Supabase, para RLS, pasaremos directamente el token JWT al cliente
  // para que lo use en supabase.auth.setSession o como Authorization header
  return NextResponse.json({ token: session.value });
}
