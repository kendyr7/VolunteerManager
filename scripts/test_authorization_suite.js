/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is required to mock next/headers before loading Server Actions. */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Intentionally read-only: this suite verifies current permissions without
// toggling production settings or changing volunteer data.
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });

let currentSessionToken = null;
const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({
  get: (name) =>
    name === 'session' && currentSessionToken
      ? { value: currentSessionToken }
      : undefined,
});

const { createClient } = require('@supabase/supabase-js');
const { signSession } = jiti('./lib/auth');
const { generateEntryPassToken } = jiti('./app/actions/attendance');
const { getDashboardOperationalDataAction } = jiti('./app/actions/dashboard');
const { getAuthorizationSnapshot } = jiti('./lib/authorization');
const { getActiveEventDays } = jiti('./lib/dates');
const { hasCapability, CONFIGURABLE_PERMISSION_DEFAULTS } = jiti('./lib/role-permissions');

let testCount = 0;
let passCount = 0;

function assert(condition, description) {
  testCount++;
  if (!condition) throw new Error(`[Test ${testCount}] ${description}`);
  passCount++;
  console.log(`✅ [Test ${testCount}] ${description}`);
}

function permissionValue(rows, key) {
  const row = rows.find((item) => item.key === key);
  return row ? row.value === 'true' : CONFIGURABLE_PERMISSION_DEFAULTS[key];
}

async function qrResultMatches(volunteerId, expectedAllowed) {
  try {
    const result = await generateEntryPassToken(volunteerId);
    return expectedAllowed && Boolean(result?.volunteerId === volunteerId && result?.signature);
  } catch {
    return !expectedAllowed;
  }
}

async function runWithoutExpectedErrorLog(callback) {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = originalConsoleError;
  }
}

