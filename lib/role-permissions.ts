export type AppRole = 'Admin' | 'Editor' | 'Lector';
export type CoordinatorType = 'technology' | 'committee';

export type Capability =
  | 'view_settings'
  | 'view_activity_logs'
  | 'view_dashboard'
  | 'view_volunteers'
  | 'view_all_volunteers'
  | 'view_volunteer_profile'
  | 'edit_volunteer_personal_info'
  | 'reschedule_volunteer'
  | 'scan_qr_attendance'
  | 'register_missing_attendance'
  | 'correct_attendance_times'
  | 'create_volunteer'
  | 'import_volunteers'
  | 'archive_volunteer'
  | 'view_notices'
  | 'view_requests'
  | 'view_reports'
  | 'view_global_reports'
  | 'view_area_coverage'
  | 'manage_committee_areas'
  | 'assign_volunteer_areas'
  | 'manage_area_requirements'
  | 'manage_platform_users'
  | 'manage_permissions'
  | 'manage_committees';

export type ConfigurableRole = 'admin' | 'technology' | 'committee';

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_settings: 'Ver ajustes',
  view_activity_logs: 'Ver historial de actividades',
  view_dashboard: 'Ver Dashboard',
  view_volunteers: 'Ver voluntarios',
  view_all_volunteers: 'Ver voluntarios de todos los comités',
  view_volunteer_profile: 'Abrir perfiles de voluntarios',
  edit_volunteer_personal_info: 'Editar información personal',
  reschedule_volunteer: 'Reagendar turnos',
  scan_qr_attendance: 'Escanear QR y registrar entrada o salida',
  register_missing_attendance: 'Registrar asistencia o entrada faltante',
  correct_attendance_times: 'Corregir horarios manualmente',
  create_volunteer: 'Crear voluntarios',
  import_volunteers: 'Importar voluntarios',
  archive_volunteer: 'Archivar voluntarios',
  view_notices: 'Ver y enviar avisos',
  view_requests: 'Ver y gestionar solicitudes',
  view_reports: 'Ver reportes del alcance propio',
  view_global_reports: 'Ver reportes globales',
  view_area_coverage: 'Ver áreas y cobertura',
  manage_committee_areas: 'Crear y editar áreas',
  assign_volunteer_areas: 'Asignar voluntarios a áreas',
  manage_area_requirements: 'Configurar requerimientos de áreas',
  manage_platform_users: 'Gestionar usuarios de la plataforma',
  manage_permissions: 'Gestionar permisos por rol',
  manage_committees: 'Gestionar comités',
};

function permissionKey<R extends ConfigurableRole, C extends Capability>(role: R, capability: C) {
  return `role.${role}.${capability}` as const;
}

function createRolePermissionKeys<R extends ConfigurableRole>(role: R) {
  return Object.fromEntries(
    (Object.keys(CAPABILITY_LABELS) as Capability[]).map(capability => [
      capability,
      permissionKey(role, capability),
    ])
  ) as { [K in Capability]: `role.${R}.${K}` };
}

export const ROLE_PERMISSION_KEYS = {
  admin: createRolePermissionKeys('admin'),
  technology: createRolePermissionKeys('technology'),
  committee: createRolePermissionKeys('committee'),
} as const;

type PermissionKeyMap = (typeof ROLE_PERMISSION_KEYS)[ConfigurableRole];
export type ConfigurablePermissionKey = PermissionKeyMap[Capability];

const technologyEnabledByDefault = new Set<Capability>([
  'view_settings',
  'view_dashboard',
  'view_volunteers',
  'view_all_volunteers',
  'view_volunteer_profile',
  'edit_volunteer_personal_info',
  'reschedule_volunteer',
  'scan_qr_attendance',
  'create_volunteer',
  'import_volunteers',
  'view_notices',
  'view_requests',
  'view_reports',
  'view_global_reports',
]);

const committeeEnabledByDefault = new Set<Capability>([
  'view_settings',
  'view_dashboard',
  'view_volunteers',
  'view_volunteer_profile',
  'reschedule_volunteer',
  'view_notices',
  'view_requests',
  'view_reports',
  'view_area_coverage',
  'manage_committee_areas',
  'assign_volunteer_areas',
  'manage_area_requirements',
]);

function buildPermissionRecord<T>(
  valueFor: (role: ConfigurableRole, capability: Capability) => T
): Record<ConfigurablePermissionKey, T> {
  const entries: [ConfigurablePermissionKey, T][] = [];
  for (const role of Object.keys(ROLE_PERMISSION_KEYS) as ConfigurableRole[]) {
    for (const capability of Object.keys(CAPABILITY_LABELS) as Capability[]) {
      entries.push([ROLE_PERMISSION_KEYS[role][capability], valueFor(role, capability)]);
    }
  }
  return Object.fromEntries(entries) as Record<ConfigurablePermissionKey, T>;
}

export const CONFIGURABLE_PERMISSION_DEFAULTS = buildPermissionRecord((role, capability) => {
  if (role === 'admin') return true;
  if (role === 'technology') return technologyEnabledByDefault.has(capability);
  return committeeEnabledByDefault.has(capability);
});

