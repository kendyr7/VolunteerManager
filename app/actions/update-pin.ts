'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { signSession } from '@/lib/auth'

function isSequential(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 0; i < pin.length - 1; i++) {
    const diff = pin.charCodeAt(i + 1) - pin.charCodeAt(i);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  return asc || desc;
}

function isRepetitive(pin: string): boolean {
  return /^(\d)\1+$/.test(pin);
}

export async function updateInitialPin(userId: string, userType: 'profile' | 'volunteer', newPin: string) {
  // 1. Validaciones de seguridad del lado del servidor para el PIN
  const isNumeric = /^[0-9]+$/.test(newPin);
  if (!newPin || newPin.length < 4 || newPin.length > 6 || !isNumeric) {
    return { error: "El PIN debe ser únicamente numérico y tener entre 4 y 6 dígitos." };
  }
  if (newPin === '1234') {
    return { error: "No puedes elegir el PIN por defecto '1234' por motivos de seguridad." };
  }
  if (isRepetitive(newPin)) {
    return { error: "Por motivos de seguridad, no utilices un PIN repetitivo (ej: 1111, 2222)." };
  }
  if (isSequential(newPin)) {
    return { error: "Por motivos de seguridad, no utilices un PIN secuencial (ej: 1234, 4321)." };
  }

  const supabase = await createClient();
  const table = userType === 'profile' ? 'profiles' : 'volunteers';
  
  const updateData: any = { pin: newPin };

  const { error } = await supabase
    .from(table)
    .update(updateData)
    .eq('id', userId);

  if (error) {
    console.error("Error updating initial PIN:", error);
    return { error: "No se pudo actualizar el PIN." };
  }

  // 2. Si se actualizó correctamente, crear el token de sesión criptográfico
  const { data: user } = await supabase
    .from(table)
    .select('*, committees(name)')
    .eq('id', userId)
    .single();

  if (user) {
    const cookieStore = await cookies();
    const committeeName = user.committees?.name || '';
    
    if (userType === 'profile') {
      const role = user.role;
      
      const sessionToken = signSession({
        userId: user.id,
        userType: 'profile',
        role,
        committee: committeeName
      });

      cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
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
        name: user.full_name,
        phone: user.phone
      };
    } else {
      const sessionToken = signSession({
        userId: user.id,
        userType: 'volunteer',
        role: 'Lector',
        committee: committeeName
      });

      cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });

      return { 
        success: true, 
        redirectTo: '/calendar', 
        role: 'Lector', 
        committee: committeeName,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        phone: user.phone
      };
    }
  }

  return { error: "Error de sesión tras actualizar PIN." };
}
