/* eslint-disable @typescript-eslint/no-require-imports -- Local regression harness, no network writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const { getCommitteeCoverageSnapshot, getCoverageLevel } = jiti('./lib/shift-coverage');
const { getOperationalEventDays, formatDateShort, getAvailableShiftKeys } = jiti('./lib/dates');

function block(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing source block: ${start}`);
  return source.slice(from, to);
}

const dayKeys = getOperationalEventDays().map(formatDateShort);
const slots = dayKeys.flatMap(day => getAvailableShiftKeys(day).map(shift => [day, shift]));
const rows = Array.from({ length: 2156 }, (_, i) => ({
  id: String(i).padStart(5, '0'), volunteer_id: `vol-${i}`,
  day_key: slots[i % slots.length][0], shift_key: slots[i % slots.length][1],
  committee_id: 'guide', status: 'active', checked_out: false,
}));
function client(failSecondPage = false) {
  const fetchedRanges = [];
  const allRows = [...rows,
    { ...rows[0], id: 'archived', volunteer_id: 'archived', status: 'archived' },
    { ...rows[0], id: 'other', volunteer_id: 'other', committee_id: 'other' },
    { ...rows[0], id: 'outside', volunteer_id: 'outside', day_key: 'TEST_INSERT_RT' },
  ];
  return {
    fetchedRanges,
    from(table) {
      let filtered = table === 'shifts' ? allRows : ['T1', 'T2', 'T3', 'T4'].map(shift_key => ({ committee_id: 'guide', shift_key, required: 37 }));
      let ordered = false;
      const result = (from, to) => {
        if (table === 'shifts') {
          fetchedRanges.push([from, to]);
          assert(ordered, 'Pagination must have a stable order');
          if (failSecondPage && from >= 1000) return { data: null, error: { message: 'simulated network failure' } };
        }
        return { data: filtered.slice(from, to + 1), error: null };
      };
      return {
        select() { return this; },
        eq(column, value) { filtered = filtered.filter(row => row[column.split('.').pop()] === value); return this; },
        or(filter, options) {
          assert.equal(filter, 'status.is.null,status.neq.archived');
          assert.equal(options.referencedTable, 'volunteers');
          filtered = filtered.filter(row => row.status !== 'archived'); return this;
        },
        in(column, values) { filtered = filtered.filter(row => values.includes(row[column])); return this; },
        order(column) { assert.equal(column, 'id'); ordered = true; return this; },
        range(from, to) { return Promise.resolve(result(from, to)); },
        then(resolve, reject) { return Promise.resolve(result(0, 999)).then(resolve, reject); },
      };
    },
  };
}

async function verifyCoverage() {
  const db = client();
  const snapshot = await getCommitteeCoverageSnapshot(db, 'guide', dayKeys);
  assert.equal(snapshot.assignments.length, 2156);
  assert.equal(snapshot.slots.length, 61);
  assert.equal(db.fetchedRanges.length, 3);
  for (const slot of snapshot.slots) {
    assert.equal(slot.count, rows.filter(row => row.day_key === slot.dayKey && row.shift_key === slot.shiftKey).length);
    assert.equal(slot.required, 37);
  }
  await assert.rejects(getCommitteeCoverageSnapshot(client(true), 'guide', dayKeys), /simulated network failure/);
  assert.equal(getCoverageLevel(35, 37), 'deficit');
  assert.equal(getCoverageLevel(37, 37), 'at_requirement');
  assert.equal(getCoverageLevel(38, 37), 'covered');
  console.log('PASS: all 2,156 assignments across 61 slots, archive/committee/date filters, incomplete-load rejection and unchanged request levels');
}

async function verifySettingsSave() {
  const source = fs.readFileSync('app/(coordinator)/settings/page.tsx', 'utf8');
  const code = ts.transpile(block(source, '  const handleSaveRequirements =', '  const updateCapacity =') + '\nglobalThis.save = handleSaveRequirements;');
  for (const outcome of ['success', 'error', 'throw']) {
    const events = [], toasts = [];
    const ctx = {
      selectedConfigCommittees: ['Guía'], capacities: { T1: 37 },
      setIsSavingConfig: value => events.push(value),
      updateCommitteeRequirementsAction: async () => {
        if (outcome === 'throw') throw new Error('network');
        return outcome === 'success' ? { success: true } : { error: 'save failed' };
      },
      refresh: async force => { assert.equal(force, true); events.push('refresh'); },
      showToast: (message, type = 'success') => toasts.push({ message, type }),
      localStorage: { setItem() { assert.fail('Do not publish unconfirmed requirements'); } },
    };
    vm.runInNewContext(code, ctx);
    await ctx.save();
    assert.equal(events.at(-1), false);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, outcome === 'success' ? 'success' : 'error');
    assert.equal(events.includes('refresh'), outcome === 'success');
  }
  console.log('PASS: requirements refresh only after successful save; failures never report success');
}

function verifyAreaSnapshots() {
  const source = fs.readFileSync('app/(coordinator)/shifts/areas/CommitteeAreasClient.tsx', 'utf8');
  const code = ts.transpile(block(source, '  const [optimisticAreas,', '  const visibleAreas =') + '\nglobalThis.result = { effectiveData, setAreaOverrides };');
  let state;
  const render = data => {
    const ctx = { data, EMPTY_AREA_OVERRIDES: new Map(), useMemo: fn => fn(),
      useState(initial) {
        if (!state) state = initial;
        return [state, update => { state = typeof update === 'function' ? update(state) : update; }];
      },
    };
    vm.runInNewContext(code, ctx);
    return ctx.result;
  };
  const first = { assignments: [{ id: 's1', areaId: null }], areas: [{ id: 'a', assignedCount: 0 }, { id: 'b', assignedCount: 0 }] };
  render(first).setAreaOverrides(current => new Map(current).set('s1', 'a'));
  let visible = render(first).effectiveData;
  assert.equal(visible.assignments[0].areaId, 'a');
  assert.equal(visible.areas[0].assignedCount, 1);
  const newer = { ...first, assignments: [{ id: 's1', areaId: 'b' }] };
  visible = render(newer).effectiveData;
  assert.equal(visible.assignments[0].areaId, 'b');
  assert.equal(visible.areas[0].assignedCount, 0);
  assert.equal(visible.areas[1].assignedCount, 1);
  render(newer).setAreaOverrides(current => new Map(current).set('s1', null));
  visible = render(newer).effectiveData;
  assert.equal(visible.areas[1].assignedCount, 0);
  console.log('PASS: area counts follow assignments, optimistic updates expire with fresh server data');
}

(async () => {
  await verifyCoverage();
  await verifySettingsSave();
  verifyAreaSnapshots();
})().catch(error => { console.error(error); process.exitCode = 1; });
