export type AppRole = 'Admin' | 'Editor' | 'Lector';
export type CoordinatorType = 'technology' | 'committee';

export type ConfigurablePermissionKey =
  | 'role.technology.view_dashboard'
  | 'role.technology.view_volunteers'
  | 'role.technology.edit_personal_info'
  | 'role.technology.reschedule_volunteers'
  | 'role.technology.register_missing_attendance'
  | 'role.technology.correct_attendance_times'
  | 'role.technology.view_notices'
  | 'role.technology.view_requests'
  | 'role.technology.view_global_reports'
  | 'role.technology.scan_qr_attendance'
  | 'role.technology.create_volunteers'
  | 'role.technology.import_volunteers'
  | 'role.technology.manage_area_coverage'
  | 'role.committee.view_notices'
  | 'role.committee.view_requests'
  | 'role.committee.view_global_reports';

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

export const CONFIGURABLE_PERMISSION_DEFAULTS: Record<ConfigurablePermissionKey, boolean> = {
  'role.technology.view_dashboard': true,
  'role.technology.view_volunteers': true,
  'role.technology.edit_personal_info': true,
  'role.technology.reschedule_volunteers': true,
  'role.technology.register_missing_attendance': false,
  'role.technology.correct_attendance_times': false,
  'role.technology.view_notices': true,
  'role.technology.view_requests': true,
  'role.technology.view_global_reports': true,
  'role.technology.scan_qr_attendance': true,
  'role.technology.create_volunteers': true,
  'role.technology.import_volunteers': true,
  'role.technology.manage_area_coverage': false,
  'role.committee.view_notices': true,
  'role.committee.view_requests': true,
  'role.committee.view_global_reports': false,
};

export const CONFIGURABLE_PERMISSION_KEYS = Object.keys(
  CONFIGURABLE_PERMISSION_DEFAULTS
) as ConfigurablePermissionKey[];

export const CONFIGURABLE_PERMISSION_LABELS: Record<ConfigurablePermissionKey, string> = {
  'role.technology.view_dashboard': 'Ver Dashboard',
  'role.technology.view_volunteers': 'Ver voluntarios',
  'role.technology.edit_personal_info': 'Editar información personal',
  'role.technology.reschedule_volunteers': 'Reagendar turnos',
  'role.technology.register_missing_attendance': 'Registrar asistencia o entrada faltante',
  'role.technology.correct_attendance_times': 'Corregir horarios manualmente',
  'role.technology.view_notices': 'Ver y enviar avisos',
  'role.technology.view_requests': 'Ver y gestionar solicitudes',
  'role.technology.view_global_reports': 'Ver reportes globales',
  'role.technology.scan_qr_attendance': 'Escanear QR y registrar entrada o salida',
  'role.technology.create_volunteers': 'Crear voluntarios',
  'role.technology.import_volunteers': 'Importar voluntarios',
  'role.technology.manage_area_coverage': 'Gestionar áreas y cobertura',
  'role.committee.view_notices': 'Ver y enviar avisos',
  'role.committee.view_requests': 'Ver y gestionar solicitudes',
  'role.committee.view_global_reports': 'Ver reportes globales',
};

export function configurablePermissionRoleLabel(key: ConfigurablePermissionKey): string {
  return key.startsWith('role.technology.')
    ? 'Coordinador de tecnología'
    : 'Coordinador de comité';
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

export function hasCapability(
  snapshot: AuthorizationSnapshot,
  capability: Capability,
  targetCommitteeId?: string | null
): boolean {
  if (!snapshot.authenticated) return false;
  if (snapshot.role === 'Admin') return true;

  if (snapshot.userType === 'volunteer' || snapshot.role === 'Lector') {
    return false;
  }

  if (snapshot.coordinatorType === 'technology') {
    switch (capability) {
      case 'view_settings':
        return true;
      case 'view_activity_logs':
        return false;
      case 'view_dashboard':
        return snapshot.permissions['role.technology.view_dashboard'];
      case 'view_volunteers':
      case 'view_all_volunteers':
      case 'view_volunteer_profile':
        return snapshot.permissions['role.technology.view_volunteers'];
      case 'reschedule_volunteer':
        return snapshot.permissions['role.technology.reschedule_volunteers'];
      case 'scan_qr_attendance':
        return snapshot.permissions['role.technology.scan_qr_attendance'];
      case 'create_volunteer':
        return snapshot.permissions['role.technology.create_volunteers'];
      case 'import_volunteers':
        return snapshot.permissions['role.technology.import_volunteers'];
      case 'edit_volunteer_personal_info':
        return snapshot.permissions['role.technology.edit_personal_info'];
      case 'register_missing_attendance':
        return snapshot.permissions['role.technology.register_missing_attendance'];
      case 'correct_attendance_times':
        return snapshot.permissions['role.technology.correct_attendance_times'];
      case 'view_notices':
        return snapshot.permissions['role.technology.view_notices'];
      case 'view_requests':
        return snapshot.permissions['role.technology.view_requests'];
      case 'view_global_reports':
      case 'view_reports':
        return snapshot.permissions['role.technology.view_global_reports'];
      case 'view_area_coverage':
      case 'manage_committee_areas':
      case 'assign_volunteer_areas':
      case 'manage_area_requirements':
        return Boolean(targetCommitteeId)
          && targetCommitteeId === snapshot.committeeId
          && snapshot.permissions['role.technology.manage_area_coverage'];
      case 'archive_volunteer':
      case 'manage_platform_users':
      case 'manage_permissions':
      case 'manage_committees':
        return false;
    }
  }

  if (snapshot.coordinatorType === 'committee') {
    const isOwnCommittee = !targetCommitteeId || targetCommitteeId === snapshot.committeeId;
    const isExplicitOwnCommittee = Boolean(targetCommitteeId) && targetCommitteeId === snapshot.committeeId;
    switch (capability) {
      case 'view_settings':
        return true;
      case 'view_activity_logs':
        return false;
      case 'view_dashboard':
      case 'view_volunteers':
      case 'view_reports':
        return true;
      case 'view_volunteer_profile':
      case 'reschedule_volunteer':
        return isOwnCommittee;
      case 'view_notices':
        return snapshot.permissions['role.committee.view_notices'];
      case 'view_requests':
        return snapshot.permissions['role.committee.view_requests'];
      case 'view_global_reports':
        return snapshot.permissions['role.committee.view_global_reports'];
      case 'view_area_coverage':
      case 'manage_committee_areas':
      case 'assign_volunteer_areas':
      case 'manage_area_requirements':
        return isExplicitOwnCommittee;
      case 'view_all_volunteers':
      case 'edit_volunteer_personal_info':
      case 'scan_qr_attendance':
      case 'register_missing_attendance':
      case 'correct_attendance_times':
      case 'create_volunteer':
      case 'import_volunteers':
      case 'archive_volunteer':
      case 'manage_platform_users':
      case 'manage_permissions':
      case 'manage_committees':
        return false;
    }
  }

  return false;
}
