"use server";

import { getAdminSupabase } from "@/lib/supabase/admin";
import { consumeAuthRateLimit, getServerActionClientIp, rateLimitMinutes } from "@/lib/auth-rate-limit";

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
    const limits = await Promise.all([
      consumeAuthRateLimit({ scope: "login-lookup-ip", identifier: ip, limit: 20, windowSeconds: 900 }),
      consumeAuthRateLimit({ scope: "login-lookup-phone", identifier: phone, limit: 10, windowSeconds: 900 }),
    ]);
    const blocked = limits.filter(limit => !limit.allowed);
    if (blocked.length) {
      return { error: `Demasiadas consultas. Inténtalo en ${rateLimitMinutes(Math.max(...blocked.map(limit => limit.retryAfterSeconds)))} minutos.` };
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
    return profiles.length ? { profiles } : { error: "No encontramos una cuenta con ese teléfono. Revisa el número o contacta a tu coordinador." };
  } catch {
    return { error: "No pudimos consultar tu perfil de forma segura. Inténtalo de nuevo." };
  }
}
