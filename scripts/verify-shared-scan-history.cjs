// Read-only internal verification: real merge/storage helpers and scanner refresh handler.
// Browser storage, server responses, and clocks are isolated doubles; no production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createJiti } = require('jiti');
const root = path.resolve(__dirname, '..');
const jiti = createJiti(__filename, { alias: { '@': root } });
const { LEGACY_SCAN_HISTORY_KEY, SCAN_HISTORY_KEY, getGuatemalaDate, getGuatemalaDayKey, mergeTodayScanHistory, persistLocalScanHistory, readLocalScanHistory } = jiti('../lib/scan-history.ts');
const at = time => new Date(`2026-09-10T${time}:00-06:00`);
const record = (id, options = {}) => ({ id, volunteerId: 'internal-volunteer', timestamp: at('08:00'), type: 'success', ...options });
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }
function storageDouble() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function refreshHandler() {
  const file = path.join(root, 'components/CheckInScanner.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fetchDbHistory') initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer);
  const state = { db: [record('previous')], today: [record('previous')], loading: false, error: '' };
  const ctx = vm.createContext({
    Date, Promise, console: { error: () => {} }, useCallback: fn => fn,
    todayDayKey: 'jue 10', historyRequestRef: { current: 0 },
    setLoadingDbHistory: value => { state.loading = value; },
    setDbHistory: value => { state.db = value; },
    setTodayDbHistory: value => { state.today = value; },
    setHistoryError: value => { state.error = value; },
    getHistoricalAttendanceLogs: async () => [],
  });
  const code = ts.transpileModule(`globalThis.run = ${initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInContext(code, ctx);
  return { ctx, state };
}
async function run() {
  await check('Equipo sin escaneos locales recibe la asistencia de otro dispositivo', () => {
    const shared = [record('shift-1', { sessionId: 'session-1' })];
    const a = mergeTodayScanHistory(shared, [record('session-1', { sessionId: 'session-1' })], '2026-09-10');
    const b = mergeTodayScanHistory(shared, [], '2026-09-10');
    assert.deepEqual(a, b);
    assert.equal(b.length, 1);
  });
  await check('Cierre remoto actualiza ambos equipos sin duplicar turnos de la sesion', () => {
    const shared = ['T1', 'T2'].map(key => record(key, { sessionId: 'session', isCompleted: true }));
    const local = [record('session', { sessionId: 'session', isCompleted: false })];
    const merged = mergeTodayScanHistory(shared, local, '2026-09-10');
    assert.equal(merged.length, 2);
    assert.ok(merged.every(row => row.isCompleted));
    assert.equal(local[0].isCompleted, false, 'La vista no modifica el archivo local');
  });
  await check('Se conservan intentos locales sin confundir voluntarios de nombres iguales', () => {
    const local = [record('error', { type: 'error' }), record('another-volunteer', { volunteerId: 'different' })];
    const before = JSON.stringify(local);
    assert.equal(mergeTodayScanHistory([record('shared')], local, '2026-09-10').length, 3);
    assert.equal(JSON.stringify(local), before);
  });
  await check('El dia usa Guatemala aun cuando UTC ya cambio de fecha', () => {
    const late = new Date('2026-09-11T03:30:00Z');
    assert.equal(getGuatemalaDate(late), '2026-09-10');
    assert.equal(getGuatemalaDayKey(late), 'jue 10');
    assert.equal(mergeTodayScanHistory([], [record('late', { timestamp: late })], '2026-09-10').length, 1);
    assert.equal(mergeTodayScanHistory([], [record('old')], '2026-09-11').length, 0);
  });
  await check('Nuevo escaneo conserva mas de 50 registros, dias antiguos y archivo original exacto', () => {
    const storage = storageDouble();
    const archive = Array.from({ length: 75 }, (_, i) => record(`old-${i}`, { timestamp: new Date('2026-09-09T15:00:00Z'), extra: 'preservar' }));
    const original = JSON.stringify(archive);
    storage.setItem(LEGACY_SCAN_HISTORY_KEY, original);
    persistLocalScanHistory(storage, [record('new')]);
    assert.equal(storage.getItem(LEGACY_SCAN_HISTORY_KEY), original);
    assert.equal(readLocalScanHistory(storage).length, 76);
    assert.equal(JSON.parse(storage.getItem(SCAN_HISTORY_KEY)).filter(row => row.extra === 'preservar').length, 75);
    persistLocalScanHistory(storage, [record('new')]);
    assert.equal(readLocalScanHistory(storage).length, 76);
  });
  await check('Almacenamiento lleno o archivo invalido no sobrescribe el historial previo', () => {
    const storage = storageDouble();
    storage.setItem(LEGACY_SCAN_HISTORY_KEY, JSON.stringify([record('legacy')]));
    storage.setItem(SCAN_HISTORY_KEY, JSON.stringify([record('saved')]));
    const before = JSON.stringify([...storage.data]);
    assert.throws(() => persistLocalScanHistory({ ...storage, setItem: () => { throw new Error('QuotaExceededError'); } }, [record('new')]));
    assert.equal(JSON.stringify([...storage.data]), before);
    storage.setItem(SCAN_HISTORY_KEY, '{malformed');
    assert.throws(() => persistLocalScanHistory(storage, [record('new')]));
    assert.equal(storage.getItem(SCAN_HISTORY_KEY), '{malformed');
  });
  await check('Actualizar incorpora la respuesta compartida a Esta sesion', async () => {
    const { ctx, state } = refreshHandler();
    ctx.getHistoricalAttendanceLogs = async (_limit, day) => [record(day ? 'remote-today' : 'older')];
    await ctx.run();
    assert.equal(state.today[0].id, 'remote-today');
    assert.equal(state.db[0].id, 'older');
    assert.equal(state.loading, false);
  });
  await check('Error de red conserva la ultima lista visible e informa el fallo', async () => {
    const { ctx, state } = refreshHandler();
    ctx.getHistoricalAttendanceLogs = async () => { throw new Error('offline'); };
    await ctx.run();
    assert.equal(state.today[0].id, 'previous');
    assert.equal(state.db[0].id, 'previous');
    assert.ok(state.error);
    assert.equal(state.loading, false);
  });
  await check('Una respuesta atrasada no reemplaza una entrada o salida mas reciente', async () => {
    const { ctx, state } = refreshHandler();
    const pending = [];
    ctx.getHistoricalAttendanceLogs = () => new Promise(resolve => pending.push(resolve));
    const older = ctx.run();
    const latest = ctx.run();
    pending[2]([record('new')]); pending[3]([record('new', { isCompleted: true })]);
    await latest;
    pending[0]([record('stale')]); pending[1]([record('stale')]);
    await older;
    assert.equal(state.today[0].id, 'new');
    assert.equal(state.today[0].isCompleted, true);
  });
  console.log(`${count}/${count} verificaciones aprobadas. Sin escrituras en produccion.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
