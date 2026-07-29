'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { signSession } from '@/lib/auth'
import { formatE164 } from '@/lib/whatsapp'

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

  // Usar SERVICE_ROLE_KEY para ignorar RLS durante la actualización del PIN inicial
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

  // 2. Si se actualizó correctamente, recuperar el usuario y crear el token de sesión criptográfico
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
      maxAge: 60 * 60 * 24 * 7,
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

    // 2. Si no se encontró por ID y se provee userPhone, buscar por teléfono multiformato
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
      const { data: prof } = await supabase.from('profiles').select('id, pin').in('phone', targetPhones).maybeSingle();
      if (prof) {
        user = prof;
        matchedTable = 'profiles';
      } else {
        // Probar en volunteers
        const { data: vol } = await supabase.from('volunteers').select('id, pin').in('phone', targetPhones).maybeSingle();
        if (vol) {
          user = vol;
          matchedTable = 'volunteers';
        }
      }
    }

    // 3. Fallback: buscar el primer perfil si no se encontró por ID ni por teléfono
    if (!user) {
      const { data: fallbackProf } = await supabase.from('profiles').select('id, pin').order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (fallbackProf) {
        user = fallbackProf;
        matchedTable = 'profiles';
      }
    }

    if (!user) {
      return { success: false, error: "Usuario no encontrado para actualizar PIN." };
    }

    if (user.pin !== currentPin) {
      return { success: false, error: "El PIN actual ingresado es incorrecto." };
    }

    // Actualizar el PIN
    const { error: updateError } = await supabase
      .from(matchedTable)
      .update({ pin: newPin })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: "Error al actualizar el PIN." };
    }

    return { success: true };
  } catch (error) {
    console.error("Error en changeUserPin:", error);
    return { success: false, error: "Error interno del servidor al actualizar PIN." };
  }
}
