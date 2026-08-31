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
import { createAuthTiming, type AuthOutcome } from '@/lib/auth-timing'

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

type LoginCandidate = {
  id: string;
  userType: 'profile' | 'volunteer';
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  committee: string;
};

function committeeName(value: { name: string | null } | { name: string | null }[] | null): string {
  return (Array.isArray(value) ? value[0]?.name : value?.name) || '';
}

export async function loginWithPin(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const phoneInput = formData.get('phone');
  const pin = formData.get('pin');
  const selectedUserId = formData.get('selectedUserId');
  const selectedUserType = formData.get('selectedUserType');
  const hasSelection = selectedUserId !== null || selectedUserType !== null;
  const timing = createAuthTiming(hasSelection ? 'selected' : 'phone');
  let outcome: AuthOutcome = 'error';

  try {
    if (typeof phoneInput !== 'string' || !phoneInput.trim() ||
        typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      outcome = 'invalid_input';
      return { error: 'Por favor, ingresa tu teléfono y PIN de 4 dígitos.' };
    }
    if (hasSelection && (typeof selectedUserId !== 'string' || !selectedUserId ||
        !['profile', 'volunteer'].includes(String(selectedUserType)))) {
      outcome = 'invalid_input';
      return { error: 'Selecciona un perfil válido.' };
    }

    const rawPhoneInput = phoneInput.trim();
    const formattedPhone = formatE164(rawPhoneInput);
    const rawDigits = rawPhoneInput.replace(/\D/g, '');
    const targetPhones = Array.from(new Set([
      formattedPhone,
      rawPhoneInput.replace(/\s+/g, ''),
      formattedPhone.replace('+', ''),
      rawDigits,
      rawDigits.length === 8 ? `505${rawDigits}` : rawDigits,
    ])).filter(Boolean);
    const phoneRateLimitKey = formattedPhone || rawDigits || rawPhoneInput;

    // One shared budget for security checks + credential lookup. An unavailable
    // service must fail closed, not retry invisibly for another seven seconds.
    const signal = AbortSignal.timeout(4000);
    try {
      const [phoneLimit, ipLimit] = await timing.measure('rateLimit', async () => {
        const clientIp = await getServerActionClientIp();
        return Promise.all([
          consumeAuthRateLimit({ scope: 'login-phone', identifier: phoneRateLimitKey, limit: 5, windowSeconds: 900, signal }),
          consumeAuthRateLimit({ scope: 'login-ip', identifier: clientIp, limit: 20, windowSeconds: 900, signal }),
        ]);
      });
      const blocked = !phoneLimit.allowed ? phoneLimit : !ipLimit.allowed ? ipLimit : null;
      if (blocked) {
        outcome = 'rate_limited';
        return { error: `Demasiados intentos de acceso. Inténtalo de nuevo en ${rateLimitMinutes(blocked.retryAfterSeconds)} minutos.` };
      }
    } catch {
      outcome = 'security_unavailable';
      return { error: 'No pudimos verificar el acceso por un problema de conexión. Inténtalo nuevamente.' };
    }

    const supabase = await getAdminSupabase();
    const staffQuery = () => {
      const query = supabase.from('profiles')
        .select('id, full_name, role, committees(name)')
        .in('phone', targetPhones).eq('pin', pin)
        .abortSignal(signal).retry(false);
      return hasSelection ? query.eq('id', selectedUserId as string) : query;
    };
    const volunteerQuery = () => {
      const query = supabase.from('volunteers')
        .select('id, first_name, last_name, committees(name)')
        .in('phone', targetPhones).eq('pin', pin).neq('status', 'archived')
        .abortSignal(signal).retry(false);
      return hasSelection ? query.eq('id', selectedUserId as string) : query;
    };

    const [staff, volunteers] = await timing.measure('lookup', () => Promise.all([
      !hasSelection || selectedUserType === 'profile'
        ? staffQuery() : Promise.resolve({ data: [], error: null }),
      !hasSelection || selectedUserType === 'volunteer'
        ? volunteerQuery() : Promise.resolve({ data: [], error: null }),
    ]));

    // Never turn a network/database failure into "wrong PIN", or authenticate
    // from partial results when the other account table could not be checked.
    if (staff.error || volunteers.error || signal.aborted) {
      outcome = 'lookup_unavailable';
      return { error: 'No pudimos verificar tu PIN por un problema de conexión. Inténtalo nuevamente.' };
    }

    const candidates: LoginCandidate[] = [
      ...(staff.data || []).map(person => ({
        id: person.id, userType: 'profile' as const,
        firstName: person.full_name || 'Coordinador', lastName: '',
        name: person.full_name || 'Coordinador', role: person.role,
        committee: committeeName(person.committees),
      })),
      ...(volunteers.data || []).map(person => ({
        id: person.id, userType: 'volunteer' as const,
        firstName: person.first_name || 'Voluntario', lastName: person.last_name || '',
        name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
        role: 'Lector', committee: committeeName(person.committees),
      })),
    ];

    if (candidates.length === 0) {
      outcome = 'invalid_pin';
      return { error: 'El teléfono o PIN es incorrecto.' };
    }
    if (candidates.length > 1) {
      if (hasSelection || candidates.some(candidate => candidate.userType === 'profile')) {
        outcome = 'ambiguous_pin';
        return { error: 'Este teléfono tiene cuentas con el mismo PIN. Contacta a tu coordinador para asignar PINs diferentes.' };
      }
      outcome = 'choose_volunteer';
      return {
        success: false,
        require_profile_selection: true,
        profiles: candidates.map(person => ({
          id: person.id, firstName: person.firstName, lastName: person.lastName,
          committee: person.committee || 'Sin comité', userType: person.userType,
        })),
      };
    }

    // This record was just verified against phone + PIN (+ selected ID and
    // active status). Reuse it within this request only, never cache credentials.
    const person = candidates[0];
    const result = await timing.measure('finalize', async (): Promise<AuthState> => {
      if (pin === '1234') {
        await clearAuthRateLimit('login-phone', phoneRateLimitKey);
        return { success: true, force_pin_change: true, user_id: person.id, user_type: person.userType };
      }

      await Promise.all([
        clearAuthRateLimit('login-phone', phoneRateLimitKey),
        revokePushDevice(),
      ]);
      const sessionToken = signSession({
        userId: person.id, userType: person.userType,
        role: person.role, committee: person.committee,
      });
      const cookieStore = await cookies();
      cookieStore.set('session', sessionToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: SESSION_MAX_AGE_SECONDS, path: '/',
      });
      return {
        success: true,
        redirectTo: person.userType === 'volunteer' ? '/calendar' : person.role === 'Lector' ? '/shifts' : '/dashboard',
        role: person.role, committee: person.committee, name: person.name,
      };
    });
    outcome = result.force_pin_change ? 'change_pin' : 'success';
    return result;
  } catch {
    return { error: 'No pudimos completar el acceso. Revisa tu conexión e inténtalo nuevamente.' };
  } finally {
    timing.finish(outcome);
  }
}

export async function logout(): Promise<{ pushRevoked: boolean }> {
  const cookieStore = await cookies();
  let pushRevoked = true;
  try { await revokePushDevice(); }
  catch {
    pushRevoked = false;
    console.error('[PUSH] No se pudo revocar el dispositivo al cerrar sesión.');
  }
  finally { cookieStore.delete('session'); }
  return { pushRevoked };
}
