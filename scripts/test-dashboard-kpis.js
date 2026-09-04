/* eslint-disable @typescript-eslint/no-require-imports -- Zero-config Node regression test. */
/* A small hook harness exercises the actual dashboard without a DOM or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jiti = require('jiti')(process.cwd(), { alias: { '@': process.cwd() } });
const roles = jiti('./lib/role-permissions');
const scope = jiti('./lib/dashboard-scope');
const cache = jiti('./lib/dashboard-session-cache');

const admin = { ...roles.EMPTY_AUTHORIZATION_SNAPSHOT, authenticated: true,
  userId: 'admin', userType: 'profile', role: 'Admin' };
const technology = { ...admin, userId: 'technology', role: 'Editor', coordinatorType: 'technology' };
const committee = { ...technology, userId: 'committee', coordinatorType: 'committee',
  committeeId: 'a', committeeName: 'Committee A' };
let authorization = technology;
function data(profile = authorization, target = 'todos', coverage = 84) {
  return { authorizationKey: scope.getDashboardAuthorizationKey(profile),
    canSeeGlobal: roles.hasCapability(profile, 'view_global_reports'), effectiveCommitteeScope: target,
    heatmapMatrix: [], volsPerDay: {}, shiftsPerDay: {}, totalVolsWithShifts: 0,
    committeeStatus: [], criticalShifts: [], globalStats: {
      totalRecruited: 1, targetVolunteers: 100, recruitmentPercentage: 1,
      globalCoveragePercentage: coverage, criticalAlerts: 0, attendanceRate: 0,
      checkedInCount: 0, totalAssigned: 84,
    } };
}
const prepared = { version: 1, data: data(), includeSimulation: false, insight: null,
  preparedAt: new Date().toISOString() };
assert(cache.preparedDashboardMatches(prepared, 'all', false, scope.getDashboardAuthorizationKey(technology)));
assert(!cache.preparedDashboardMatches(prepared, 'todos', false, scope.getDashboardAuthorizationKey(admin)));
assert(!cache.preparedDashboardMatches(prepared, 'todos', true, scope.getDashboardAuthorizationKey(technology)));
assert(!cache.preparedDashboardMatches(prepared, 'Committee A', false, scope.getDashboardAuthorizationKey(technology)));
assert(!cache.preparedDashboardMatches({ ...prepared, data: { ...prepared.data, authorizationKey: undefined } },
  'todos', false, scope.getDashboardAuthorizationKey(technology)));
const scopedPrepared = { ...prepared, data: data(committee, 'Committee A') };
assert(!cache.preparedDashboardMatches(scopedPrepared, 'todos', false, scope.getDashboardAuthorizationKey(committee)));
assert(cache.preparedDashboardMatches(scopedPrepared, 'Committee A', false, scope.getDashboardAuthorizationKey(committee)));
console.log('PASS: cached data is scoped to identity, permissions, committee and simulation');

let context = { rawVolunteers: [], committeesList: [], shiftsData: [], globalShifts: {},
  sessionsData: [], requirementsByCommittee: {}, loading: true };
let hooks = [], cursor = 0, effects = [], dirty = true, tree;
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) {
    const i = cursor++;
    if (!hooks[i]) hooks[i] = { value: typeof initial === 'function' ? initial() : initial };
    return [hooks[i].value, value => {
      const next = typeof value === 'function' ? value(hooks[i].value) : value;
      if (!Object.is(next, hooks[i].value)) { hooks[i].value = next; dirty = true; }
    }];
  },
  useRef(initial) {
    const i = cursor++;
    return (hooks[i] ||= { current: initial });
  },
  useMemo(fn, deps) {
    const i = cursor++;
    if (!hooks[i] || !equalDeps(hooks[i].deps, deps)) hooks[i] = { value: fn(), deps };
    return hooks[i].value;
  },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!hooks[i] || !equalDeps(hooks[i].deps, deps)) {
      const prior = hooks[i];
      hooks[i] = { deps };
      effects.push(() => { prior?.cleanup?.(); hooks[i].cleanup = fn(); });
    }
  },
};
const listeners = new Map(), timers = new Map();
let timerId = 0;
const storage = { getItem: () => null, setItem() {} };
const windowMock = { localStorage: storage, location: { search: '' }, queueMicrotask,
  addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  setInterval() { return ++timerId; }, clearInterval() {},
};
const requests = [];
const action = (target, simulation, generateInsight, mode) => new Promise(resolve => requests.push({ target, simulation, generateInsight, mode, resolve }));
const query = { select() { return this; }, eq() { return this; }, order: async () => ({ data: [] }) };
const supabase = { from: () => query };
const components = new Proxy({}, { get: (_, name) => String(name) });
const moduleMocks = {
  react,
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
  'next/navigation': { useRouter: () => ({}), useSearchParams: () => ({ get: () => null }) },
  'next/link': { default: 'a' },
  'framer-motion': { motion: components, AnimatePresence: 'presence', useReducedMotion: () => true },
  '@/lib/supabase/client': { createClient: () => supabase },
  '@/lib/coordinator-data-context': { useCoordinatorData: () => context },
  '@/lib/permissions': { canViewGlobalReports: () => roles.hasCapability(authorization, 'view_global_reports'),
    getAuthorizationSnapshotCache: () => authorization, syncAllPermissionsFromDatabase: async () => authorization },
  '@/lib/role-permissions': roles,
  '@/lib/dashboard-scope': scope,
  '@/lib/dashboard-session-cache': { ...cache, readPreparedDashboardSession: () => prepared, writePreparedDashboardSession() {} },
  '@/app/actions/dashboard': { getDashboardOperationalDataAction: action },
  '@/lib/dates': jiti('./lib/dates'),
  '@/lib/shift-capacity': jiti('./lib/shift-capacity'),
  '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
};
const source = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, {
  exports: exportsObject, require: name => {
    if (moduleMocks[name]) return moduleMocks[name];
    if (name.startsWith('@/components/')) return components;
    throw new Error(`Unexpected dependency: ${name}`);
  }, window: windowMock, localStorage: storage,
  document: { visibilityState: 'visible' }, console, URLSearchParams,
  setInterval: windowMock.setInterval, clearInterval: windowMock.clearInterval,
});
async function settle() {
  for (let n = 0; n < 20; n++) {
    if (dirty) { dirty = false; cursor = 0; tree = exportsObject.default(); }
    const pending = effects; effects = []; pending.forEach(fn => fn());
    await Promise.resolve();
    if (n >= 10 && !dirty && !effects.length) return;
  }
  throw new Error('Dashboard did not settle');
}
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
}
function allNodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(allNodes);
  return [node, ...allNodes(node.props?.children)];
}
function hasCoverage(value) { return textOf(tree).includes(`${value} %`); }
async function run() {
  await settle();
  assert(hasCoverage(84), 'prepared server percentage is immediately visible');
  context = { ...context, loading: false, rawVolunteers: [{ id: 'v1', committees: { name: 'Committee A' } }],
    committeesList: [{ id: 'a', name: 'Committee A' }], requirementsByCommittee: { 'Committee A': { T1: 1 } } };
  dirty = true; await settle();
  assert(hasCoverage(84), 'partial browser rows must not replace server KPI when loading finishes');
  [...timers.values()].forEach(fn => fn()); timers.clear();
  const refresh = requests.at(-1);
  refresh.resolve({ error: 'network error' }); await settle();
  assert(hasCoverage(84), 'failed background refresh preserves the last complete snapshot');
  assert(textOf(tree).includes('última actualización'), 'refresh failure is visible');
  const simulation = allNodes(tree).find(node => node.props?.title === 'Incluir la simulación del 5 de septiembre');
  simulation.props.onClick(); await settle();
  assert(hasCoverage(84), 'filter changes preserve the visible snapshot');
  assert(textOf(tree).includes('Actualizando…'));
  assert(!textOf(tree).includes('Mostrando:'));
  const simulationRequest = requests.at(-1);
  simulation.props.onClick(); await settle();
  const officialRequest = requests.at(-1);
  officialRequest.resolve({ data: data(technology, 'todos', 85), insight: null }); await settle();
  simulationRequest.resolve({ data: data(technology, 'todos', 67), insight: null }); await settle();
  assert(hasCoverage(85), 'a late response for the previous filter cannot overwrite the latest response');
  assert(!hasCoverage(67));
  const selectCommittee = value => allNodes(tree).find(node => node.type === 'Select' && node.props.onValueChange).props.onValueChange(value);
  const insightNode = () => allNodes(tree).find(node => node.type === 'DashboardInsightPanel');
  selectCommittee('Committee A'); await settle();
  assert(hasCoverage(85), 'changing committee does not unmount the dashboard');
  assert(textOf(tree).includes('Actualizando…'));
  const failedCommitteeRequest = requests.at(-1);
  const beforeDuplicate = requests.length;
  [...timers.values()].forEach(fn => fn()); timers.clear();
  await settle();
  assert.equal(requests.length, beforeDuplicate, 'in-flight duplicate refresh is coalesced');
  failedCommitteeRequest.resolve({ error: 'network error' }); await settle();
  assert(hasCoverage(85));
  assert(textOf(tree).includes('No se pudo cambiar el filtro'));
  allNodes(tree).find(node => textOf(node) === 'Reintentar' && node.props.onClick).props.onClick(); await settle();
  const retry = requests.at(-1);
  assert(retry.generateInsight, 'retry still requests an analysis for the new committee');
  const insightA = { template: 'Análisis del comité A', generatedAt: '2026-09-04T12:00:00Z', highlights: [] };
  retry.resolve({ data: data(technology, 'Committee A', 72), insight: insightA }); await settle();
  assert(hasCoverage(72));
  assert.equal(insightNode().props.insight, insightA, 'KPIs and analysis commit together');
  assert(!textOf(tree).includes('Mostrando:'));
  assert(!textOf(tree).includes('Actualizando…'));
  selectCommittee('todos'); await settle();
  const staleRequest = requests.at(-1);
  assert.equal(insightNode().props.insight, insightA, 'analysis stays with visible snapshot while loading');
  selectCommittee('Committee A'); await settle();
  const latestRequest = requests.at(-1);
  latestRequest.resolve({ data: data(technology, 'Committee A', 73), insight: null }); await settle();
  staleRequest.resolve({ data: data(technology, 'todos', 98), insight: { template: 'STALE' } }); await settle();
  assert(hasCoverage(73));
  assert.equal(insightNode().props.insight, insightA, 'stale response cannot overwrite the visible analysis');
  assert.equal(insightNode().props.isLoading, false);
  listeners.get('permissions-changed').forEach(fn => fn({ detail: technology })); await settle();
  assert(!hasCoverage(73), 'permission invalidation blocks old data even with the same identity');
  requests.at(-1).resolve({ data: data(technology, 'todos', 85), insight: null }); await settle();
  authorization = committee;
  listeners.get('permissions-changed').forEach(fn => fn({ detail: committee })); await settle();
  assert(!hasCoverage(85), 'global data disappears when permissions change to committee only');
  const committeeRequest = requests.at(-1);
  assert.equal(committeeRequest.target, 'Committee A');
  committeeRequest.resolve({ data: data(committee, 'Committee A', 61), insight: null }); await settle();
  assert(hasCoverage(61), 'committee data is shown after the authorized response');
  listeners.get('focus').forEach(fn => fn()); await settle();
  requests.at(-1).resolve({ data: data(admin, 'todos', 99), insight: { template: 'Unauthorized' } }); await settle();
  assert(!hasCoverage(61) && !hasCoverage(99), 'server authorization mismatch blocks even the retained snapshot');
  assert.equal(insightNode(), undefined, 'unauthorized analysis is never rendered');
  allNodes(tree).find(node => textOf(node) === 'Reintentar' && node.props.onClick).props.onClick(); await settle();
  assert(requests.at(-1).generateInsight, 'recovery after invalidation requests a fresh scoped analysis');
  requests.at(-1).resolve({ data: data(committee, 'Committee A', 62), insight: null }); await settle();
  assert(hasCoverage(62));
  console.log('PASS: server KPI survives partial browser loads and refresh errors');
  console.log('PASS: rapid filter changes ignore out-of-order responses');
  console.log('PASS: filters preserve the dashboard and matching analysis with temporary feedback; retries recover');
  console.log('PASS: permission changes clear global KPIs and load the authorized committee');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
