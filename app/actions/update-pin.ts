'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth'
import { formatE164 } from '@/lib/whatsapp'
import { getCurrentUserSession } from '@/lib/auth-helpers'
import { VolunteerMutationService } from '@/lib/services/volunteer-mutation.service'

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

  const sessionUser = await getCurrentUserSession();

  if (userType === 'volunteer') {
    const res = await VolunteerMutationService.setInitialPin(userId, newPin, {
      name: sessionUser.userName || 'Voluntario',
      role: sessionUser.userRole || 'Lector',
    });

    if (!res.success) {
      return { error: res.error || "No se pudo actualizar el PIN." };
    }
  } else {
    const { error } = await supabase
      .from('profiles')
      .update({ pin: newPin })
      .eq('id', userId);

    if (error) {
      console.error("Error updating initial PIN for profile:", error);
      return { error: "No se pudo actualizar el PIN." };
    }
  }

  // 2. Si se actualizó correctamente, recuperar el usuario y crear el token de sesión criptográfico
  const table = userType === 'profile' ? 'profiles' : 'volunteers';
  const { data: user, error: fetchError } = await supabase
    .from(table)
    .select('*, committees(name)')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching user after PIN update:", fetchError);
    return { error: `Error interno al recuperar usuario: ${fetchError.message}` };
  }

  if (!user) {
    console.error("User not found after PIN update for ID:", userId);
    return { error: "Error de sesión: Usuario no encontrado tras actualizar PIN." };
  }

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
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });

    let redirectTo = '/dashboard';
    if (role === 'Editor') redirectTo = '/dashboard';
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
      maxAge: SESSION_MAX_AGE_SECONDS,
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

export async function changeUserPin(currentPin: string, newPin: string, userPhone?: string) {
  try {
    let userId: string | null = null;
    let userType: 'profile' | 'volunteer' = 'profile';

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (sessionCookie?.value) {
      const { verifySessionToken } = await import('@/lib/auth');
      const session = verifySessionToken(sessionCookie.value);
      if (session) {
        userId = session.userId;
        userType = session.userType as 'profile' | 'volunteer';
      }
    }

    // Validar formato del nuevo PIN (exactamente 4 dígitos numéricos)
    const isNumeric = /^[0-9]+$/.test(newPin);
    if (!newPin || newPin.length !== 4 || !isNumeric) {
      return { success: false, error: "El nuevo PIN debe ser únicamente numérico y tener exactamente 4 dígitos." };
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

    // Validar que el PIN actual sea de 4 dígitos
    if (!currentPin || currentPin.length !== 4 || !/^[0-9]+$/.test(currentPin)) {
      return { success: false, error: "El PIN actual debe ser únicamente numérico y tener exactamente 4 dígitos." };
    }

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

    let user: any = null;
    let matchedTable: 'profiles' | 'volunteers' = userType === 'profile' ? 'profiles' : 'volunteers';

    // 1. Intentar buscar por ID de sesión si existe
    if (userId) {
      const { data } = await supabase.from(matchedTable).select('id, pin').eq('id', userId).maybeSingle();
      user = data;
    }

    // 2. Si no se encontró por ID y se provee userPhone, buscar por teléfono multiformato (evitando maybeSingle y fallbacks)
    if (!user && userPhone) {
      const formattedPhone = formatE164(userPhone);
      const rawDigits = userPhone.replace(/\D/g, '');
      const targetPhones = Array.from(new Set([
        userPhone,
        formattedPhone,
        rawDigits,
        rawDigits.length === 8 ? `+505${rawDigits}` : rawDigits,
        rawDigits.length === 8 ? `505${rawDigits}` : rawDigits,
      ])).filter(Boolean);

      // Probar en profiles
      const { data: profs } = await supabase.from('profiles').select('id, pin').in('phone', targetPhones);
      // Probar en volunteers activos
      const { data: vols } = await supabase.from('volunteers').select('id, pin, status').in('phone', targetPhones).neq('status', 'archived');

      const matchingUsers: Array<{ id: string; pin: string; table: 'profiles' | 'volunteers' }> = [
        ...(profs || []).map(p => ({ id: p.id, pin: p.pin, table: 'profiles' as const })),
        ...(vols || []).map(v => ({ id: v.id, pin: v.pin, table: 'volunteers' as const })),
      ];

      if (matchingUsers.length === 0) {
        return { success: false, error: "No se encontró ningún usuario con ese número de teléfono." };
      }

      if (matchingUsers.length > 1) {
        return {
          success: false,
          error: "Existen múltiples perfiles asociados a este número. Debes iniciar sesión con tu perfil para actualizar tu PIN de forma segura.",
        };
      }

      user = matchingUsers[0];
      matchedTable = matchingUsers[0].table;
    }

    if (!user) {
      return { success: false, error: "Usuario no encontrado para actualizar PIN." };
    }

    const sessionUser = await getCurrentUserSession();
    const actor = {
      name: sessionUser.userName || 'Usuario',
      role: sessionUser.userRole || 'Lector',
    };

    // Si es un voluntario, delegar a VolunteerMutationService para mutación y auditoría estandarizada
    if (matchedTable === 'volunteers') {
      return VolunteerMutationService.changePin(user.id, currentPin, newPin, actor);
    }

    // Si es un perfil de usuario de plataforma (profiles)
    if (user.pin !== currentPin) {
      return { success: false, error: "El PIN actual ingresado es incorrecto." };
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ pin: newPin })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: "Error al actualizar el PIN." };
    }

    await supabase.from('activity_logs').insert({
      user_name: sessionUser.userName,
      user_role: sessionUser.userRole,
      action_type: 'Seguridad',
      description: `Cambió su PIN de seguridad de acceso`,
      details: JSON.stringify({ context: { operation: 'profile_pin_change', targetUserId: user.id } }),
    });

    return { success: true };
  } catch (error) {
    console.error("Error en changeUserPin:", error);
    return { success: false, error: "Error interno del servidor al actualizar PIN." };
  }
}
