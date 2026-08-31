// Presentation preferences only. Never used to grant access or extend a session.
export const LOGIN_ACTIVITY_KEY = "login_last_activity_at";
export const LOGIN_INTRO_IDLE_MS = 30 * 60 * 1000;

export function shouldShowTemple(lastActivity: number | null, now = Date.now()): boolean {
  return lastActivity === null || !Number.isFinite(lastActivity) || lastActivity <= 0 ||
    lastActivity > now || now - lastActivity >= LOGIN_INTRO_IDLE_MS;
}

let memoryActivity: number | null = null;

export function readLoginActivity(): number | null {
  try {
    const stored = window.localStorage.getItem(LOGIN_ACTIVITY_KEY);
    return stored === null ? memoryActivity : Number(stored);
  } catch {
    return memoryActivity;
  }
}

export function recordLoginActivity(now = Date.now()): void {
  memoryActivity = now;
  try {
    window.localStorage.setItem(LOGIN_ACTIVITY_KEY, String(now));
  } catch {
    // Private browsing/storage restrictions must never prevent login.
  }
}

export function normalizeLoginPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Strip the country code only from a complete international number. An
  // eight-digit local number that starts with 505 must remain unchanged.
  if (digits.length === 11 && digits.startsWith("505")) return digits.slice(3);
  if (digits.length === 13 && digits.startsWith("00505")) return digits.slice(5);
  return digits;
}

export function rememberLoginPhone(phone: string, remember: boolean, name = ""): void {
  const localPhone = normalizeLoginPhone(phone);
  try {
    if (remember && /^\d{8}$/.test(localPhone)) {
      window.localStorage.setItem("remember_me", "true");
      window.localStorage.setItem("volunteer_phone", localPhone);
      if (name) window.localStorage.setItem("volunteer_name", name);
      else window.localStorage.removeItem("volunteer_name");
    } else {
      window.localStorage.removeItem("remember_me");
      window.localStorage.removeItem("volunteer_phone");
      window.localStorage.removeItem("volunteer_name");
    }
  } catch {
    // Remembering a number is optional; PIN verification is not.
  }
}

type NamedProfile = { firstName: string; lastName: string };

export function loginDisplayName(profiles: NamedProfile[], rememberedName = ""): string {
  const names = profiles.map(profile => `${profile.firstName} ${profile.lastName}`.trim());
  const normalize = (name: string) => name.replace(/\s+/g, " ").toLocaleLowerCase("es");
  if (rememberedName && names.some(name => normalize(name) === normalize(rememberedName))) return rememberedName;
  if (names.length && names.every(name => normalize(name) === normalize(names[0]))) return names[0];
  // Different people cannot be identified until the PIN is verified.
  return "";
}
