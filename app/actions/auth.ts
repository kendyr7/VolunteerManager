'use server'

import { cookies } from 'next/headers'

export type AuthState = {
  error?: string;
  success?: boolean;
}

export async function loginWithPin(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const phone = formData.get('phone') as string;
  const pin = formData.get('pin') as string;

  if (!phone || !pin) {
    return { error: 'Por favor, ingresa tu teléfono y PIN.' };
  }

  if (pin.length !== 4) {
    return { error: 'El PIN debe tener 4 dígitos.' };
  }

  // TODO: Conectar con Supabase para validar contra la tabla `volunteers`
  // Para propósitos de demostración inicial, usaremos un PIN hardcodeado
  if (pin === '1234') {
    // Simulamos la creación de una sesión guardando una cookie segura
    const cookieStore = await cookies();
    cookieStore.set('session', 'mock-session-token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });
    return { success: true };
  }

  return { error: 'El PIN es incorrecto.' };
}
