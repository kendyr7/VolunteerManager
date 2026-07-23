'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { signSession } from '@/lib/auth'
import { formatE164 } from '@/lib/whatsapp'

export type AuthState = {
  error?: string;
  success?: boolean;
  redirectTo?: string;
  role?: string;
  committee?: string;
  name?: string;
  force_pin_change?: boolean;
  user_id?: string;
  user_type?: 'profile' | 'volunteer';
}

export async function loginWithPin(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const rawPhoneInput = (formData.get('phone') as string || '').trim();
  const pin = formData.get('pin') as string;

  const formattedPhone = formatE164(rawPhoneInput);
  const rawDigits = rawPhoneInput.replace(/\D/g, '');
  const targetPhones = Array.from(new Set([
    formattedPhone,
    rawPhoneInput.replace(/\s+/g, ''),
    formattedPhone.replace('+', ''),
    rawDigits,
    rawDigits.length === 8 ? `505${rawDigits}` : rawDigits
  ])).filter(Boolean);

  console.log("AUTH_LOG: Received login request", { rawPhoneInput, formattedPhone, pin_length: pin?.length });

  if (!rawPhoneInput || !pin) {
    return { error: 'Por favor, ingresa tu teléfono y PIN.' };
  }

  // Para el login necesitamos bypassear RLS porque el usuario aún no tiene token.
  // Usamos el SERVICE_ROLE_KEY (si está disponible) o el cliente normal (si la política lo permite).
  let supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } else {
    supabase = await createClient();
  }

  // 0. Verificar Rate Limiting (Fuerza Bruta)
  const { data: attempt } = await supabase
    .from('login_attempts')
    .select('*')
    .in('phone', targetPhones)
    .maybeSingle();

  if (attempt) {
    const now = new Date();
    if (attempt.locked_until && new Date(attempt.locked_until) > now) {
      const remainingMin = Math.ceil((new Date(attempt.locked_until).getTime() - now.getTime()) / 60000);
      return { error: `Teléfono bloqueado por exceso de intentos. Inténtalo de nuevo en ${remainingMin} minutos.` };
    }
  }

  // 1. Intentar buscar en Profiles (Coordinadores)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, committees(name)')
    .in('phone', targetPhones)
    .eq('pin', pin)
    .maybeSingle();

  if (profile) {
    // Resetear Rate Limiting tras login exitoso
    await supabase.from('login_attempts').delete().in('phone', targetPhones);

    // Check if it's first login (assigned PIN 1234)
    if (pin === '1234') {
      return { 
        success: true, 
        force_pin_change: true, 
        user_id: profile.id, 
        user_type: 'profile' 
      };
    }

    const role = profile.role;
    const committeeName = profile.committees?.name || '';
    
    // Generar Token de Sesión Criptográfico
    const sessionToken = signSession({
      userId: profile.id,
      userType: 'profile',
      role,
      committee: committeeName
    });

    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    let redirectTo = '/dashboard';
    if (role === 'Editor') redirectTo = '/volunteers';
    if (role === 'Lector') redirectTo = '/shifts';

    return { 
      success: true, 
      redirectTo,
      role,
      committee: committeeName,
      name: profile.full_name
    };
  }

  // 2. Si no es coordinador, buscar en Volunteers (Voluntarios normales)
  const { data: volunteer } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .in('phone', targetPhones)
    .eq('pin', pin)
    .maybeSingle();

  if (volunteer) {
    // Resetear Rate Limiting tras login exitoso
    await supabase.from('login_attempts').delete().in('phone', targetPhones);

    // Check if it's first login (assigned PIN 1234)
    if (pin === '1234') {
       return { 
         success: true, 
         force_pin_change: true, 
         user_id: volunteer.id, 
         user_type: 'volunteer' 
       };
    }

    const committeeName = volunteer.committees?.name || '';

    // Generar Token de Sesión Criptográfico
    const sessionToken = signSession({
      userId: volunteer.id,
      userType: 'volunteer',
      role: 'Lector',
      committee: committeeName
    });

    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    return { 
      success: true, 
      redirectTo: '/calendar',
      role: 'Lector',
      committee: committeeName,
      name: `${volunteer.first_name} ${volunteer.last_name}`.trim()
    };
  }

  // 3. Registrar Intento Fallido para Rate Limiting
  if (attempt) {
    const newCount = attempt.attempts_count + 1;
    const lockedUntil = newCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await supabase
      .from('login_attempts')
      .update({
        attempts_count: newCount,
        locked_until: lockedUntil,
        last_attempt: new Date().toISOString()
      })
      .eq('id', attempt.id);
  } else {
    await supabase
      .from('login_attempts')
      .insert({
        phone: formattedPhone || rawPhoneInput,
        attempts_count: 1,
        last_attempt: new Date().toISOString()
      });
  }

  return { error: 'El teléfono o PIN es incorrecto.' };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
