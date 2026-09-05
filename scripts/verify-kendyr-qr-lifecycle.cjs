// Internal integration verification using Kendyr's confirmed assignments.
// Executes the actual application modules and extracted UI handlers unchanged.
// Only external boundaries (authentication, Supabase, broadcast, timers) are local doubles.
// No .env files, production credentials, HTTP calls, or production writes are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const volunteer = {
  id: '731746a6-9a42-4ca9-9be8-30d6cc7489dc', first_name: 'Kendyr Gabriel',
  last_name: 'Quintanilla Estrada', status: 'active', committees: { name: 'Historia' },
};
const shiftIds = ['0968309d-39f0-4733-b06b-e25a819dcd75', '4242cbee-13d4-480e-86a1-bb65eef45a8a'];
const seedShifts = shiftIds.map((id, i) => ({
  id, volunteer_id: volunteer.id, day_key: 'jue 10', shift_key: `T${i + 1}`,
  checked_in: false, checked_out: false, checked_in_at: null, checked_out_at: null,
}));
const at = time => `2026-09-10T${time}:00-06:00`;
const results = [];
async function verify(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false }); console.log(`FAIL ${name}: ${error.message}`); }
}

function createHarness({ shiftKeys = ['T1', 'T2'], canCorrect = true, canViewAll = true, committeeId = null, canManage = true } = {}) {
  const tables = { volunteers: [clone(volunteer)], shifts: clone(seedShifts), attendance_sessions: [], activity_logs: [], profiles: [{ id: 'internal-test-actor' }] };
  tables.shifts.forEach((shift, i) => { shift.shift_key = shiftKeys[i]; });
  const events = [];
  const paths = [];
  let now = at('08:00');
  let failSessionUpdate = false;
  let failSessionInsert = false;
  let failShiftUpdate = false;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  class Query {
    constructor(table) { assert.ok(tables[table], `Unexpected table ${table}`); this.table = table; this.filters = []; this.mode = 'select'; this.columns = '*'; }
    select(columns = '*') { this.columns = columns; return this; }
    eq(key, value) { this.filters.push(row => key === 'volunteers.committee_id' ? tables.volunteers.find(v => v.id === row.volunteer_id)?.committee_id === value : row[key] === value); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    order(key, options = {}) { this.sort = [key, options]; return this; }
    limit(value) { this.cap = value; return this; }
    range(from, to) { this.bounds = [from, to]; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; this.mustExist = true; return this; }
    update(data) { this.mode = 'update'; this.payload = clone(data); return this; }
    insert(data) { this.mode = 'insert'; this.payload = clone(data); return this; }
    upsert(data) { this.mode = 'upsert'; this.payload = clone(data); return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
    execute() {
      const table = tables[this.table];
      let rows = table.filter(row => this.filters.every(fn => fn(row)));
      if (this.mode === 'update') {
        if (this.table === 'attendance_sessions' && failSessionUpdate) return { data: null, error: { message: 'Injected session update failure' } };
        if (this.table === 'shifts' && failShiftUpdate) return { data: null, error: { message: 'Injected shift update failure' } };
        rows.forEach(row => Object.assign(row, this.payload));
      } else if (this.mode === 'insert' || this.mode === 'upsert') {
        if (this.table === 'attendance_sessions' && failSessionInsert) return { data: null, error: { message: 'Injected session insert failure' } };
        const values = Array.isArray(this.payload) ? this.payload : [this.payload];
        rows = values.map(value => {
          const existing = this.mode === 'upsert' ? table.find(row => row.id === value.id) : null;
          if (existing) return Object.assign(existing, value);
          const row = { id: crypto.randomUUID(), ...value };
          table.push(row); return row;
        });
      }
      if (this.sort) {
        const [key, options] = this.sort;
        rows = [...rows].sort((a, b) => {
          if (a[key] == null) return options.nullsFirst ? -1 : 1;
          if (b[key] == null) return options.nullsFirst ? 1 : -1;
          return String(a[key]).localeCompare(String(b[key])) * (options.ascending === false ? -1 : 1);
        });
      }
      if (this.cap !== undefined) rows = rows.slice(0, this.cap);
      if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
      rows = rows.map(row => {
        const value = clone(row);
        if (this.table === 'shifts' && this.columns.includes('volunteers')) value.volunteers = clone(tables.volunteers.find(v => v.id === row.volunteer_id) || null);
        return value;
      });
      if (this.mustExist && rows.length !== 1) throw new Error(`Expected one row in ${this.table}, got ${rows.length}`);
      return { data: this.singleRow ? rows[0] || null : rows, error: null };
    }
  }
  const db = { from: table => new Query(table) };
  const actor = { userId: 'internal-test-actor', name: 'Internal verification', userName: 'Internal verification', userRole: 'Admin', committeeId };
  const mocks = {
    '@/lib/supabase/server': { getAdminClient: () => db },
    '@/lib/supabase/admin': { getAdminSupabase: async () => db },
    '@/lib/authorization': { requireCapability: async capability => {
      if (capability === 'correct_attendance_times' && !canCorrect) throw new Error('No autorizado para corregir horarios');
      if (capability === 'manage_permissions' && !canManage) throw new Error('No autorizado para reabrir turnos');
      return actor;
    }, requireVolunteerCapability: async () => actor, requireVolunteerSelfOrCapability: async () => actor },
    '@/lib/role-permissions': { hasCapability: (_actor, capability) => capability === 'view_all_volunteers' ? canViewAll : true, roleDisplayName: () => 'Admin' },
    '@/lib/auth-helpers': { getCurrentUserSession: async () => actor },
    '@/lib/services/shift-broadcast.service': {
      broadcastShiftSync: payload => events.push(clone(payload)),
      broadcastSessionSync: async payload => { events.push(clone(payload)); },
    },
    './activity-actions': { createActivityLog: async () => true },
    'next/cache': { revalidatePath: value => paths.push(value) },
  };
  const context = vm.createContext({
    Date: Clock, console, crypto, Buffer,
    process: { env: { JWT_SECRET: 'internal-test-key-not-valid-in-production', NODE_ENV: 'verification', USE_TEST_SESSION_STORE: 'false' } },
    setTimeout: () => 0, clearTimeout: () => {},
  });
  const cache = new Map();
  const compile = (source, filename) => ts.transpileModule(source, {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  function load(specifier, parent = path.join(root, 'index.ts')) {
    if (mocks[specifier]) return mocks[specifier];
    if (['date-fns', 'date-fns/locale', 'node:crypto'].includes(specifier)) return require(specifier);
    assert.ok(specifier.startsWith('@/') || specifier.startsWith('.') || path.isAbsolute(specifier), `External dependency blocked: ${specifier}`);
    let filename = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (!/\.(?:ts|tsx|js|cjs)$/.test(filename)) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const fn = vm.runInContext(`(function(require,module,exports){${compile(fs.readFileSync(filename, 'utf8'), filename)}\n})`, context, { filename });
    fn(child => load(child, filename), mod, mod.exports);
    return mod.exports;
  }
  function handler(relativeFile, variableName, bindings) {
    const filename = path.join(root, relativeFile);
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === variableName) initializer = node.initializer;
      ts.forEachChild(node, visit);
    }
    visit(source); assert.ok(initializer, `Handler ${variableName} not found`);
    const ctx = vm.createContext({ Date: Clock, crypto, console, setTimeout: () => 0, ...bindings });
    vm.runInContext(compile(`globalThis.runHandler = ${initializer.getText(source)};`, filename), ctx);
    return ctx;
  }
  const actions = load('@/app/actions/attendance');
  const domain = load('@/lib/coordinator-data');
  const metrics = load('@/lib/services/volunteer-profile.service');
  const qr = JSON.stringify(load('@/lib/entry-pass').createEntryPassPayload(volunteer.id));
  function snapshot() {
    const data = domain.processShiftsData(tables.shifts, tables.volunteers, tables.attendance_sessions);
    return tables.shifts.map(shift => ({ shift: shift.shift_key, ...domain.getShiftAttendanceState({
      shift, volunteerId: shift.volunteer_id, dayKey: shift.day_key, shiftKey: shift.shift_key, ...data,
    }) }));
  }
  function scanner(variable = 'handleScannedData', initial = {}) {
    const ctx = handler('components/CheckInScanner.tsx', variable, {
      ...actions, coordinatorId: actor.userId, scanResult: null, checkoutModal: { isOpen: false, item: null },
      mobileDrawerDayGroup: null, history: [], dbHistory: [], state: 'idle', errorMsg: '',
      autoResetTimeoutRef: { current: null }, playWarningBeep: () => {}, playSuccessBeep: () => {},
      triggerVibration: () => {}, startScanning: () => {}, setSessionCount: () => {},
      refresh: async () => snapshot(), ...initial,
      fetchDbHistory: async () => actions.getHistoricalAttendanceLogs(),
      checkoutError: '',
    });
    for (const key of ['scanResult', 'checkoutModal', 'history', 'dbHistory', 'state', 'errorMsg', 'mobileDrawerDayGroup', 'checkoutError', 'pendingExit']) {
      ctx[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { ctx[key] = typeof value === 'function' ? value(ctx[key]) : value; };
    }
    ctx.updateHistory = ctx.setHistory;
    return ctx;
  }
  return { tables, events, paths, actions, qr, snapshot, scanner, metrics,
    auditActions: load('@/app/actions/audit-actions'),
    correction: (variable = 'handleConfirmOfficial', initial = {}) => handler('components/AdminSessionCorrectionModal.tsx', variable, {
      ...actions, session: tables.attendance_sessions[0],
      block: load('@/lib/session-utils').getContinuousScheduledBlockForSession('jue 10', tables.attendance_sessions[0]?.started_at, shiftKeys),
      isMockMode: false, setErrorMsg: () => {}, setIsSubmitting: () => {}, onSuccess: () => {}, onClose: () => {}, ...initial,
    }),
    historyView: (items, dbHistory = [], checkedOutMap = {}) => handler('components/CheckInScanner.tsx', 'filteredList', {
      useMemo: fn => fn(), activeRawList: items, dbHistory, checkedOutMap,
      searchQuery: '', selectedDayFilter: 'all', historyTab: 'db', todayDbHistory: [],
    }).runHandler,
    sessionStore: load('@/lib/services/session-store'),
    profile: () => {
      const bindings = {
        useCallback: fn => fn, volunteer, dbShiftRecords: tables.shifts,
        auditLogs: [{ description: 'Completó salida jue 10 T1' }],
        externalCheckedOutMap: undefined, externalCheckedInMap: undefined,
        localCheckedOutMap: { [`${volunteer.id}-jue 10-T1`]: true },
        localCheckedInMap: {},
        sessionAttendance: domain.processShiftsData(tables.shifts, tables.volunteers, tables.attendance_sessions),
        getShiftAttendanceState: domain.getShiftAttendanceState,
      };
      const out = handler('components/VolunteerProfileView.tsx', 'isShiftCheckedOut', bindings).runHandler;
      const inside = handler('components/VolunteerProfileView.tsx', 'isShiftCheckedIn', { ...bindings, isShiftCheckedOut: out }).runHandler;
      return { out, inside };
    },
    advance: time => { now = at(time); },
    advanceTo: iso => { now = iso; },
    failClose: () => { failSessionUpdate = true; },
    failOpen: () => { failSessionInsert = true; },
    failShiftUpdate: () => { failShiftUpdate = true; },
    shiftCheckout: () => handler('app/(coordinator)/shifts/page.tsx', 'handleConfirmCheckout', {
      ...actions, supabase: db, checkoutModal: { item: { shiftId: shiftIds[1], dayKey: 'jue 10', shiftKey: 'T2', volunteer: { ...volunteer, name: `${volunteer.first_name} ${volunteer.last_name}` } } },
      setCheckoutModal: () => {}, markShiftCompleted: () => {}, showToast: () => {}, refresh: async () => snapshot(),
    }),
  };
}

async function run() {
  const qrFlow = createHarness();
  const scanner = qrFlow.scanner();
  await scanner.runHandler(qrFlow.qr);
  await verify('Entrada: manejador QR guarda una sesion de Kendyr y activa T1', () => {
    assert.equal(scanner.state, 'success');
    assert.equal(qrFlow.tables.attendance_sessions.length, 1);
    assert.equal(qrFlow.tables.attendance_sessions[0].volunteer_id, volunteer.id);
    assert.deepEqual(qrFlow.snapshot().map(s => s.isCheckedIn), [true, false]);
  });
  await verify('Entrada: Historial de base muestra la asistencia QR', async () => {
    assert.ok((await qrFlow.actions.getHistoricalAttendanceLogs()).some(row => row.volunteerId === volunteer.id), 'El Historial devuelve cero registros para la sesion QR');
  });
  await verify('Perfil pendiente ignora marcas locales y auditorias antiguas', () => {
    const pending = createHarness().profile();
    assert.equal(pending.out('jue 10', 'T1'), false);
    assert.equal(pending.inside('jue 10', 'T1'), false);
  });
  await verify('Perfil usa la sesion abierta para pintar T1 en verde', () => {
    const profile = qrFlow.profile();
    assert.equal(profile.inside('jue 10', 'T1'), true);
    assert.equal(profile.out('jue 10', 'T1'), false);
    assert.equal(profile.inside('jue 10', 'T2'), false);
  });
  qrFlow.advance('11:01');
  await verify('Cambio de horario: T2 se incorpora a la misma sesion', () => {
    assert.deepEqual(qrFlow.snapshot().map(s => s.isCheckedIn), [true, true]);
    assert.equal(qrFlow.tables.attendance_sessions.length, 1);
  });
  qrFlow.advance('15:00');
  await scanner.runHandler(qrFlow.qr);
  await verify('Segundo QR solicita confirmacion sin crear ni cerrar otra sesion', () => {
    assert.equal(scanner.checkoutModal.isOpen, true);
    assert.equal(qrFlow.tables.attendance_sessions.length, 1);
    assert.equal(qrFlow.tables.attendance_sessions[0].status, 'open');
  });
  const checkout = qrFlow.scanner('handleConfirmCheckout', { scanResult: scanner.scanResult, checkoutModal: scanner.checkoutModal });
  await checkout.runHandler();
  await verify('Confirmar salida QR completa T1 y T2 juntos', () => {
    assert.equal(qrFlow.tables.attendance_sessions[0].status, 'completed');
    assert.deepEqual(qrFlow.snapshot().map(s => [s.isCheckedIn, s.isCheckedOut]), [[false, true], [false, true]]);
  });
  await verify('Perfil registra dos turnos completados y 420 minutos', () => {
    const model = qrFlow.metrics.getVolunteerProfileMetrics(volunteer.id, qrFlow.tables.shifts, [], qrFlow.tables.attendance_sessions);
    assert.equal(model.completedShiftsCount, 2); assert.equal(model.totalWorkedMinutes, 420); assert.equal(model.isCheckedInNow, false);
  });
  await verify('Entrada y salida emiten session_sync y revalidan pantallas', () => {
    assert.deepEqual(qrFlow.events.map(e => e.eventType), ['INSERT', 'UPDATE']);
    assert.ok(qrFlow.events.every(e => e.table === 'attendance_sessions'));
    for (const page of ['/shifts', '/volunteers', '/check-in', '/dashboard']) assert.ok(qrFlow.paths.includes(page));
  });
  await verify('Confirmacion duplicada conserva la hora de salida original', async () => {
    qrFlow.advance('15:05');
    const result = await qrFlow.actions.closeAttendanceSessionAction({ sessionId: qrFlow.tables.attendance_sessions[0].id });
    assert.equal(result.alreadyClosed, true); assert.equal(result.session.ended_at, new Date(at('15:00')).toISOString());
  });
  await verify('Salida QR aparece completada en Historial', async () => {
    const history = await qrFlow.actions.getHistoricalAttendanceLogs();
    assert.equal(history.length, 2);
    assert.equal(new Set(history.map(row => row.id)).size, 2);
    assert.ok(history.every(row => row.volunteerId === volunteer.id && row.isCompleted && row.sessionId === qrFlow.tables.attendance_sessions[0].id));
  });
  await verify('Perfil pinta ambos completados despues de la salida', () => {
    const profile = qrFlow.profile();
    for (const key of ['T1', 'T2']) {
      assert.equal(profile.inside('jue 10', key), false);
      assert.equal(profile.out('jue 10', key), true);
    }
  });
  const buttonFlow = createHarness();
  await buttonFlow.scanner().runHandler(buttonFlow.qr);
  buttonFlow.advance('15:00');
  await buttonFlow.shiftCheckout().runHandler();
  console.log('OBSERVACION boton Completar T2:', JSON.stringify({ session: buttonFlow.tables.attendance_sessions[0].status, shifts: buttonFlow.snapshot() }));
  await verify('Boton Completar T2 tambien cierra la sesion y T1', () => {
    assert.equal(buttonFlow.tables.attendance_sessions[0].status, 'completed', 'La sesion sigue abierta; T1 sigue activo y solo T2 esta completado');
  });
  const failedClose = createHarness();
  const failScanner = failedClose.scanner();
  await failScanner.runHandler(failedClose.qr);
  failedClose.advance('15:00');
  await failScanner.runHandler(failedClose.qr);
  failedClose.failClose();
  await verify('Un fallo al guardar la salida se devuelve como error', async () => {
    const response = await failedClose.actions.closeAttendanceSessionAction({ sessionId: failedClose.tables.attendance_sessions[0].id });
    assert.equal(response.success, false, 'La accion devuelve success=true y alreadyClosed=true aunque la sesion permanece open');
  });
  await verify('Modal QR conserva el error sin marcar completado ni cerrarse', async () => {
    const ui = failedClose.scanner('handleConfirmCheckout', {
      checkoutModal: failScanner.checkoutModal,
      history: [{ id: shiftIds[0], sessionId: failedClose.tables.attendance_sessions[0].id, isCompleted: false }],
    });
    await ui.runHandler();
    assert.equal(ui.checkoutModal.isOpen, true);
    assert.ok(ui.checkoutError);
    assert.equal(ui.history[0].isCompleted, false);
    assert.equal(failedClose.tables.attendance_sessions[0].status, 'open');
  });
  await verify('Una salida realizada en otro dispositivo no revive desde cache', async () => {
    const flow = createHarness();
    await flow.scanner().runHandler(flow.qr);
    assert.ok(await flow.sessionStore.getOpenSessionForVolunteer(volunteer.id));
    Object.assign(flow.tables.attendance_sessions[0], { status: 'completed', ended_at: at('15:00') });
    assert.equal(await flow.sessionStore.getOpenSessionForVolunteer(volunteer.id), null);
  });
  await verify('Historial no completa otro turno por una salida anterior del voluntario', () => {
    const flow = createHarness();
    const entry = { id: shiftIds[1], volunteerId: volunteer.id, volunteer: 'Kendyr', dayKey: 'jue 10', shiftKey: 'T2', isCompleted: false };
    assert.equal(flow.historyView([entry], [], { [volunteer.id]: true })[0].isCompleted, false);
  });
  await verify('Historial reemplaza marca local vieja con el estado vigente de la sesion', () => {
    const flow = createHarness();
    const entry = { id: 'session', sessionId: 'session', volunteerId: volunteer.id, volunteer: 'Kendyr', isCompleted: true };
    const current = { ...entry, id: shiftIds[0], isCompleted: false };
    assert.equal(flow.historyView([entry], [current])[0].isCompleted, false);
  });
  await verify('Turno manual sin sesion conserva cierre individual e idempotente', async () => {
    const flow = createHarness();
    Object.assign(flow.tables.shifts[0], { checked_in: true, checked_in_at: at('08:00') });
    flow.advance('12:00');
    assert.equal((await flow.actions.checkOutVolunteer(shiftIds[0])).success, true);
    const end = flow.tables.shifts[0].checked_out_at;
    flow.advance('12:05');
    assert.equal((await flow.actions.checkOutVolunteer(shiftIds[0])).alreadyClosed, true);
    assert.equal(flow.tables.shifts[0].checked_out_at, end);
    assert.equal(flow.tables.shifts[1].checked_out, false);
    assert.equal(flow.tables.attendance_sessions.length, 0);
  });
  for (const [keys, start, end] of [[['T2', 'T3'], '11:00', '18:00'], [['T3', 'T4'], '14:00', '21:00']]) {
    await verify(`${keys.join('+')}: una entrada y una salida completan el bloque continuo`, async () => {
      const flow = createHarness({ shiftKeys: keys });
      flow.advance(start);
      const ui = flow.scanner();
      await ui.runHandler(flow.qr);
      flow.advance(end);
      await ui.runHandler(flow.qr);
      assert.equal(ui.checkoutModal.isOpen, true);
      await flow.scanner('handleConfirmCheckout', { checkoutModal: ui.checkoutModal }).runHandler();
      assert.deepEqual(flow.snapshot().map(s => s.isCheckedOut), [true, true]);
    });
  }
  const forgotten = createHarness({ shiftKeys: ['T1', 'T3'] });
  const forgottenScanner = forgotten.scanner();
  await forgottenScanner.runHandler(forgotten.qr);
  forgotten.advance('14:00');
  await verify('T1 olvidado al iniciar T3 abre correccion, no confirmacion de salida normal', async () => {
    await forgottenScanner.runHandler(forgotten.qr);
    assert.equal(forgottenScanner.checkoutModal.isOpen, false);
    assert.ok(forgottenScanner.pendingExit);
    assert.deepEqual(Array.from(forgottenScanner.pendingExit.assignedShiftKeys), ['T1', 'T3']);
    assert.equal(forgotten.tables.attendance_sessions.length, 1);
    assert.deepEqual(forgotten.snapshot().map(s => s.isCheckedIn), [true, false]);
  });
  await verify('Salida normal no permite saltarse la resolucion de un bloque anterior', async () => {
    const response = await forgotten.actions.closeAttendanceSessionAction({ sessionId: forgotten.tables.attendance_sessions[0].id });
    assert.equal(response.success, false);
    assert.equal(response.requiresResolution, true);
    assert.equal(forgotten.tables.attendance_sessions[0].status, 'open');
  });
  await verify('Completar desde Historial tambien abre la correccion pendiente', async () => {
    const ui = forgotten.scanner('handleConfirmCheckout', { checkoutModal: { isOpen: true, item: { shiftId: shiftIds[0], sessionId: forgotten.tables.attendance_sessions[0].id, volunteerName: 'Kendyr' } } });
    await ui.runHandler();
    assert.ok(ui.pendingExit);
    assert.equal(ui.checkoutModal.isOpen, false);
  });
  await verify('Usar Fin Oficial guarda las 12:00 de T1, no las 14:00 del nuevo escaneo', async () => {
    await forgotten.correction().runHandler();
    assert.equal(forgotten.tables.attendance_sessions[0].ended_at, at('12:00'));
    assert.deepEqual(forgotten.snapshot().map(s => s.isCheckedOut), [true, false]);
    assert.equal(forgotten.tables.attendance_sessions.length, 1);
    assert.ok(forgotten.tables.activity_logs.some(log => log.action_type === 'Corrección Salida Olvidada'));
  });
  await verify('Tras resolver T1, otro escaneo abre T3 y su salida no cambia T1', async () => {
    await forgottenScanner.runHandler(forgotten.qr);
    assert.equal(forgotten.tables.attendance_sessions.length, 2);
    assert.deepEqual(forgotten.snapshot().map(s => [s.isCheckedIn, s.isCheckedOut]), [[false, true], [true, false]]);
    forgotten.advance('18:00');
    await forgottenScanner.runHandler(forgotten.qr);
    await forgotten.scanner('handleConfirmCheckout', { checkoutModal: forgottenScanner.checkoutModal }).runHandler();
    assert.deepEqual(forgotten.snapshot().map(s => s.isCheckedOut), [true, true]);
    assert.equal(forgotten.tables.attendance_sessions[0].ended_at, at('12:00'));
  });
  await verify('Una correccion tardia de T1 nunca incluye T3 separado', async () => {
    const flow = createHarness({ shiftKeys: ['T1', 'T3'] });
    await flow.scanner().runHandler(flow.qr);
    flow.advance('18:00');
    await flow.actions.adjustSessionTimesAdminAction({ sessionId: flow.tables.attendance_sessions[0].id, endedAt: at('18:00'), correctionType: 'custom_time', reason: 'Salida real verificada' });
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedOut), [true, false]);
  });
  await verify('Sesion del dia anterior exige correccion y respeta la fecha original', async () => {
    const flow = createHarness();
    const ui = flow.scanner();
    await ui.runHandler(flow.qr);
    flow.advanceTo('2026-09-11T08:00:00-06:00');
    await ui.runHandler(flow.qr);
    assert.ok(ui.pendingExit);
    await flow.correction().runHandler();
    assert.equal(flow.tables.attendance_sessions[0].ended_at, at('15:00'));
  });
  await verify('Corregir horarios requiere permiso administrativo en el servidor', async () => {
    const flow = createHarness({ canCorrect: false });
    await flow.scanner().runHandler(flow.qr);
    flow.advance('18:00');
    await assert.rejects(flow.actions.adjustSessionTimesAdminAction({ sessionId: flow.tables.attendance_sessions[0].id, correctionType: 'official_shift_end' }), /No autorizado/);
    assert.equal(flow.tables.attendance_sessions[0].status, 'open');
  });
  await verify('Error al guardar correccion conserva la sesion pendiente', async () => {
    const flow = createHarness();
    await flow.scanner().runHandler(flow.qr);
    flow.advance('18:00');
    flow.failClose();
    const result = await flow.actions.adjustSessionTimesAdminAction({ sessionId: flow.tables.attendance_sessions[0].id, correctionType: 'official_shift_end' });
    assert.equal(result.success, false);
    assert.equal(flow.tables.attendance_sessions[0].status, 'open');
    let closed = false;
    let message = '';
    await flow.correction('handleConfirmOfficial', { onClose: () => { closed = true; }, setErrorMsg: value => { message = value; } }).runHandler();
    assert.equal(closed, false);
    assert.ok(message);
  });
  await verify('T2 olvidado al volver a T4 solicita resolucion y conserva T4 pendiente', async () => {
    const flow = createHarness({ shiftKeys: ['T2', 'T4'] });
    flow.advance('11:00');
    const ui = flow.scanner();
    await ui.runHandler(flow.qr);
    flow.advance('17:00');
    await ui.runHandler(flow.qr);
    assert.ok(ui.pendingExit);
    await flow.correction().runHandler();
    assert.equal(flow.tables.attendance_sessions[0].ended_at, at('15:00'));
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedOut), [true, false]);
  });
  await verify('Hora personalizada anterior a entrada o futura se rechaza', async () => {
    const flow = createHarness();
    await flow.scanner().runHandler(flow.qr);
    flow.advance('18:00');
    for (const time of ['07:00', '19:00']) {
      await assert.rejects(flow.actions.adjustSessionTimesAdminAction({ sessionId: flow.tables.attendance_sessions[0].id, endedAt: at(time), correctionType: 'custom_time', reason: 'Prueba de validacion' }));
    }
    assert.equal(flow.tables.attendance_sessions[0].status, 'open');
  });
  await verify('Hora oficial se calcula en servidor y repetir correccion no cambia la salida', async () => {
    const flow = createHarness({ shiftKeys: ['T1', 'T3'] });
    await flow.scanner().runHandler(flow.qr);
    flow.advance('18:00');
    const sessionId = flow.tables.attendance_sessions[0].id;
    await flow.actions.adjustSessionTimesAdminAction({ sessionId, endedAt: at('18:00'), correctionType: 'official_shift_end' });
    assert.equal(flow.tables.attendance_sessions[0].ended_at, at('12:00'));
    const again = await flow.actions.adjustSessionTimesAdminAction({ sessionId, endedAt: at('18:00'), correctionType: 'official_shift_end' });
    assert.equal(again.alreadyClosed, true);
    assert.equal(flow.tables.attendance_sessions[0].ended_at, at('12:00'));
  });
  await verify('Historial compartido del dia pagina mas de 1000 registros sin truncar a 150', async () => {
    const flow = createHarness();
    flow.tables.shifts = Array.from({ length: 1005 }, (_, i) => ({ ...seedShifts[0], id: `page-${String(i).padStart(4, '0')}`, checked_in: true, checked_in_at: at('08:00') }));
    flow.tables.shifts.push({ ...seedShifts[0], id: 'other-day', day_key: 'vie 11', checked_in: true, checked_in_at: at('08:00') });
    const before = JSON.stringify(flow.tables);
    const rows = await flow.actions.getHistoricalAttendanceLogs(150, 'jue 10');
    assert.equal(rows.length, 1005);
    assert.ok(rows.every(row => row.dayKey === 'jue 10'));
    assert.equal(JSON.stringify(flow.tables), before, 'La lectura no debe escribir asistencia');
  });
  await verify('Historial del dia respeta el comite autorizado en sesiones y turnos', async () => {
    const flow = createHarness({ canViewAll: false, committeeId: 'allowed' });
    flow.tables.volunteers[0].committee_id = 'allowed';
    flow.tables.volunteers.push({ ...volunteer, id: 'not-authorized', committee_id: 'other' });
    flow.tables.shifts.push({ ...seedShifts[0], id: 'private-shift', volunteer_id: 'not-authorized', checked_in: true, checked_in_at: at('08:00') });
    flow.tables.attendance_sessions.push({ id: 'private-session', volunteer_id: 'not-authorized', day_key: 'jue 10', status: 'open', started_at: at('08:00') });
    await flow.scanner().runHandler(flow.qr);
    const rows = await flow.actions.getHistoricalAttendanceLogs(150, 'jue 10');
    assert.equal(rows.length, 1);
    assert.ok(rows.every(row => row.volunteerId === volunteer.id));
    assert.equal((await createHarness({ canViewAll: false }).actions.getHistoricalAttendanceLogs(150, 'jue 10')).length, 0);
  });
  const arnaldoId = '8edf6a50-3437-4511-bdf6-aac9618bbf0c';
  const reopenInput = { volunteerId: volunteer.id, dayKey: 'jue 10', shiftKey: 'T1', actorName: 'Untrusted client name' };
  await verify('Reabrir Arnaldo conserva entrada 09:09 y no cambia otro voluntario ni otro dia', async () => {
    const flow = createHarness();
    flow.advanceTo('2026-09-05T09:30:00-06:00');
    flow.tables.volunteers.push({ ...volunteer, id: arnaldoId, first_name: 'Arnaldo Jose', last_name: 'Rodriguez López' });
    flow.tables.shifts.push({ ...seedShifts[0], id: 'arnaldo-other-day', volunteer_id: arnaldoId, day_key: 'lun 21' });
    flow.tables.shifts.push({ ...seedShifts[0], id: 'f377d35b-9852-46d8-bb91-ebe300efe554', volunteer_id: arnaldoId, day_key: 'sáb 5', checked_in: true });
    flow.tables.attendance_sessions.push({ id: '130ff8e7-aacd-4301-8c91-88442669b5eb', volunteer_id: arnaldoId, day_key: 'sáb 5', started_at: '2026-09-05T15:09:49.156Z', ended_at: '2026-09-05T15:10:59.685Z', status: 'completed', auto_closed: false });
    const unrelated = JSON.stringify(flow.tables.shifts.filter(row => row.id !== 'f377d35b-9852-46d8-bb91-ebe300efe554'));
    const result = await flow.auditActions.reopenCompletedShiftAction({ ...reopenInput, volunteerId: arnaldoId, dayKey: 'sáb 5' });
    assert.equal(result.success, true);
    assert.equal(result.session.status, 'open');
    assert.equal(result.session.ended_at, null);
    assert.equal(result.session.started_at, '2026-09-05T15:09:49.156Z');
    assert.equal(flow.snapshot().at(-1).isCheckedIn, true);
    assert.equal(flow.snapshot().at(-1).isCheckedOut, false);
    assert.equal(JSON.stringify(flow.tables.shifts.filter(row => row.id !== 'f377d35b-9852-46d8-bb91-ebe300efe554')), unrelated);
    assert.ok(flow.events.some(event => event.table === 'attendance_sessions' && event.record.volunteer_id === arnaldoId));
  });
  async function closedFlow(options = {}) {
    const flow = createHarness(options);
    await flow.scanner().runHandler(flow.qr);
    flow.advance('15:00');
    await flow.actions.closeAttendanceSessionAction({ sessionId: flow.tables.attendance_sessions[0].id });
    return flow;
  }
  await verify('Reabrir turno continuo reabre su sesion y permite cerrarla otra vez', async () => {
    const flow = await closedFlow();
    const start = flow.tables.attendance_sessions[0].started_at;
    Object.assign(flow.tables.shifts[1], { checked_in: true, checked_out: true, checked_out_at: at('15:00') });
    const result = await flow.auditActions.reopenCompletedShiftAction(reopenInput);
    assert.equal(result.success, true);
    assert.deepEqual(flow.snapshot().map(row => row.isCheckedIn), [true, true]);
    assert.equal(flow.tables.attendance_sessions.length, 1);
    await flow.auditActions.reopenCompletedShiftAction(reopenInput);
    assert.equal(flow.tables.attendance_sessions[0].started_at, start);
    flow.advance('15:10');
    assert.equal((await flow.actions.closeAttendanceSessionAction({ sessionId: result.session.id })).success, true);
    assert.deepEqual(flow.snapshot().map(row => row.isCheckedOut), [true, true]);
  });
  await verify('Reabrir no devuelve exito ante fallo al actualizar la sesion', async () => {
    const flow = await closedFlow();
    const before = JSON.stringify(flow.tables);
    flow.failClose();
    const result = await flow.auditActions.reopenCompletedShiftAction(reopenInput);
    assert.equal(result.success, false);
    assert.equal(JSON.stringify(flow.tables), before);
  });
  await verify('Si falla sincronizar turnos, se revierte la reapertura y se informa error', async () => {
    const flow = await closedFlow();
    const end = flow.tables.attendance_sessions[0].ended_at;
    flow.failShiftUpdate();
    const result = await flow.auditActions.reopenCompletedShiftAction(reopenInput);
    assert.equal(result.success, false);
    assert.equal(flow.tables.attendance_sessions[0].status, 'completed');
    assert.equal(flow.tables.attendance_sessions[0].ended_at, end);
  });
  await verify('Reabrir requiere autorizacion y rechaza turnos inexistentes o pendientes', async () => {
    const denied = await closedFlow({ canManage: false });
    assert.equal((await denied.auditActions.reopenCompletedShiftAction(reopenInput)).success, false);
    assert.equal(denied.tables.attendance_sessions[0].status, 'completed');
    const pending = createHarness();
    assert.equal((await pending.auditActions.reopenCompletedShiftAction(reopenInput)).success, false);
    assert.equal((await pending.auditActions.reopenCompletedShiftAction({ ...reopenInput, shiftKey: 'T4' })).success, false);
  });
  await verify('No se reabre una sesion si el voluntario ya tiene otra abierta', async () => {
    const flow = await closedFlow();
    flow.tables.attendance_sessions.push({ ...flow.tables.attendance_sessions[0], id: 'another-session', day_key: 'vie 11', status: 'open', ended_at: null });
    const before = JSON.stringify(flow.tables);
    assert.equal((await flow.auditActions.reopenCompletedShiftAction(reopenInput)).success, false);
    assert.equal(JSON.stringify(flow.tables), before);
  });
  await verify('Reapertura manual sin sesion mantiene la entrada y solo afecta el turno indicado', async () => {
    const flow = createHarness();
    Object.assign(flow.tables.shifts[0], { checked_in: true, checked_out: true, checked_in_at: at('08:00'), checked_out_at: at('12:00') });
    const other = JSON.stringify(flow.tables.shifts[1]);
    assert.equal((await flow.auditActions.reopenCompletedShiftAction(reopenInput)).success, true);
    assert.equal(flow.tables.shifts[0].checked_out, false);
    assert.equal(flow.tables.shifts[0].checked_in_at, at('08:00'));
    assert.equal(JSON.stringify(flow.tables.shifts[1]), other);
    assert.equal(flow.tables.attendance_sessions.length, 0);
  });
  await verify('QR anticipado pide seleccion; seleccion manual abre sesion y activa perfil e historial inmediatamente', async () => {
    const flow = createHarness();
    flow.advance('06:55');
    const scanned = await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor');
    assert.equal(scanned.requiresManualSelection, true);
    assert.equal(flow.tables.attendance_sessions.length, 0);
    const ui = flow.scanner('handleManualCheckIn');
    await ui.runHandler(shiftIds[0]);
    assert.equal(ui.state, 'success');
    assert.equal(flow.tables.attendance_sessions.length, 1);
    assert.equal(flow.tables.attendance_sessions[0].started_at, new Date(at('06:55')).toISOString());
    assert.ok(ui.history[0].sessionId);
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedIn), [true, false]);
    assert.equal(flow.profile().inside('jue 10', 'T1'), true);
    assert.equal((await flow.actions.getHistoricalAttendanceLogs(150, 'jue 10')).length, 1);
    assert.ok(flow.events.some(e => e.table === 'attendance_sessions'));
  });
  await verify('Entrada anticipada permite cerrar por QR el bloque continuo sin duplicar sesiones', async () => {
    const flow = createHarness(); flow.advance('06:55');
    await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0]);
    flow.advance('15:00');
    const checkout = await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor');
    assert.equal(checkout.action, 'confirm_checkout');
    assert.equal((await flow.actions.closeAttendanceSessionAction({ sessionId: checkout.session.id })).success, true);
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedOut), [true, true]);
    assert.equal(flow.tables.attendance_sessions.length, 1);
  });
  await verify('Salida antes de comenzar el horario conserva asistencia solo en el primer turno', async () => {
    const flow = createHarness(); flow.advance('06:50');
    const opened = await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0]);
    flow.advance('06:55');
    await flow.actions.closeAttendanceSessionAction({ sessionId: opened.session.id });
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedOut), [true, false]);
  });
  await verify('Seleccion manual repetida no cambia entrada, duplica ni cierra la sesion', async () => {
    const flow = createHarness(); flow.advance('06:55');
    await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0]);
    const before = JSON.stringify(flow.tables);
    flow.advance('06:56');
    assert.ok((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0])).error);
    assert.equal(JSON.stringify(flow.tables), before);
  });
  await verify('Fallo de persistencia anticipada no deja marcas ni exito falso en UI', async () => {
    const flow = createHarness(); flow.advance('06:55'); flow.failOpen();
    const before = JSON.stringify(flow.tables);
    const ui = flow.scanner('handleManualCheckIn'); await ui.runHandler(shiftIds[0]);
    assert.equal(ui.state, 'error');
    assert.equal(JSON.stringify(flow.tables), before);
  });
  await verify('No hay ventana oculta de 90 minutos para entrada manual del mismo dia', async () => {
    const flow = createHarness(); flow.advance('04:00');
    assert.equal((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0])).success, true);
    assert.deepEqual(flow.snapshot().map(s => s.isCheckedIn), [true, false]);
  });
  await verify('No abre fechas futuras, pasadas, turno terminado ni voluntario archivado', async () => {
    for (const variant of ['future', 'past', 'ended', 'archived', 'completed']) {
      const flow = createHarness(); flow.advance('06:55');
      if (variant === 'future') flow.tables.shifts[0].day_key = 'vie 11';
      if (variant === 'past') flow.tables.shifts[0].day_key = 'mié 9';
      if (variant === 'ended') flow.advance('20:00');
      if (variant === 'archived') flow.tables.volunteers[0].status = 'archived';
      if (variant === 'completed') flow.tables.shifts[0].checked_out = true;
      const before = JSON.stringify(flow.tables);
      assert.ok((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0])).error, variant);
      assert.equal(JSON.stringify(flow.tables), before, variant);
    }
  });
  await verify('T1 y T3: entrada anticipada del segundo bloque no arrastra ni reabre el primero', async () => {
    const flow = createHarness({ shiftKeys: ['T1', 'T3'] });
    await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor');
    flow.advance('12:00');
    await flow.actions.closeAttendanceSessionAction({ sessionId: flow.tables.attendance_sessions[0].id });
    flow.advance('13:55');
    assert.equal((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[1])).success, true);
    assert.deepEqual(flow.snapshot().map(s => [s.isCheckedIn, s.isCheckedOut]), [[false, true], [true, false]]);
    flow.advance('18:00');
    assert.equal((await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor')).action, 'confirm_checkout');
  });
  await verify('Salida olvidada no puede saltarse mediante seleccion manual de otro bloque', async () => {
    const flow = createHarness({ shiftKeys: ['T1', 'T3'] });
    await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor'); flow.advance('14:00');
    assert.ok((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[1])).error);
    assert.equal((await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor')).action, 'stale_open_session');
    assert.equal(flow.tables.attendance_sessions.length, 1);
  });
  await verify('No permite seleccionar un turno posterior saltando el proximo asignado', async () => {
    const flow = createHarness({ shiftKeys: ['T1', 'T3'] }); flow.advance('06:55');
    assert.ok((await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[1])).error);
    assert.equal(flow.tables.attendance_sessions.length, 0);
  });
  await verify('Caso real sab 5 a las 08:54:55: visible antes de las 9 y salida posterior por QR', async () => {
    const flow = createHarness();
    flow.tables.shifts = [{ ...seedShifts[0], day_key: 'sáb 5' }];
    flow.advanceTo('2026-09-05T08:54:55.032-06:00');
    const opened = await flow.actions.checkInVolunteer('', 'internal-test-actor', shiftIds[0]);
    assert.equal(opened.session.started_at, '2026-09-05T14:54:55.032Z');
    assert.equal(flow.snapshot()[0].isCheckedIn, true);
    assert.equal((await flow.actions.getHistoricalAttendanceLogs(150, 'sáb 5')).length, 1);
    flow.advanceTo('2026-09-05T12:00:00-06:00');
    assert.equal((await flow.actions.checkInVolunteer(flow.qr, 'internal-test-actor')).action, 'confirm_checkout');
    await flow.actions.checkOutVolunteer(shiftIds[0]);
    assert.equal(flow.snapshot()[0].isCheckedOut, true);
  });
  const passes = results.filter(r => r.passed).length;
  console.log(`RESULTADO: ${passes}/${results.length} aprobadas; ${results.length - passes} fallos reproducidos. Persistencia y autenticacion simuladas; datos de produccion intactos.`);
  process.exitCode = passes === results.length ? 0 : 1;
}
run().catch(error => { console.error(error); process.exitCode = 2; });
