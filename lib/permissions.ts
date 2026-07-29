import { createClient } from "@/lib/supabase/client";

// ─── CROSS-TAB & REALTIME PERMISSIONS SYNC ──────────────────────────
let permissionsChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    permissionsChannel = new BroadcastChannel("volunteer_manager_permissions");
    permissionsChannel.onmessage = (event) => {
      if (event.data && event.data.key) {
        if (event.data.key === "mock_role" && event.data.role) {
          localStorage.setItem("mock_role", event.data.role);
        } else if (event.data.allowed !== undefined) {
          localStorage.setItem(event.data.key, event.data.allowed ? "true" : "false");
        }
        window.dispatchEvent(new CustomEvent("permissions-changed", { detail: event.data }));
      }
    };
  } catch (e) {}
}

// Subscribe to Supabase Realtime for instant multi-device sync
if (typeof window !== "undefined") {
  try {
    const supabase = createClient();
    supabase
      .channel("system_settings_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        (payload: any) => {
          if (payload.new && payload.new.key) {
            const isAllowed = payload.new.value === "true";
            localStorage.setItem(payload.new.key, payload.new.value);
            window.dispatchEvent(
              new CustomEvent("permissions-changed", {
                detail: { key: payload.new.key, allowed: isAllowed },
              })
            );
            if (permissionsChannel) {
              permissionsChannel.postMessage({ key: payload.new.key, allowed: isAllowed });
            }
          }
        }
      )
      .subscribe();
  } catch (e) {}
}

// ─── ROLE NORMALIZATION HELPER ──────────────────────────────────────
export function getNormalizedRole(): "Admin" | "Editor" | "Lector" {
  if (typeof window === "undefined") return "Admin";
  const rawRole = localStorage.getItem("mock_role") || "Admin";
  const lower = rawRole.toLowerCase().trim();
  if (lower === "admin" || lower === "administrador") return "Admin";
  if (lower === "lector" || lower === "voluntario") return "Lector";
  return "Editor";
}

// ─── GENERIC SYSTEM PERMISSION HELPERS ──────────────────────────────
export function getSystemPermission(key: string, defaultValue = true): boolean {
  if (typeof window === "undefined") return defaultValue;
  const val = localStorage.getItem(key);
  if (val === null || val === undefined) return defaultValue;
  return val === "true";
}

export function setSystemPermission(key: string, allowed: boolean): void {
  if (typeof window === "undefined") return;
  const strVal = allowed ? "true" : "false";
  localStorage.setItem(key, strVal);
  
  // Instant local event dispatch
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("permissions-changed", { detail: { key, allowed } }));

  // Instant broadcast to all open tabs
  if (permissionsChannel) {
    permissionsChannel.postMessage({ key, allowed });
  }

  // Sync to database
  try {
    const supabase = createClient();
    supabase.from("system_settings").upsert(
      { key, value: strVal, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    ).then(({ error }) => {
      if (error && error.code !== 'PGRST205') console.warn("Could not save system_settings:", error.message);
    });
  } catch (e) {}
}

export function setMockRole(role: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mock_role", role);
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("permissions-changed", { detail: { key: "mock_role", role } }));
  if (permissionsChannel) {
    permissionsChannel.postMessage({ key: "mock_role", role });
  }
}

export async function fetchSystemPermission(key: string, defaultValue = true): Promise<boolean> {
  if (typeof window === "undefined") return defaultValue;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (!error && data && data.value !== undefined && data.value !== null) {
      const isAllowed = data.value === "true";
      localStorage.setItem(key, isAllowed ? "true" : "false");
      return isAllowed;
    }
  } catch (e) {}
  return getSystemPermission(key, defaultValue);
}

export async function syncAllPermissionsFromDatabase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("system_settings").select("key, value");
    if (!error && data && data.length > 0) {
      let changed = false;
      data.forEach((row: { key: string; value: string }) => {
        if (row.key && row.value !== undefined) {
          const current = localStorage.getItem(row.key);
          if (current !== row.value) {
            localStorage.setItem(row.key, row.value);
            changed = true;
          }
        }
      });
      if (changed) {
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new CustomEvent("permissions-changed", { detail: { synced: true } }));
      }
    }
  } catch (e) {}
}

export function resetAllPermissionsToDefault(): void {
  if (typeof window === "undefined") return;
  const defaults: Record<string, boolean> = {
    allow_coordinator_dashboard: true,
    allow_coordinator_volunteers: true,
    allow_coordinator_shift_edit: false,
    allow_coordinator_whatsapp: true,
    allow_coordinator_reports: true,
    allow_coordinator_qr: true,
    allow_coordinator_import: true,
    allow_coordinator_users: false,
    allow_volunteer_view_volunteers: true,
  };

  Object.entries(defaults).forEach(([key, val]) => {
    setSystemPermission(key, val);
  });
}

// ─── COORDINATOR & VOLUNTEER SPECIFIC PERMISSIONS ─────────────────────
export function canViewDashboard(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_dashboard", true);
}

export function canEditShifts(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_shift_edit", false);
}

export function canSendWhatsappMessages(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_whatsapp", true);
}

export function canViewReports(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_reports", true);
}

export function canViewVolunteers(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") {
    return getSystemPermission("allow_volunteer_view_volunteers", true);
  }
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_volunteers", true);
}

export function canQrCheckin(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_qr", true);
}

export function canImportData(): boolean {
  const role = getNormalizedRole();
  if (role === "Lector") return false;
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_import", true);
}

export function canManageUsers(): boolean {
  const role = getNormalizedRole();
  if (role === "Admin") return true;
  return getSystemPermission("allow_coordinator_users", false);
}

// Legacy exports for backward compatibility
export const isCoordinatorShiftEditAllowed = () => getSystemPermission("allow_coordinator_shift_edit", false);
export const setCoordinatorShiftEditAllowed = (allowed: boolean) => setSystemPermission("allow_coordinator_shift_edit", allowed);
export const fetchCoordinatorShiftEditAllowed = () => fetchSystemPermission("allow_coordinator_shift_edit", false);

export const isCoordinatorWhatsappAllowed = () => getSystemPermission("allow_coordinator_whatsapp", true);
export const setCoordinatorWhatsappAllowed = (allowed: boolean) => setSystemPermission("allow_coordinator_whatsapp", allowed);
export const fetchCoordinatorWhatsappAllowed = () => fetchSystemPermission("allow_coordinator_whatsapp", true);

export const isCoordinatorReportsAllowed = () => getSystemPermission("allow_coordinator_reports", true);
export const setCoordinatorReportsAllowed = (allowed: boolean) => setSystemPermission("allow_coordinator_reports", allowed);
export const fetchCoordinatorReportsAllowed = () => fetchSystemPermission("allow_coordinator_reports", true);
