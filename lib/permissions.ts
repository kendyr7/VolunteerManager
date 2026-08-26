'use client';

import { createClient } from '@/lib/supabase/client';
import { getCurrentAuthorizationAction } from '@/app/actions/permission-actions';
import {
  AuthorizationSnapshot,
  CONFIGURABLE_PERMISSION_DEFAULTS,
  ConfigurablePermissionKey,
  EMPTY_AUTHORIZATION_SNAPSHOT,
  hasCapability,
} from '@/lib/role-permissions';

let currentSnapshot: AuthorizationSnapshot = { ...EMPTY_AUTHORIZATION_SNAPSHOT };
let syncPromise: Promise<AuthorizationSnapshot> | null = null;
let realtimeStarted = false;

const permissionsChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('volunteer_manager_permissions')
    : null;

function dispatchPermissionChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('permissions-changed', { detail: currentSnapshot }));
}

export function setAuthorizationSnapshot(snapshot: AuthorizationSnapshot) {
  currentSnapshot = snapshot;

  // Compatibility cache for pages that are still being migrated. These values
  // are never used by Server Actions to authorize a request.
  if (typeof window !== 'undefined') {
    localStorage.setItem('mock_role', snapshot.role);
    if (snapshot.committeeName) localStorage.setItem('mock_committee', snapshot.committeeName);
    else localStorage.removeItem('mock_committee');
    localStorage.setItem('authorization_snapshot', JSON.stringify(snapshot));
  }
  dispatchPermissionChange();
}

export function getAuthorizationSnapshotCache() {
  return currentSnapshot;
}

function startRealtimePermissionSync() {
  if (typeof window === 'undefined' || realtimeStarted) return;
  realtimeStarted = true;

  const supabase = createClient();
  supabase
    .channel('role_permissions_and_profile_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'system_settings' },
      () => void syncAllPermissionsFromDatabase(true)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      payload => {
        if (payload.new?.id === currentSnapshot.userId) {
          void syncAllPermissionsFromDatabase(true);
        }
      }
    )
    .subscribe();

  permissionsChannel?.addEventListener('message', () => {
    void syncAllPermissionsFromDatabase(true);
  });
}

