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

  console.log("AUTH_LOG: Received login request", { rawPhoneInput, formattedPhone, pin_length: pin?.length, selectedUserId });

  if (!rawPhoneInput || !pin) {
    return { error: 'Por favor, ingresa tu teléfono y PIN.' };
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

      await supabase.from('login_attempts').delete().in('phone', targetPhones);

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

      const cookieStore = await cookies();
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

      await supabase.from('login_attempts').delete().in('phone', targetPhones);

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

      const cookieStore = await cookies();
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
      // Registrar intento fallido
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

    // Si existen MÚLTIPLES perfiles asociados a este teléfono y NO se ha seleccionado uno aún
    if (allCandidates.length > 1) {
      return {
        success: false,
        require_profile_selection: true,
        profiles: allCandidates.map(c => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          committee: c.committee,
          userType: c.userType,
        })),
      };
    }

    // Si existe EXACTAMENTE 1 perfil asociado a este teléfono
    const singleUser = allCandidates[0];
    const authResult = await authenticateSpecificUser(singleUser.id, singleUser.userType);
    if (authResult) return authResult;
  }

  // Registrar Intento Fallido para Rate Limiting
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
