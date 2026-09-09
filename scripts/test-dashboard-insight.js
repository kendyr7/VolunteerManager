/* eslint-disable @typescript-eslint/no-require-imports -- Zero-config Node regression test. */
const assert = require('node:assert/strict');
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const operations = jiti('./lib/dashboard-insight-operations');
const insight = jiti('./lib/ai/dashboard-insight');
const insightTypes = jiti('./lib/dashboard-insight-types');

const beforeEvent = new Date('2026-09-09T18:00:00.000Z'); // 12:00 PM Guatemala
const actionable = operations.filterActionableCriticalShifts([
  { day: 'Sábado 5 de septiembre', shift: 'T1 (9:00 AM - 2:00 PM)', missing: 9 },
  { day: 'Jueves 10 de septiembre', shift: 'T2 (11:00 AM - 3:00 PM)', missing: 2 },
], beforeEvent);
assert.deepEqual(actionable.map(item => item.day), ['Jueves 10 de septiembre']);

const committeeByVolunteer = new Map([
  ['v1', 'Guía'],
  ['v2', 'Guía'],
  ['v3', 'Historia'],
]);
const assignments = ['v1', 'v2', 'v3'].map(volunteer_id => ({
  volunteer_id,
  day_key: 'jue 10',
  shift_key: 'T2',
}));
const noon = new Date('2026-09-10T18:00:00.000Z'); // 12:00 PM Guatemala
const late = operations.buildAttendanceAttention(
  assignments,
  { 'v3-jue 10-T2': true },
  committeeByVolunteer,
  new Set(['Guía', 'Historia']),
  noon
);
assert.equal(late.status, 'late');
assert.equal(late.count, 2);
assert.equal(late.minutesSinceStart, 60);
assert.equal(late.primaryCommittee, 'Guía');
assert.equal(late.affectedCommittees, 1);

const baseContext = {
  effectiveCommitteeScope: 'todos',
  canSeeGlobal: true,
  globalCoveragePercentage: 80,
  criticalShifts: actionable,
  areaCriticalShifts: [],
  openAttendanceSessions: 0,
  staleOpenAttendanceSessions: 0,
  attendanceAttention: late,
};
const adminBlueprint = insight.buildDashboardInsightBlueprint({ role: 'Admin' }, baseContext);
assert(adminBlueprint.highlights.some(item => item.id === 'personas_sin_entrada' && item.label === '2 personas'));
assert(adminBlueprint.highlights.some(item => item.id === 'comite_prioritario' && item.label === 'Guía'));
assert(adminBlueprint.highlights.some(item => item.id === 'alcance_asistencia' && item.label === '1 comité afectado'));

const technologyBlueprint = insight.buildDashboardInsightBlueprint(
  { role: 'Editor', coordinatorType: 'technology' },
  baseContext
);
assert(technologyBlueprint.template.includes('aún no registran entrada'));
assert(technologyBlueprint.highlights.some(item => item.id === 'tiempo_transcurrido' && item.label.includes('1 hora')));

const committeeContext = {
  ...baseContext,
  effectiveCommitteeScope: 'Guía',
  canSeeGlobal: false,
  attendanceAttention: null,
};
const committeeBlueprint = insight.buildDashboardInsightBlueprint(
  { role: 'Editor', coordinatorType: 'committee', committeeName: 'Guía' },
  committeeContext
);
assert(committeeBlueprint.highlights.some(item => item.label.includes('Jueves 10')));
assert(!committeeBlueprint.highlights.some(item => item.label.includes('5 de septiembre')));

assert(insightTypes.dashboardInsightsEqual(
  { ...adminBlueprint, generatedAt: '2026-09-10T18:00:00.000Z' },
  { ...adminBlueprint, generatedAt: '2026-09-10T18:01:00.000Z' }
));

console.log('PASS: insights discard expired shifts and detect current late attendance');
console.log('PASS: Admin, committee and technology roles receive scoped operational priorities');