export const CONFIGURABLE_PERMISSION_KEYS = Object.keys(
  CONFIGURABLE_PERMISSION_DEFAULTS
) as ConfigurablePermissionKey[];

export const CONFIGURABLE_PERMISSION_LABELS = buildPermissionRecord(
  (_role, capability) => CAPABILITY_LABELS[capability]
);

// These aliases preserve the choices saved by the previous, less granular matrix.
// A new explicit value always wins over its legacy fallback.
export const LEGACY_PERMISSION_FALLBACKS: Partial<Record<ConfigurablePermissionKey, string>> = {
  [ROLE_PERMISSION_KEYS.technology.view_all_volunteers]: 'role.technology.view_volunteers',
  [ROLE_PERMISSION_KEYS.technology.view_volunteer_profile]: 'role.technology.view_volunteers',
  [ROLE_PERMISSION_KEYS.technology.edit_volunteer_personal_info]: 'role.technology.edit_personal_info',
  [ROLE_PERMISSION_KEYS.technology.reschedule_volunteer]: 'role.technology.reschedule_volunteers',
  [ROLE_PERMISSION_KEYS.technology.create_volunteer]: 'role.technology.create_volunteers',
  [ROLE_PERMISSION_KEYS.technology.view_reports]: 'role.technology.view_global_reports',
  [ROLE_PERMISSION_KEYS.technology.view_area_coverage]: 'role.technology.manage_area_coverage',
  [ROLE_PERMISSION_KEYS.technology.manage_committee_areas]: 'role.technology.manage_area_coverage',
  [ROLE_PERMISSION_KEYS.technology.assign_volunteer_areas]: 'role.technology.manage_area_coverage',
  [ROLE_PERMISSION_KEYS.technology.manage_area_requirements]: 'role.technology.manage_area_coverage',
};

export function configurablePermissionRoleLabel(key: ConfigurablePermissionKey): string {
  if (key.startsWith('role.admin.')) return 'Administrador';
  return key.startsWith('role.technology.')
    ? 'Coordinador de tecnología'
    : 'Coordinador de comité';
}

export interface AuthorizationSnapshot {
  authenticated: boolean;
  userId: string | null;
  userType: 'profile' | 'volunteer' | null;
  name: string;
  role: AppRole;
  coordinatorType: CoordinatorType | null;
  committeeId: string | null;
  committeeName: string | null;
  permissions: Record<ConfigurablePermissionKey, boolean>;
}

export const EMPTY_AUTHORIZATION_SNAPSHOT: AuthorizationSnapshot = {
  authenticated: false,
  userId: null,
  userType: null,
  name: '',
  role: 'Lector',
  coordinatorType: null,
  committeeId: null,
  committeeName: null,
  permissions: { ...CONFIGURABLE_PERMISSION_DEFAULTS },
};

export function normalizeAppRole(value: unknown): AppRole {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'administrador') return 'Admin';
  if (role === 'editor' || role === 'coordinador') return 'Editor';
  return 'Lector';
}

export function normalizeCoordinatorType(value: unknown): CoordinatorType | null {
  return value === 'technology' || value === 'committee' ? value : null;
}

export function roleDisplayName(snapshot: Pick<AuthorizationSnapshot, 'role' | 'coordinatorType'>): string {
  if (snapshot.role === 'Admin') return 'Administrador';
  if (snapshot.role === 'Lector') return 'Voluntario';
  return snapshot.coordinatorType === 'technology'
    ? 'Coordinador de tecnología'
    : 'Coordinador de comité';
}

function configurableRoleFor(snapshot: AuthorizationSnapshot): ConfigurableRole | null {
  if (snapshot.role === 'Admin') return 'admin';
  if (snapshot.role !== 'Editor') return null;
  return snapshot.coordinatorType === 'technology' ? 'technology' : 'committee';
}

const OWN_COMMITTEE_CAPABILITIES = new Set<Capability>([
  'view_volunteer_profile',
  'edit_volunteer_personal_info',
  'reschedule_volunteer',
]);

const OWN_AREA_CAPABILITIES = new Set<Capability>([
  'view_area_coverage',
  'manage_committee_areas',
  'assign_volunteer_areas',
  'manage_area_requirements',
]);

export function hasCapability(
  snapshot: AuthorizationSnapshot,
  capability: Capability,
  targetCommitteeId?: string | null
): boolean {
  if (!snapshot.authenticated || snapshot.userType === 'volunteer' || snapshot.role === 'Lector') {
    return false;
  }

  const configurableRole = configurableRoleFor(snapshot);
  if (!configurableRole) return false;
  const key = ROLE_PERMISSION_KEYS[configurableRole][capability];
  if (!snapshot.permissions[key]) return false;

  if (
    configurableRole === 'committee'
    && OWN_COMMITTEE_CAPABILITIES.has(capability)
    && targetCommitteeId
    && targetCommitteeId !== snapshot.committeeId
  ) {
    return false;
  }

  if (configurableRole !== 'admin' && OWN_AREA_CAPABILITIES.has(capability)) {
    return Boolean(targetCommitteeId) && targetCommitteeId === snapshot.committeeId;
  }

  return true;
}
