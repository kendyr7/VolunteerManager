import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  AuthorizationSnapshot,
  Capability,
  CONFIGURABLE_PERMISSION_DEFAULTS,
  CONFIGURABLE_PERMISSION_KEYS,
  ConfigurablePermissionKey,
  EMPTY_AUTHORIZATION_SNAPSHOT,
  LEGACY_PERMISSION_FALLBACKS,
  hasCapability,
  normalizeAppRole,
  normalizeCoordinatorType,
} from '@/lib/role-permissions';

export class AuthorizationError extends Error {
  constructor(message = 'No tienes permiso para realizar esta acción.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

async function loadConfiguredPermissions(): Promise<Record<ConfigurablePermissionKey, boolean>> {
  const permissions = { ...CONFIGURABLE_PERMISSION_DEFAULTS };
  const legacyKeys = [...new Set(Object.values(LEGACY_PERMISSION_FALLBACKS))];
  const supabase = await getAdminSupabase();
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [...CONFIGURABLE_PERMISSION_KEYS, ...legacyKeys]);

  if (error) {
    console.error('[AUTHORIZATION] Could not load role permissions:', error.message);
    return permissions;
  }

  const savedValues = new Map((data || []).map(row => [row.key, row.value === 'true']));
  for (const row of data || []) {
    if (CONFIGURABLE_PERMISSION_KEYS.includes(row.key as ConfigurablePermissionKey)) {
      permissions[row.key as ConfigurablePermissionKey] = row.value === 'true';
    }
  }
  for (const [key, legacyKey] of Object.entries(LEGACY_PERMISSION_FALLBACKS)) {
    if (!legacyKey || savedValues.has(key)) continue;
    const legacyValue = savedValues.get(legacyKey);
    if (legacyValue !== undefined) permissions[key as ConfigurablePermissionKey] = legacyValue;
  }
  return permissions;
}

export async function getAuthorizationSnapshot(): Promise<AuthorizationSnapshot> {
  const sessionToken = (await cookies()).get('session')?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;
  if (!session?.userId) return { ...EMPTY_AUTHORIZATION_SNAPSHOT };

  const supabase = await getAdminSupabase();
  const permissionsPromise = loadConfiguredPermissions();

  if (session.userType === 'volunteer') {
    const { data: volunteer, error } = await supabase
      .from('volunteers')
      .select('id, first_name, last_name, committee_id, status, committees(name)')
      .eq('id', session.userId)
      .maybeSingle();

    if (error || !volunteer || volunteer.status === 'archived') {
      return { ...EMPTY_AUTHORIZATION_SNAPSHOT };
    }

    const permissions = await permissionsPromise;
    return {
      authenticated: true,
      userId: volunteer.id,
      userType: 'volunteer',
      name: `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.trim(),
      role: 'Lector',
      coordinatorType: null,
      committeeId: volunteer.committee_id || null,
      committeeName: (volunteer.committees as { name?: string } | null)?.name || null,
      permissions,
    };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, coordinator_type, committee_id, status, committees(name)')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !profile || profile.status === 'archived') {
    return { ...EMPTY_AUTHORIZATION_SNAPSHOT };
  }

  const role = normalizeAppRole(profile.role);
  const coordinatorType = role === 'Editor'
    ? (normalizeCoordinatorType(profile.coordinator_type) || 'committee')
    : null;
  const permissions = await permissionsPromise;

  return {
    authenticated: true,
    userId: profile.id,
    userType: 'profile',
    name: profile.full_name || '',
    role,
    coordinatorType,
    committeeId: profile.committee_id || null,
    committeeName: (profile.committees as { name?: string } | null)?.name || null,
    permissions,
  };
}

export async function requireAuthenticated(): Promise<AuthorizationSnapshot> {
  const snapshot = await getAuthorizationSnapshot();
  if (!snapshot.authenticated || !snapshot.userId) {
    throw new AuthorizationError('Tu sesión no es válida. Inicia sesión nuevamente.');
  }
  return snapshot;
}

export async function requireCapability(
  capability: Capability,
  targetCommitteeId?: string | null
): Promise<AuthorizationSnapshot> {
  const snapshot = await requireAuthenticated();
  if (!hasCapability(snapshot, capability, targetCommitteeId)) {
    throw new AuthorizationError();
  }
  return snapshot;
}

export async function getVolunteerCommitteeId(volunteerId: string): Promise<string | null> {
  const supabase = await getAdminSupabase();
  const { data } = await supabase
    .from('volunteers')
    .select('committee_id')
    .eq('id', volunteerId)
    .maybeSingle();
  return data?.committee_id || null;
}

export async function requireVolunteerCapability(
  capability: Capability,
  volunteerId: string
): Promise<AuthorizationSnapshot> {
  const committeeId = await getVolunteerCommitteeId(volunteerId);
  return requireCapability(capability, committeeId);
}

export async function requireVolunteerSelfOrCapability(
  capability: Capability,
  volunteerId: string
): Promise<AuthorizationSnapshot> {
  const snapshot = await requireAuthenticated();
  if (snapshot.userType === 'volunteer' && snapshot.userId === volunteerId) return snapshot;
  const committeeId = await getVolunteerCommitteeId(volunteerId);
  if (!hasCapability(snapshot, capability, committeeId)) throw new AuthorizationError();
  return snapshot;
}
