"use server";

import { getAdminSupabase } from "@/lib/supabase/admin";
import {
  consumeAuthRateLimit,
  getServerActionClientIp,
  logAuthRateLimitBlock,
  rateLimitMinutes,
} from "@/lib/auth-rate-limit";
import { AUTH_RATE_LIMITS, AUTH_RATE_LIMIT_WINDOW_SECONDS } from "@/lib/auth-rate-limit-policy";

export type LoginProfile = {
  id: string;
  firstName: string;
  lastName: string;
  committee: string;
  userType: "profile" | "volunteer";
};

// Public account chooser: names only, never PINs, roles, assignments or session data.
// Selection is not authentication: the PIN/passkey must still match this person.
export async function getLoginProfiles(phone: string): Promise<{ profiles?: LoginProfile[]; error?: string }> {
  if (typeof phone !== "string" || !/^\d{8}$/.test(phone)) {
    return { error: "Ingresa un teléfono de 8 dígitos." };
  }

  try {
    const ip = await getServerActionClientIp();
    const [networkVolumeLimit, phoneLimit] = await Promise.all([
      consumeAuthRateLimit({
        scope: "login-lookup-volume-ip",
        identifier: ip,
        limit: AUTH_RATE_LIMITS.sharedNetworkVolume,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
      consumeAuthRateLimit({
        scope: "login-lookup-phone",
        identifier: phone,
        limit: AUTH_RATE_LIMITS.profileLookupsPerPhone,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      }),
    ]);
    if (!networkVolumeLimit.allowed) {
      logAuthRateLimitBlock('login-lookup-volume-ip', networkVolumeLimit);
      return { error: `Esta conexión tiene un volumen inusual de accesos. Inténtalo en ${rateLimitMinutes(networkVolumeLimit.retryAfterSeconds)} minutos.` };
    }
    if (!phoneLimit.allowed) {
      logAuthRateLimitBlock('login-lookup-phone', phoneLimit);
      return { error: `Demasiadas consultas para este teléfono. Inténtalo en ${rateLimitMinutes(phoneLimit.retryAfterSeconds)} minutos.` };
    }

    const supabase = await getAdminSupabase();
    const phones = [phone, `505${phone}`, `+505${phone}`];
    const [staff, volunteers] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("phone", phones),
      supabase.from("volunteers").select("id, first_name, last_name").in("phone", phones).neq("status", "archived"),
    ]);
    if (staff.error || volunteers.error) {
      return { error: "No pudimos consultar tu perfil. Inténtalo de nuevo." };
    }

    const profiles: LoginProfile[] = [
      ...(staff.data || []).map(person => ({ id: person.id, firstName: person.full_name || "Coordinador", lastName: "", committee: "", userType: "profile" as const })),
      ...(volunteers.data || []).map(person => ({ id: person.id, firstName: person.first_name || "Voluntario", lastName: person.last_name || "", committee: "", userType: "volunteer" as const })),
    ];
    if (profiles.length) return { profiles };

    // Unknown-number enumeration remains tightly constrained without making
    // successful volunteers on the same venue network consume that budget.
    const unknownPhoneLimit = await consumeAuthRateLimit({
      scope: 'login-lookup-miss-ip',
      identifier: ip,
      limit: AUTH_RATE_LIMITS.unknownPhoneLookupsPerNetwork,
      windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (!unknownPhoneLimit.allowed) {
      logAuthRateLimitBlock('login-lookup-miss-ip', unknownPhoneLimit);
      return { error: `Demasiadas consultas desconocidas desde esta conexión. Inténtalo en ${rateLimitMinutes(unknownPhoneLimit.retryAfterSeconds)} minutos.` };
    }

    return { error: "No encontramos una cuenta con ese teléfono. Revisa el número o contacta a tu coordinador." };
  } catch {
    return { error: "No pudimos consultar tu perfil de forma segura. Inténtalo de nuevo." };
  }
}
