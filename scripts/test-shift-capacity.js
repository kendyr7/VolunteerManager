/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const capacity = jiti('./lib/shift-capacity');
const { normalizeSearch } = jiti('./lib/utils');
const source = fs.readFileSync('app/(coordinator)/shifts/page.tsx', 'utf8');

// Execute the actual page's filters, capacity totals, assignment selection and card colors.
function block(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing page block: ${start}`);
  return source.slice(from, to);
}
const compiled = ts.transpile([
  block('const getShiftColor =', 'const getCommitteeColor ='),
  block('  const scopedCommittees =', '  // Determinar si hay un único comité'),
  block('  const matchesFilters =', '  const filteredVolunteers ='),
  block('  const getAssignedVolunteers =', '  const handleStartEditProfile ='),
  'globalThis.result = { requiredByShift, getAssignedVolunteers, getShiftColor };',
].join('\n'));

const volunteers = Array.from({ length: 39 }, (_, i) => ({
  id: `guide-${i}`, name: `Persona ${i}`, committee: 'Guía', phone: '', stake: 'Norte', ward: 'Centro',
}));
// A text match in another committee must not inflate Guía's coverage.
volunteers.push({ id: 'other', name: 'Persona Guía', committee: 'Historia', phone: '', stake: '', ward: '' });
const counts = { T1: 35, T2: 29, T3: 37, T4: 39 };
const assignments = Object.fromEntries(Object.entries(counts).map(([shift, count]) => [shift, {
  Guía: volunteers.slice(0, count).map(v => v.id), Historia: ['other'],
}]));
function run(search, selected = [], requirements = 37, overrides = {}) {
  const context = {
    ...capacity, normalizeSearch, useMemo: fn => fn(), useCallback: fn => fn,
    committeesList: [{ name: 'Guía' }, { name: 'Historia' }],
    selectedCommittees: selected, appliedSearch: search,
    selectedStakes: [], selectedWards: [], currentRole: 'Admin', viewMode: 'turnos',
    committeeRequirements: {
      Guía: { T1: requirements, T2: requirements, T3: requirements, T4: requirements },
      Historia: { T1: 68, T2: 68, T3: 68, T4: 68 },
    },
    contextIndexedAssignments: { 'jue 10': assignments },
    volunteerMap: new Map(volunteers.map(v => [v.id, v])),
    // The same person in both data sources must still be counted once.
    shiftDataIndex: { volunteerIdsByShift: new Map([['jue 10|T1', ['guide-0', 'missing-volunteer']]]) },
    getShiftRecord: () => undefined, completedShiftsMap: {}, contextCheckedInMap: {},
    localStorage: { getItem: () => null }, ...overrides,
  };
  vm.runInNewContext(compiled, context);
  return context.result;
}

for (const query of ['Guía', 'guia', ' GUÍA ', 'gui']) {
  const page = run(query);
  for (const [shift, expected] of Object.entries(counts)) {
    assert.equal(page.getAssignedVolunteers('jue 10', shift).length, expected);
    assert.equal(page.requiredByShift[shift], 37);
  }
  assert.match(page.getShiftColor('T1', 35, page.requiredByShift.T1).card, /amber/);
  assert.match(page.getShiftColor('T3', 37, page.requiredByShift.T3).card, /emerald/);
}
assert.equal(run('', ['Guía']).requiredByShift.T1, 37);
assert.equal(run('').requiredByShift.T1, 105);
assert.equal(run('').getAssignedVolunteers('jue 10', 'T1').length, 36);
assert.equal(run('Guia, Centro').getAssignedVolunteers('jue 10', 'T1').length, 35);
assert.equal(run('Guia', ['Historia']).getAssignedVolunteers('jue 10', 'T1').length, 0);
assert.equal(run('Persona 0', ['Guía']).getAssignedVolunteers('jue 10', 'T1').length, 1);
assert.equal(run('Guia', [], 40).requiredByShift.T1, 40);
assert.equal(run('Guia', [], 0).requiredByShift.T1, 0);
const names = ['Facilidades Físicas', 'Guía', 'Historia', 'Parqueo y Transporte', 'Recepción', 'Seguridad', 'Tecnología', 'Traducción'];
for (const [query, committee] of [
  ['Fisicas', 'Facilidades Físicas'], ['Parqueo', 'Parqueo y Transporte'],
  ['Recep', 'Recepción'], ['Segur', 'Seguridad'], ['Tecnol', 'Tecnología'], ['Trad', 'Traducción'],
]) {
  assert.deepEqual(capacity.getShiftCommitteeScope(names, [], query), [committee]);
}
assert.deepEqual(capacity.getShiftCommitteeScope(names, [], 'Parqueo, Transporte'), ['Parqueo y Transporte']);
assert.equal(run('Guia', [], 37, {
  viewMode: 'active', contextCheckedInMap: { 'guide-0-jue 10-T1': true },
}).getAssignedVolunteers('jue 10', 'T1').length, 1);

for (const [assigned, required, expected] of [
  [0, 0, 'unconfigured'], [5, 0, 'unconfigured'], [0, 37, 'critical'],
  [69, 100, 'critical'], [70, 100, 'risk'], [99, 100, 'risk'],
  [100, 100, 'covered'], [101, 100, 'covered'], [29, 37, 'risk'],
]) {
  assert.equal(capacity.getShiftCapacityStatus(assigned, required), expected);
}
console.log('PASS: Guía counts and requirements, search/committee scope, deduplication, live attendance, refreshed targets and heatmap color thresholds');
