'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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
  const phone = (formData.get('phone') as string || '').replace(/\s+/g, '');
  const pin = formData.get('pin') as string;

  console.log("AUTH_LOG: Received login request", { phone, pin, pin_length: pin?.length });

  if (!phone || !pin) {
    return { error: 'Por favor, ingresa tu teléfono y PIN.' };
  }

  const supabase = await createClient();

  // 1. Intentar buscar en Profiles (Coordinadores)
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*, committees(name)')
    .eq('phone', phone)
    .eq('pin', pin)
    .maybeSingle();

  if (profile) {
    // Check if it's first login (assigned PIN 1234)
    if (pin === '1234') {
      return { 
        success: true, 
        force_pin_change: true, 
        user_id: profile.id, 
        user_type: 'profile' 
      };
    }

    const cookieStore = await cookies();
    const role = profile.role;
    const committeeName = profile.committees?.name || '';
    
    cookieStore.set('session', encodeURIComponent(`coordinator-${role}-${committeeName}`), {
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
  const { data: volunteer, error: volErr } = await supabase
    .from('volunteers')
    .select('*, committees(name)')
    .eq('phone', phone)
    .eq('pin', pin)
    .maybeSingle();

  if (volunteer) {
    // Check if it's first login (assigned PIN 1234)
    if (pin === '1234') {
       return { 
         success: true, 
         force_pin_change: true, 
         user_id: volunteer.id, 
         user_type: 'volunteer' 
       };
    }

    const cookieStore = await cookies();
    const committeeName = volunteer.committees?.name || '';

    cookieStore.set('session', encodeURIComponent(`volunteer-${volunteer.id}-${committeeName}`), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/',
    });

    return { 
      success: true, 
      redirectTo: '/calendar',
      role: 'Lector', // Los voluntarios ven su perfil tipo Lector
      committee: committeeName,
      name: `${volunteer.first_name} ${volunteer.last_name}`.trim()
    };
  }

  return { error: 'El teléfono o PIN es incorrecto.' };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
