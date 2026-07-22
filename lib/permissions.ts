export function canEditShifts(): boolean {
  if (typeof window === "undefined") return false;

  const role = localStorage.getItem("mock_role") || "Admin";

  // 1. Voluntarios (Lector) NUNCA pueden editar turnos
  if (role === "Lector" || role === "Voluntario") {
    return false;
  }

  // 2. Administradores SIEMPRE pueden editar turnos
  if (role === "Admin") {
    return true;
  }

  // 3. Coordinadores (Editor) solo pueden editar si el permiso fue habilitado explicitamente por un Admin
  // (Por defecto está deshabilitado)
  if (role === "Editor" || role === "Coordinador") {
    const isAllowed = localStorage.getItem("allow_coordinator_shift_edit");
    return isAllowed === "true";
  }

  return false;
}

export function isCoordinatorShiftEditAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("allow_coordinator_shift_edit") === "true";
}

export function setCoordinatorShiftEditAllowed(allowed: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("allow_coordinator_shift_edit", allowed ? "true" : "false");
}
