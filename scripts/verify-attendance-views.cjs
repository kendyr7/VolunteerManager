// Real view selectors and component initializers with isolated UI state; no network or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createJiti } = require('jiti');
const root = path.resolve(__dirname, '..');
const jiti = createJiti(__filename, { alias: { '@': root } });
const { resolveShiftView, isLiveShiftRoster, attendanceSortPriority, getOpenAttendanceVolunteerIds } = jiti('../lib/shift-view.ts');
const { getUnifiedShiftTimes } = jiti('../lib/shift-calculations.ts');
const { getShiftAttendanceState } = jiti('../lib/coordinator-data.ts');
const at = time => new Date(`2026-09-05T${time}:00-06:00`);
let count = 0;
function check(name, run) { run(); count++; console.log(`PASS ${name}`); }
function evaluate(file, variable, bindings) {
  const filename = path.join(root, file);
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && (node.name.getText(source) === variable || (ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.name?.getText(source) === variable))) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(initializer, variable);
  const context = vm.createContext({ Date, Map, Set, ...bindings });
  const code = ts.transpileModule(`globalThis.result = ${initializer.getText(source)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInContext(code, context);
  return context.result;
}
const volunteers = [
  { id: 'arrived', name: 'Ana', committee: 'A' },
  { id: 'pending', name: 'Zoe', committee: 'Z' },
  { id: 'closed', name: 'Eva', committee: 'A' },
  { id: 'private', name: 'No autorizado', committee: 'Private' },
];
const shifts = volunteers.map(v => ({ id: `shift-${v.id}`, volunteer_id: v.id, day_key: 'sáb 5', shift_key: 'T1', checked_in: v.id !== 'pending', checked_out: v.id === 'closed' }));
function roster(mode, now = at('10:00'), day = 'sáb 5', hasOpen = true) {
  return evaluate('app/(coordinator)/shifts/page.tsx', 'getAssignedVolunteers', {
    useCallback: fn => fn,
    contextIndexedAssignments: { [day]: { T1: { A: volunteers.map(v => v.id) } } },
    shiftDataIndex: { volunteerIdsByShift: new Map() },
    normalizeSearch: value => value.toLowerCase(),
    volunteerMap: new Map(volunteers.map(v => [v.id, v])),
    scopedCommitteeSet: new Set(['A', 'Z']),
    matchesFilters: () => true, appliedSearch: '', selectedCommittees: [], selectedStakes: [], selectedWards: [], currentRole: 'Admin',
    getShiftRecord: id => shifts.find(s => s.volunteer_id === id),
    getShiftAttendanceState, contextCheckedInMap: {}, contextCheckedOutMap: {},
    viewMode: mode, isLiveShiftRoster, attendanceSortPriority,
    attendanceShiftKeys: new Set(hasOpen ? [`${day}|T1`] : []), rosterNow: now,
  })(day, 'T1');
}
check('Turnos abre En turno con asistentes y Programacion sin asistentes', () => {
  assert.equal(resolveShiftView('', 90), 'active');
  assert.equal(resolveShiftView(null, 0), 'turnos');
  assert.equal(resolveShiftView('invalid', 0), 'turnos');
});
check('Se respeta una seleccion explicita aunque cambie el conteo', () => {
  assert.equal(resolveShiftView('turnos', 90), 'turnos');
  assert.equal(resolveShiftView('active', 0), 'active');
  assert.equal(resolveShiftView('completed', 90), 'completed');
});
check('En turno ordena pendientes, completados en gris y presentes dentro del roster diario', () => {
  const rows = roster('active');
  assert.deepEqual(Array.from(rows, r => r.id), ['pending', 'closed', 'arrived']);
  assert.equal(shifts[1].checked_in, false);
});
check('Los pendientes futuros no aparecen como si estuvieran en turno', () => {
  assert.deepEqual(Array.from(roster('active', at('10:00'), 'jue 10'), r => r.id), []);
  assert.equal(isLiveShiftRoster('sáb 5', 'T1', false, at('08:00')), false);
});
check('Turno sin escaneos dentro del horario muestra pendientes al abrirlo explicitamente', () => {
  assert.equal(isLiveShiftRoster('sáb 5', 'T1', false, at('09:00')), true);
  assert.ok(roster('active', at('10:00'), 'sáb 5', false).some(v => v.id === 'pending'));
});
check('Despues del horario el roster permanece por cualquier asistencia y desaparece a medianoche', () => {
  assert.equal(isLiveShiftRoster('sáb 5', 'T1', true, at('15:00')), true);
  assert.equal(isLiveShiftRoster('sáb 5', 'T1', false, at('15:00')), false);
  assert.equal(isLiveShiftRoster('sáb 5', 'T1', true, new Date('2026-09-06T00:01:00-06:00')), false);
});
check('El contador usa personas con sesion abierta hoy, no banderas antiguas del turno', () => {
  const sessions = [
    { volunteer_id: 'arrived', day_key: 'sáb 5', status: 'open', ended_at: null },
    { volunteer_id: 'closed', day_key: 'sáb 5', status: 'completed', ended_at: at('14:00').toISOString() },
    { volunteer_id: 'old', day_key: 'vie 4', status: 'open', ended_at: null },
  ];
  assert.deepEqual([...getOpenAttendanceVolunteerIds(sessions, 'sáb 5')], ['arrived']);
});
check('El perfil muestra las horas reales de attendance_sessions', () => {
  const times = getUnifiedShiftTimes('sáb 5', 'T1', shifts, [], [{
    id: 'session-1', volunteer_id: 'closed', day_key: 'sáb 5',
    status: 'completed', started_at: '2026-09-05T14:54:00.000Z', ended_at: '2026-09-05T20:58:00.000Z',
  }], 'closed');
  assert.match(times.startTime, /08:54/);
  assert.match(times.endTime, /02:58/);
});
check('Calendario personal y tooltip consumen sesiones compartidas sin quedar recortados', () => {
  const scheduleService = fs.readFileSync(path.join(root, 'lib/services/volunteer-schedule.service.ts'), 'utf8');
  const calendar = fs.readFileSync(path.join(root, 'components/ShiftCalendar.tsx'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'components/VolunteerProfileView.tsx'), 'utf8');
  assert.ok(scheduleService.includes(".from('attendance_sessions')"));
  assert.ok(scheduleService.includes('findAttendanceSessionForShift'));
  assert.ok(calendar.includes("{ event: 'session_sync' }"));
  assert.ok(profile.includes('<Popover.Portal>'));
  assert.ok(profile.includes('className="z-[320]"'));
  assert.ok(!profile.includes('activeShiftTooltipKey'));
});
check('Programacion comparte el orden de asistencia y Completados conserva su filtro', () => {
  assert.deepEqual(Array.from(roster('completed'), r => r.id), ['closed']);
  assert.deepEqual(Array.from(roster('turnos'), r => r.id), ['pending', 'closed', 'arrived']);
});
check('Esta sesion es la pestana inicial y sus datos del servidor no esperan escaneos locales', () => {
  const file = 'components/CheckInScanner.tsx';
  const initialHistory = { date: '2026-09-05', dayKey: 'sáb 5', logs: Array.from({ length: 90 }, (_, i) => ({ id: `server-${i}`, timestamp: at('09:00').toISOString(), type: 'success' })) };
  const bindings = { initialHistory, useState: value => [typeof value === 'function' ? value() : value, () => {}] };
  assert.equal(evaluate(file, 'historyTab', bindings)[0], 'session');
  assert.equal(evaluate(file, 'todayDbHistory', bindings)[0].length, 90);
  assert.equal(evaluate(file, 'loadingDbHistory', bindings)[0], false);
  const scanner = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(scanner.includes('const sharedSessionHistory = todayDbHistory'));
  assert.ok(scanner.includes('{sharedSessionCount}'));
  assert.ok(scanner.includes('attendanceSortPriority(Boolean(a.checkedIn && !a.checkedOut), Boolean(a.checkedOut))'));
  const page = fs.readFileSync(path.join(root, 'app/(coordinator)/check-in/page.tsx'), 'utf8');
  assert.ok(page.includes("params.view === 'scanner' ? 'scanner' : 'history'"));
  assert.ok(page.includes('initialHistory={initialHistory}'));
});
console.log(`${count}/${count} verificaciones aprobadas. Sin escrituras en produccion.`);
