/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS keeps this zero-config authorization check runnable with Node. */
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const {
  CONFIGURABLE_PERMISSION_DEFAULTS,
  ROLE_PERMISSION_KEYS,
  hasCapability,
} = jiti('./lib/role-permissions');

const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({ get: () => undefined });
const { getActivityLogs } = jiti('./app/actions/activity-actions');

function snapshot(overrides) {
  return {
    authenticated: true,
    userId: 'test-user',
    userType: 'profile',
    name: 'Test User',
    role: 'Editor',
    coordinatorType: 'committee',
    committeeId: 'committee-a',
    committeeName: 'Committee A',
    permissions: { ...CONFIGURABLE_PERMISSION_DEFAULTS },
    ...overrides,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const admin = snapshot({ role: 'Admin', coordinatorType: null, committeeId: null });
assert(hasCapability(admin, 'view_settings'), 'Admin puede abrir ajustes');
assert(hasCapability(admin, 'manage_permissions'), 'Admin puede administrar permisos');
assert(hasCapability(admin, 'view_activity_logs'), 'Admin puede consultar auditoria');

const restrictedAdmin = snapshot({
  role: 'Admin',
  coordinatorType: null,
  committeeId: null,
  permissions: {
    ...CONFIGURABLE_PERMISSION_DEFAULTS,
    [ROLE_PERMISSION_KEYS.admin.view_dashboard]: false,
  },
});
assert(!hasCapability(restrictedAdmin, 'view_dashboard'), 'Los permisos de Administrador también se pueden revocar');

const committeeCoordinator = snapshot({});
assert(hasCapability(committeeCoordinator, 'view_settings'), 'Coordinador de comite puede abrir ajustes');
assert(!hasCapability(committeeCoordinator, 'manage_permissions'), 'Coordinador de comite no administra permisos');
assert(!hasCapability(committeeCoordinator, 'view_activity_logs'), 'Coordinador de comite no consulta auditoria global');

const elevatedCommitteeCoordinator = snapshot({
  permissions: {
    ...CONFIGURABLE_PERMISSION_DEFAULTS,
    [ROLE_PERMISSION_KEYS.committee.manage_platform_users]: true,
  },
});
assert(hasCapability(elevatedCommitteeCoordinator, 'manage_platform_users'), 'Un permiso habilitado para Comité se aplica realmente');
assert(!hasCapability(committeeCoordinator, 'view_volunteer_profile', 'committee-b'), 'El alcance de Comité permanece limitado aunque el permiso esté activo');

const volunteer = snapshot({
  userType: 'volunteer',
  role: 'Lector',
  coordinatorType: null,
});
assert(!hasCapability(volunteer, 'view_settings'), 'Usuario sin permiso no puede abrir ajustes');
assert(!hasCapability(volunteer, 'manage_permissions'), 'Usuario sin permiso no administra permisos');
assert(!hasCapability(volunteer, 'view_activity_logs'), 'Usuario sin permiso no consulta auditoria');

getActivityLogs(500)
  .then((result) => {
    assert(!result.success && result.code === 'FORBIDDEN', 'La accion devuelve FORBIDDEN sin lanzar para un usuario sin permiso');
    assert(result.logs.length === 0, 'La accion no expone registros a un usuario sin permiso');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