async function runAuthorizationSuite() {
  console.log('=======================================================================');
  console.log('  READ-ONLY AUTHORIZATION & SERVER ACTIONS VERIFICATION SUITE');
  console.log('=======================================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [volunteersResult, profilesResult, settingsResult, committeesResult, requirementsResult] = await Promise.all([
    supabase
      .from('volunteers')
      .select('id, first_name, last_name, committee_id, status, committees(id, name)')
      .neq('status', 'archived')
      .order('id', { ascending: true })
      .limit(2),
    supabase
      .from('profiles')
      .select('id, full_name, role, coordinator_type, committee_id, status, committees(name)')
      .neq('status', 'archived')
      .order('id', { ascending: true }),
    supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'role.technology.scan_qr_attendance',
        'role.technology.view_global_reports',
        'role.committee.view_global_reports',
      ]),
    supabase
      .from('committees')
      .select('id, status')
      .or('status.is.null,status.neq.archived'),
    supabase
      .from('committee_shift_requirements')
      .select('committee_id, shift_key, required'),
  ]);

  for (const [label, result] of [
    ['volunteers', volunteersResult],
    ['profiles', profilesResult],
    ['system_settings', settingsResult],
    ['committees', committeesResult],
    ['committee_shift_requirements', requirementsResult],
  ]) {
    if (result.error) throw new Error(`Error reading ${label}: ${result.error.message}`);
  }

  const testVolunteers = volunteersResult.data || [];
  const profiles = profilesResult.data || [];
  const settings = settingsResult.data || [];
  if (testVolunteers.length < 2) throw new Error('At least two active volunteers are required.');

  const adminProfile = profiles.find((profile) => profile.role === 'Admin');
  const techProfile = profiles.find((profile) => profile.coordinator_type === 'technology');
  const committeeProfile = profiles.find((profile) => profile.coordinator_type === 'committee');
  if (!adminProfile || !techProfile || !committeeProfile) {
    throw new Error('Active Admin, Technology, and Committee profiles are required.');
  }

  const [volunteerOne, volunteerTwo] = testVolunteers;
  const techQrEnabled = permissionValue(settings, 'role.technology.scan_qr_attendance');
  const techGlobalReportsEnabled = permissionValue(settings, 'role.technology.view_global_reports');
  const committeeGlobalReportsEnabled = permissionValue(settings, 'role.committee.view_global_reports');
  console.log(`[FIXTURES] 2 volunteers and ${profiles.length} platform profiles loaded without printing PII.`);
  console.log(
    `[SETTINGS] Technology QR=${techQrEnabled}; Technology global reports=${techGlobalReportsEnabled}; ` +
      `Committee global reports=${committeeGlobalReportsEnabled}. No values will be changed.\n`
  );

  currentSessionToken = signSession({
    userId: adminProfile.id,
    userType: 'profile',
    role: 'Admin',
    committee: '',
    userName: adminProfile.full_name,
  });
  const adminAuthorization = await getAuthorizationSnapshot();
  assert(
    adminAuthorization.role === 'Admin' && hasCapability(adminAuthorization, 'manage_permissions'),
    'Real Admin profile has manage_permissions'
  );
  assert(
    hasCapability(adminAuthorization, 'manage_committee_areas', 'any-committee'),
    'Real Admin profile can manage areas across committees'
  );
  assert(
    hasCapability(adminAuthorization, 'assign_volunteer_areas', 'any-committee'),
    'Real Admin profile can assign volunteer areas across committees'
  );

  currentSessionToken = signSession({
    userId: techProfile.id,
    userType: 'profile',
    role: 'Editor',
    committee: techProfile.committees?.name || '',
    userName: techProfile.full_name,
  });
  const technologyAuthorization = await getAuthorizationSnapshot();
  assert(
    technologyAuthorization.role === 'Editor' && !hasCapability(technologyAuthorization, 'manage_permissions'),
    'Real Technology Editor does not have manage_permissions'
  );

  currentSessionToken = signSession({
    userId: committeeProfile.id,
    userType: 'profile',
    role: 'Editor',
    committee: committeeProfile.committees?.name || '',
    userName: committeeProfile.full_name,
  });
  const committeeAuthorization = await getAuthorizationSnapshot();
  assert(
    committeeAuthorization.role === 'Editor' && !hasCapability(committeeAuthorization, 'manage_permissions'),
    'Real Committee Editor does not have manage_permissions'
  );

  currentSessionToken = null;
  assert(await qrResultMatches(volunteerOne.id, false), 'Unauthenticated QR request is rejected');

  currentSessionToken = signSession({
    userId: volunteerOne.id,
    userType: 'volunteer',
    role: 'Lector',
    committee: volunteerOne.committees?.name || '',
    userName: `${volunteerOne.first_name} ${volunteerOne.last_name}`,
  });
  const volunteerAuthorization = await getAuthorizationSnapshot();
  assert(
    volunteerAuthorization.role === 'Lector' && !hasCapability(volunteerAuthorization, 'manage_permissions'),
    'Real Volunteer/Lector does not have manage_permissions'
  );
  assert(
    !hasCapability(volunteerAuthorization, 'manage_committee_areas', volunteerAuthorization.committeeId),
    'Real Volunteer/Lector cannot manage committee areas'
  );
  assert(await qrResultMatches(volunteerOne.id, true), 'Volunteer can generate their own QR pass');
  assert(await qrResultMatches(volunteerTwo.id, false), 'Volunteer cannot generate another volunteer QR pass');

  currentSessionToken = signSession({
    userId: adminProfile.id,
    userType: 'profile',
    role: 'Admin',
    committee: '',
    userName: adminProfile.full_name,
  });
  assert(await qrResultMatches(volunteerOne.id, true), 'Admin can generate any volunteer QR pass');

  currentSessionToken = signSession({
    userId: committeeProfile.id,
    userType: 'profile',
    role: 'Editor',
    committee: committeeProfile.committees?.name || '',
    userName: committeeProfile.full_name,
  });
  assert(await qrResultMatches(volunteerOne.id, false), 'Committee coordinator cannot generate volunteer QR passes');

  currentSessionToken = signSession({
    userId: techProfile.id,
    userType: 'profile',
    role: 'Editor',
    committee: '',
    userName: techProfile.full_name,
  });
  assert(
    await qrResultMatches(volunteerOne.id, techQrEnabled),
    `Technology QR action matches the configured permission (${techQrEnabled})`
  );

  const techDashboard = await getDashboardOperationalDataAction('todos');
  assert(
    Boolean(techDashboard.data && techDashboard.data.canSeeGlobal === techGlobalReportsEnabled),
    `Technology dashboard scope matches the configured permission (${techGlobalReportsEnabled})`
  );

  currentSessionToken = null;
  const unauthenticatedDashboard = await runWithoutExpectedErrorLog(() =>
    getDashboardOperationalDataAction('todos')
  );
  assert(
    Boolean(unauthenticatedDashboard.error || !unauthenticatedDashboard.data),
    'Unauthenticated dashboard request is rejected'
  );

  currentSessionToken = signSession({
    userId: adminProfile.id,
    userType: 'profile',
    role: 'Admin',
    committee: '',
    userName: adminProfile.full_name,
  });
  const adminDashboard = await getDashboardOperationalDataAction('todos');
  assert(Boolean(adminDashboard.data?.canSeeGlobal), 'Admin receives global dashboard data');

  currentSessionToken = signSession({
    userId: committeeProfile.id,
    userType: 'profile',
    role: 'Editor',
    committee: committeeProfile.committees?.name || '',
    userName: committeeProfile.full_name,
  });
  const committeeDashboard = await getDashboardOperationalDataAction('todos');
  const committeeName = committeeProfile.committees?.name || '';
  assert(
    Boolean(
      committeeDashboard.data &&
      committeeDashboard.data.canSeeGlobal === committeeGlobalReportsEnabled &&
      (committeeGlobalReportsEnabled || committeeDashboard.data.effectiveCommitteeScope === committeeName)
    ),
    `Committee coordinator dashboard matches the configured global permission (${committeeGlobalReportsEnabled})`
  );

  const activeCommitteeIds = new Set((committeesResult.data || []).map((committee) => committee.id));
  const requirementByCommitteeShift = new Map();
  for (const requirement of requirementsResult.data || []) {
    if (!activeCommitteeIds.has(requirement.committee_id)) continue;
    requirementByCommitteeShift.set(
      `${requirement.committee_id}-${requirement.shift_key}`,
      Number(requirement.required || 0)
    );
  }
  const requiredPerEventDay = [...requirementByCommitteeShift.values()].reduce((total, required) => total + required, 0);
  const expectedTarget = requiredPerEventDay * getActiveEventDays().length;
  assert(
    adminDashboard.data?.globalStats.targetVolunteers === expectedTarget,
    'Dashboard targetVolunteers exactly equals requirements across active event days'
  );
  assert((adminDashboard.data?.globalStats.totalAssigned || 0) > 0, 'Dashboard includes active-day assignments');
  assert(
    (adminDashboard.data?.globalStats.attendanceRate || 0) >= 0 &&
      (adminDashboard.data?.globalStats.attendanceRate || 0) <= 100,
    'Dashboard attendance rate remains within 0–100%'
  );

  const makeSnapshot = (data) => ({
    authenticated: true,
    userId: 'test-user',
    userType: 'profile',
    name: 'Test',
    role: 'Editor',
    coordinatorType: 'technology',
    committeeId: null,
    committeeName: null,
    permissions: { ...CONFIGURABLE_PERMISSION_DEFAULTS },
    ...data,
  });
  const techSnapshot = makeSnapshot({
    permissions: {
      ...CONFIGURABLE_PERMISSION_DEFAULTS,
      'role.technology.scan_qr_attendance': true,
      'role.technology.view_global_reports': true,
      'role.technology.view_volunteers': true,
    },
  });
  assert(hasCapability(techSnapshot, 'scan_qr_attendance'), 'Technology QR capability resolves true');
  assert(hasCapability(techSnapshot, 'view_global_reports'), 'Technology global reports capability resolves true');
  assert(hasCapability(techSnapshot, 'view_all_volunteers'), 'Technology volunteer access resolves globally');
  assert(!hasCapability(techSnapshot, 'view_area_coverage', 'committee-a'), 'Technology cannot view committee area coverage');
  const techAreaSnapshot = {
    ...techSnapshot,
    committeeId: 'committee-a',
    permissions: {
      ...techSnapshot.permissions,
      'role.technology.manage_area_coverage': true,
    },
  };
  assert(
    hasCapability(techAreaSnapshot, 'view_area_coverage', 'committee-a'),
    'Technology can view area coverage for its committee when explicitly enabled'
  );
  assert(
    hasCapability(techAreaSnapshot, 'assign_volunteer_areas', 'committee-a'),
    'Technology can assign areas for its committee when explicitly enabled'
  );
  assert(
    !hasCapability(techAreaSnapshot, 'manage_committee_areas', 'committee-b'),
    'Technology cannot manage areas for another committee'
  );
  assert(
    !hasCapability(techAreaSnapshot, 'manage_area_requirements'),
    'Technology area management requires an explicit committee scope'
  );

  const committeeSnapshot = makeSnapshot({
    coordinatorType: 'committee',
    committeeId: 'committee-a',
    committeeName: 'Committee A',
  });
  assert(
    hasCapability(committeeSnapshot, 'view_area_coverage', 'committee-a'),
    'Committee coordinator can view area coverage for their own committee'
  );
  assert(
    hasCapability(committeeSnapshot, 'manage_committee_areas', 'committee-a'),
    'Committee coordinator can manage areas for their own committee'
  );
  assert(
    hasCapability(committeeSnapshot, 'assign_volunteer_areas', 'committee-a'),
    'Committee coordinator can assign areas in their own committee'
  );
  assert(
    !hasCapability(committeeSnapshot, 'assign_volunteer_areas', 'committee-b'),
    'Committee coordinator cannot assign areas in another committee'
  );
  assert(
    !hasCapability(committeeSnapshot, 'manage_committee_areas', 'committee-b'),
    'Committee coordinator cannot manage areas for another committee'
  );
  assert(
    !hasCapability(committeeSnapshot, 'manage_committee_areas'),
    'Committee area mutations require an explicit committee scope'
  );

  const techNoQr = makeSnapshot({
    permissions: { ...techSnapshot.permissions, 'role.technology.scan_qr_attendance': false },
  });
  assert(!hasCapability(techNoQr, 'scan_qr_attendance'), 'Disabled Technology QR capability resolves false');

  const techNoReports = makeSnapshot({
    permissions: { ...techSnapshot.permissions, 'role.technology.view_global_reports': false },
  });
  assert(!hasCapability(techNoReports, 'view_global_reports'), 'Disabled Technology global reports resolves false');

  const techNoVolunteers = makeSnapshot({
    permissions: { ...techSnapshot.permissions, 'role.technology.view_volunteers': false },
  });
  assert(!hasCapability(techNoVolunteers, 'view_volunteers'), 'Disabled Technology volunteer access resolves false');
  assert(!hasCapability(techNoVolunteers, 'view_all_volunteers'), 'Disabled Technology access cannot view all volunteers');
  assert(hasCapability(techNoVolunteers, 'view_global_reports'), 'Aggregate reports remain independent from volunteer profiles');

  const techNoDashboard = makeSnapshot({
    permissions: { ...techSnapshot.permissions, 'role.technology.view_dashboard': false },
  });
  assert(!hasCapability(techNoDashboard, 'view_dashboard'), 'Disabled Technology dashboard capability resolves false');

  const unauthenticatedSnapshot = {
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
  assert(!hasCapability(unauthenticatedSnapshot, 'view_volunteers'), 'Unauthenticated volunteer access resolves false');
  assert(!hasCapability(unauthenticatedSnapshot, 'view_all_volunteers'), 'Unauthenticated global volunteer access resolves false');
  assert(!hasCapability(unauthenticatedSnapshot, 'view_global_reports'), 'Unauthenticated global reports resolves false');
  assert(!hasCapability(unauthenticatedSnapshot, 'scan_qr_attendance'), 'Unauthenticated QR capability resolves false');

  console.log(`\n🎉 ALL ${passCount} OF ${testCount} READ-ONLY TESTS PASSED.`);
}

runAuthorizationSuite().catch((error) => {
  console.error(`❌ Authorization suite failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
