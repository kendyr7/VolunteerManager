// Exercise the provider's real refresh callback with controlled async responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const file = 'lib/coordinator-data-context.tsx';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fetchData') initializer = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(initializer);
let authenticated = false;
let reads = 0;
let release;
let gate = Promise.resolve();
const noop = () => {};
const query = { select() { return this; }, or: async () => ({ data: [] }) };
const bindings = {
  Date, Promise, Set, JSON, console, useCallback: callback => callback,
  getAuthScope: () => ({ authenticated, canViewAll: true, committeeId: null, cacheKey: String(authenticated) }),
  lastCacheKeyRef: { current: '' }, lastFetchedAtRef: { current: 0 },
  fetchPromiseRef: { current: null }, queuedFetchPromiseRef: { current: null },
  STALE_TIME_MS: 60000, SAFE_VOLUNTEER_FIELDS: 'id', OPERATIONAL_EVENT_DAY_KEYS: ['lun 14'],
  setLoading: noop, setIsRefreshing: noop, setRawVolunteers: noop, setCommitteesList: noop,
  setShiftsData: noop, setSessionsData: noop, setRequirementsByCommittee: noop,
  useVolunteerStore: { getState: () => ({ setInitialVolunteers: noop, setInitialShifts: noop }) },
  supabase: { from: () => query }, fetchAllRowsStrict: async () => [],
  withShiftAreaDetails: value => value, parseRequirementsData: () => ({}), localStorage: { setItem: noop },
  require: name => {
    assert.equal(name, '@/app/actions/attendance');
    return { getAttendanceSessionsAction: async () => { reads++; await gate; return []; } };
  },
};
const context = vm.createContext(bindings);
const code = ts.transpileModule(`globalThis.fetchData = ${initializer.getText(source)};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInContext(code, context);
(async () => {
  await context.fetchData();
  assert.equal(bindings.fetchPromiseRef.current, null, 'Unauthenticated startup must clear the in-flight promise');
  authenticated = true;
  gate = new Promise(resolve => { release = resolve; });
  const initial = context.fetchData();
  // Wait until the mocked session read reaches the gate.
  for (let i = 0; i < 10 && reads === 0; i++) await Promise.resolve();
  assert.equal(reads, 1);
  const burst = Array.from({ length: 20 }, () => context.fetchData(true));
  release();
  await Promise.all([initial, ...burst]);
  assert.equal(reads, 2, 'A burst must cause exactly one follow-up snapshot');
  assert.equal(bindings.fetchPromiseRef.current, null);
  assert.equal(bindings.queuedFetchPromiseRef.current, null);
  await context.fetchData();
  assert.equal(reads, 2, 'Fresh data is reused');
  await context.fetchData(true);
  assert.equal(reads, 3, 'An explicit refresh after completion still reloads');
  console.log('PASS startup, 20 simultaneous invalidations, follow-up snapshot and fresh cache');
})().catch(error => { console.error(error); process.exitCode = 1; });