export async function syncAllPermissionsFromDatabase(force = false): Promise<AuthorizationSnapshot> {
  startRealtimePermissionSync();
  if (syncPromise && !force) return syncPromise;

  syncPromise = getCurrentAuthorizationAction()
    .then(result => {
      if (result.success && result.snapshot) {
        setAuthorizationSnapshot(result.snapshot);
        return result.snapshot;
      }
      setAuthorizationSnapshot({ ...EMPTY_AUTHORIZATION_SNAPSHOT });
      return currentSnapshot;
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

export function notifyPermissionsChanged() {
  permissionsChannel?.postMessage({ refresh: true });
  void syncAllPermissionsFromDatabase(true);
}

export function getNormalizedRole(): 'Admin' | 'Editor' | 'Lector' {
  return currentSnapshot.role;
}

export function getSystemPermission(key: string, defaultValue = false): boolean {
  if (key in currentSnapshot.permissions) {
    return currentSnapshot.permissions[key as ConfigurablePermissionKey];
  }

  const legacyCapabilities: Record<string, () => boolean> = {
    allow_coordinator_dashboard: canViewDashboard,
    allow_coordinator_volunteers: canViewVolunteers,
    allow_coordinator_shift_edit: canEditShifts,
    allow_coordinator_whatsapp: canSendWhatsappMessages,
    allow_coordinator_reports: canViewReports,
    allow_coordinator_qr: canQrCheckin,
    allow_coordinator_import: canImportData,
    allow_coordinator_users: canManageUsers,
    allow_volunteer_view_volunteers: canViewVolunteers,
  };
  return legacyCapabilities[key]?.() ?? defaultValue;
}

/** @deprecated Permission writes must use updateRolePermissionAction. */
export function setSystemPermission(): void {
  throw new Error('Los permisos solo pueden modificarse mediante la acción segura de Administrador.');
}

export async function fetchSystemPermission(key: string, defaultValue = false): Promise<boolean> {
  await syncAllPermissionsFromDatabase();
  return getSystemPermission(key, defaultValue);
}

/** @deprecated Role comes from the authenticated database profile. */
export function setMockRole(): void {
  void syncAllPermissionsFromDatabase(true);
}

/** @deprecated Use resetRolePermissionsAction. */
export function resetAllPermissionsToDefault(): void {
  currentSnapshot = {
    ...currentSnapshot,
    permissions: { ...CONFIGURABLE_PERMISSION_DEFAULTS },
  };
  dispatchPermissionChange();
}

export function canViewDashboard() {
  return hasCapability(currentSnapshot, 'view_dashboard');
}

export function canViewSettings() {
  return hasCapability(currentSnapshot, 'view_settings');
}

export function canViewActivityLogs() {
  return hasCapability(currentSnapshot, 'view_activity_logs');
}

export function canEditShifts(targetCommitteeId?: string | null) {
  return hasCapability(currentSnapshot, 'reschedule_volunteer', targetCommitteeId);
}

export function canSendWhatsappMessages() {
  return hasCapability(currentSnapshot, 'view_notices');
}

export function canViewRequests() {
  return hasCapability(currentSnapshot, 'view_requests');
}

export function canViewReports() {
  return hasCapability(currentSnapshot, 'view_reports');
}

export function canViewGlobalReports() {
  return hasCapability(currentSnapshot, 'view_global_reports');
}

export function canViewVolunteers() {
  return hasCapability(currentSnapshot, 'view_volunteers');
}

export function canViewAllVolunteers() {
  return hasCapability(currentSnapshot, 'view_all_volunteers');
}

export function canViewVolunteerProfile(targetCommitteeId?: string | null) {
  return hasCapability(currentSnapshot, 'view_volunteer_profile', targetCommitteeId);
}

export function canEditVolunteerPersonalInfo(targetCommitteeId?: string | null) {
  return hasCapability(currentSnapshot, 'edit_volunteer_personal_info', targetCommitteeId);
}

export function canQrCheckin() {
  return hasCapability(currentSnapshot, 'scan_qr_attendance');
}

export function canImportData() {
  return hasCapability(currentSnapshot, 'import_volunteers');
}

export function canCreateVolunteer() {
  return hasCapability(currentSnapshot, 'create_volunteer');
}

export function canRegisterMissingAttendance() {
  return hasCapability(currentSnapshot, 'register_missing_attendance');
}

export function canCorrectAttendanceTimes() {
  return hasCapability(currentSnapshot, 'correct_attendance_times');
}

export function canArchiveVolunteer() {
  return hasCapability(currentSnapshot, 'archive_volunteer');
}

export function canManageOwnAreaCoverage() {
  return hasCapability(currentSnapshot, 'view_area_coverage', currentSnapshot.committeeId);
}

export function canManageUsers() {
  return hasCapability(currentSnapshot, 'manage_platform_users');
}

export const isCoordinatorShiftEditAllowed = canEditShifts;
export const setCoordinatorShiftEditAllowed = () => setSystemPermission();
export const fetchCoordinatorShiftEditAllowed = () => fetchSystemPermission('allow_coordinator_shift_edit', false);
export const isCoordinatorWhatsappAllowed = canSendWhatsappMessages;
export const setCoordinatorWhatsappAllowed = () => setSystemPermission();
export const fetchCoordinatorWhatsappAllowed = () => fetchSystemPermission('allow_coordinator_whatsapp', true);
export const isCoordinatorReportsAllowed = canViewReports;
export const setCoordinatorReportsAllowed = () => setSystemPermission();
export const fetchCoordinatorReportsAllowed = () => fetchSystemPermission('allow_coordinator_reports', true);
