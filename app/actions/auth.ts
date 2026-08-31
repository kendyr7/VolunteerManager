'use server'

import { cookies } from 'next/headers'
import { SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth'
import {
  clearAuthRateLimit,
  consumeAuthRateLimit,
  getServerActionClientIp,
  rateLimitMinutes,
} from '@/lib/auth-rate-limit'
import { getAdminSupabase } from '@/lib/supabase/admin'
import { formatE164 } from '@/lib/whatsapp'
import { revokePushDevice } from '@/lib/push/device'

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
  require_profile_selection?: boolean;
  profiles?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    committee: string;
    userType: 'profile' | 'volunteer';
  }>;
}

export async function loginWithPin(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const rawPhoneInput = (formData.get('phone') as string || '').trim();
  const pin = formData.get('pin') as string;
  const selectedUserId = formData.get('selectedUserId') as string | null;
  const selectedUserType = formData.get('selectedUserType') as 'profile' | 'volunteer' | null;

  const formattedPhone = formatE164(rawPhoneInput);
  const rawDigits = rawPhoneInput.replace(/\D/g, '');
  const targetPhones = Array.from(new Set([
    formattedPhone,
    rawPhoneInput.replace(/\s+/g, ''),
    formattedPhone.replace('+', ''),
    rawDigits,
    rawDigits.length === 8 ? `505${rawDigits}` : rawDigits
  ])).filter(Boolean);

  if (!rawPhoneInput || !pin) {
    return { error: 'Por favor, ingresa tu teléfono y PIN.' };
  }

  const phoneRateLimitKey = formattedPhone || rawDigits || rawPhoneInput;
  try {
    const clientIp = await getServerActionClientIp();
    const [phoneLimit, ipLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: 'login-phone',
        identifier: phoneRateLimitKey,
        limit: 5,
        windowSeconds: 15 * 60,
      }),
      consumeAuthRateLimit({
        scope: 'login-ip',
        identifier: clientIp,
        limit: 20,
        windowSeconds: 15 * 60,
      }),
    ]);

    const blockedLimit = !phoneLimit.allowed ? phoneLimit : !ipLimit.allowed ? ipLimit : null;
    if (blockedLimit) {
      return {
        error: `Demasiados intentos de acceso. Inténtalo de nuevo en ${rateLimitMinutes(blockedLimit.retryAfterSeconds)} minutos.`,
      };
    }
  } catch (error) {
    console.error('[AUTH] Rate limiter unavailable:', error);
    return { error: 'El control de seguridad no está disponible. Inténtalo nuevamente en unos minutos.' };
  }

  const supabase = await getAdminSupabase();

  // Helper para finalizar login autenticando un ID específico
  const authenticateSpecificUser = async (userId: string, userType: 'profile' | 'volunteer') => {
    if (userType === 'profile') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, committees(name)')
        .eq('id', userId)
        .eq('pin', pin)
        .maybeSingle();

      if (!profile) return null;

      await clearAuthRateLimit('login-phone', phoneRateLimitKey);

      if (pin === '1234') {
        return { 
          success: true, 
          force_pin_change: true, 
          user_id: profile.id, 
          user_type: 'profile' as const 
        };
      }

      const role = profile.role;
      const committeeName = profile.committees?.name || '';
      const sessionToken = signSession({
        userId: profile.id,
        userType: 'profile',
        role,
        committee: committeeName
      });

      await revokePushDevice();
      const cookieStore = await cookies();
      cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
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
        name: profile.full_name
      };
    } else {
      const { data: volunteer } = await supabase
        .from('volunteers')
        .select('*, committees(name)')
        .eq('id', userId)
        .eq('pin', pin)
        .neq('status', 'archived')
        .maybeSingle();

      if (!volunteer) return null;

      await clearAuthRateLimit('login-phone', phoneRateLimitKey);

      if (pin === '1234') {
        return { 
          success: true, 
          force_pin_change: true, 
          user_id: volunteer.id, 
          user_type: 'volunteer' as const 
        };
      }

      const committeeName = volunteer.committees?.name || '';
      const sessionToken = signSession({
        userId: volunteer.id,
        userType: 'volunteer',
        role: 'Lector',
        committee: committeeName
      });

      await revokePushDevice();
      const cookieStore = await cookies();
      cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: '/',
      });

      return { 
        success: true, 
        redirectTo: '/calendar',
        role: 'Lector',
        committee: committeeName,
        name: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim()
      };
    }
  };

  // CASO 1: Se proporcionó un ID de usuario específico previamente desambiguado
  if (selectedUserId && selectedUserType) {
    const authResult = await authenticateSpecificUser(selectedUserId, selectedUserType);
    if (authResult) return authResult;
  } else {
    // CASO 2: Buscar todos los perfiles y voluntarios activos asociados al teléfono
    const { data: matchedProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, pin, role, committees(name)')
      .in('phone', targetPhones);

    const { data: matchedVolunteers } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, pin, status, committees(name)')
      .in('phone', targetPhones)
      .neq('status', 'archived');

    const candidateProfiles = (matchedProfiles || []).map((p: any) => {
      const comm = Array.isArray(p.committees) ? p.committees[0]?.name : p.committees?.name;
      return {
        id: p.id,
        firstName: p.full_name || 'Coordinador',
        lastName: '',
        committee: comm || 'Administración',
        userType: 'profile' as const,
        pin: p.pin,
      };
    });

    const candidateVolunteers = (matchedVolunteers || []).map((v: any) => {
      const comm = Array.isArray(v.committees) ? v.committees[0]?.name : v.committees?.name;
      return {
        id: v.id,
        firstName: v.first_name || 'Voluntario',
        lastName: v.last_name || '',
        committee: comm || 'Sin comité',
        userType: 'volunteer' as const,
        pin: v.pin,
      };
    });

    const allCandidates = [...candidateProfiles, ...candidateVolunteers];

    if (allCandidates.length === 0) {
      return { error: 'El teléfono o PIN es incorrecto.' };
    }

    // Filtrar candidatos cuyo PIN coincide exactamente con el ingresado
    const validPinCandidates = allCandidates.filter(c => c.pin === pin);

    if (validPinCandidates.length === 1) {
      // Exactamente 1 perfil coincide con el teléfono y el PIN: ingresar directamente sin mostrar menú de desambiguación
      const singleUser = validPinCandidates[0];
      const authResult = await authenticateSpecificUser(singleUser.id, singleUser.userType);
      if (authResult) return authResult;
    } else if (validPinCandidates.length > 1) {
      // Múltiples perfiles comparten el mismo teléfono Y el mismo PIN (ej. ambos con PIN por defecto '1234'). Mostrar menú de selección
      return {
        success: false,
        require_profile_selection: true,
        profiles: validPinCandidates.map(c => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          committee: c.committee,
          userType: c.userType,
        })),
      };
    }
  }

  return { error: 'El teléfono o PIN es incorrecto.' };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  try { await revokePushDevice(); }
  catch { console.error('[PUSH] No se pudo revocar el dispositivo al cerrar sesión.'); }
  finally { cookieStore.delete('session'); }
}
