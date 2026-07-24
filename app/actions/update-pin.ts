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

export async function changeUserPin(currentPin: string, newPin: string) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie?.value) {
      return { success: false, error: "No autorizado" };
    }

    const { verifySessionToken } = await import('@/lib/auth');
    const session = verifySessionToken(sessionCookie.value);
    
    if (!session) {
      return { success: false, error: "Sesión inválida" };
    }

    // Validar formato del nuevo PIN
    const isNumeric = /^[0-9]+$/.test(newPin);
    if (!newPin || newPin.length < 4 || newPin.length > 6 || !isNumeric) {
      return { success: false, error: "El nuevo PIN debe ser únicamente numérico y tener entre 4 y 6 dígitos." };
    }
    if (newPin === '1234') {
      return { success: false, error: "No puedes elegir el PIN por defecto '1234' por motivos de seguridad." };
    }
    if (isRepetitive(newPin)) {
      return { success: false, error: "Por motivos de seguridad, no utilices un PIN repetitivo (ej: 1111, 2222)." };
    }
    if (isSequential(newPin)) {
      return { success: false, error: "Por motivos de seguridad, no utilices un PIN secuencial (ej: 1234, 4321)." };
    }

    const supabase = await createClient();
    const table = session.userType === 'profile' ? 'profiles' : 'volunteers';
    
    // Verificar que el PIN actual sea correcto
    const { data: user, error: fetchError } = await supabase
      .from(table)
      .select('id, pin')
      .eq('id', session.userId)
      .single();

    if (fetchError || !user) {
      return { success: false, error: "Usuario no encontrado" };
    }

    if (user.pin !== currentPin) {
      return { success: false, error: "El PIN actual ingresado es incorrecto" };
    }

    // Actualizar el PIN
    const { error: updateError } = await supabase
      .from(table)
      .update({ pin: newPin })
      .eq('id', session.userId);

    if (updateError) {
      return { success: false, error: "Error al actualizar el PIN" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error en changeUserPin:", error);
    return { success: false, error: "Error interno del servidor" };
  }
}
