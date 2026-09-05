// Read-only domain verification: synthetic records; no database or server actions.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '..') } });
const { inferShiftsForSession, calculateSessionMinutes, getContinuousScheduledBlocks } = jiti('../lib/session-utils.ts');
const { processShiftsData, getShiftAttendanceState } = jiti('../lib/coordinator-data.ts');
const { getVolunteerProfileMetrics } = jiti('../lib/services/volunteer-profile.service.ts');
const RealDate = Date;
const day = 'jue 10';
const id = 'synthetic-volunteer';
const at = (time) => `2026-09-10T${time}:00-06:00`;
const shifts = ['T1', 'T2'].map((key) => ({ id: `synthetic-${key}`, volunteer_id: id, day_key: day, shift_key: key, checked_in: false, checked_out: false }));
const session = { id: 'synthetic-session', volunteer_id: id, day_key: day, started_at: at('08:00'), ended_at: null, status: 'open', auto_closed: false };
let count = 0;
function check(label, fn) { fn(); count++; console.log(`PASS ${label}`); }
function derive(records, sessions, now) {
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new RealDate(now).getTime(); }
  };
  try { return processShiftsData(records, [{ id }], sessions); }
  finally { global.Date = RealDate; }
}
function state(data, index = 0, records = shifts) {
  return getShiftAttendanceState({ shift: records[index], volunteerId: id, dayKey: day, shiftKey: records[index].shift_key, ...data });
}
check('Dos turnos corridos forman un solo bloque', () => {
  const blocks = getContinuousScheduledBlocks(day, ['T1', 'T2']);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].shiftKeys, ['T1', 'T2']);
});
check('Antes de escanear ambos turnos estan pendientes', () => {
  const data = derive(shifts, [], at('08:00'));
  for (let i = 0; i < 2; i++) assert.deepEqual(state(data, i), { isCheckedIn: false, isCheckedOut: false });
});
check('Entrada QR activa T1 en el mismo instante; T2 aun no inicia', () => {
  const data = derive(shifts, [session], at('08:00'));
  assert.deepEqual(state(data), { isCheckedIn: true, isCheckedOut: false });
  assert.deepEqual(state(data, 1), { isCheckedIn: false, isCheckedOut: false });
});
check('Al comenzar T2 ambos quedan vinculados a la misma sesion', () => {
  const data = derive(shifts, [session], at('11:01'));
  for (let i = 0; i < 2; i++) assert.equal(state(data, i).isCheckedIn, true);
  assert.equal(Object.keys(data.activeSessionsByVolunteer).length, 1);
});
const completed = { ...session, status: 'completed', ended_at: at('15:00') };
check('Salida QR completa ambos y retira la sesion activa', () => {
  const data = derive(shifts, [completed], at('15:00'));
  for (let i = 0; i < 2; i++) assert.deepEqual(state(data, i), { isCheckedIn: false, isCheckedOut: true });
  assert.equal(Object.keys(data.activeSessionsByVolunteer).length, 0);
});
check('Perfil cuenta 420 minutos sin duplicar la hora solapada', () => {
  assert.equal(calculateSessionMinutes(session.started_at, completed.ended_at).totalWorkedMinutes, 420);
  const metrics = getVolunteerProfileMetrics(id, shifts, [], [completed]);
  assert.equal(metrics.completedShiftsCount, 2);
  assert.equal(metrics.totalWorkedMinutes, 420);
});
check('Un turno separado no se marca durante el primer bloque', () => {
  assert.deepEqual(inferShiftsForSession(day, at('08:00'), at('12:00'), ['T1', 'T4']).map(s => s.shiftKey), ['T1']);
});
check('Marcacion manual vuelve a pendiente al limpiar las banderas', () => {
  const manual = [{ ...shifts[0], checked_in: true, checked_out: true, checked_in_at: at('08:00'), checked_out_at: at('12:00') }];
  assert.equal(state(derive(manual, [], at('12:00')), 0, manual).isCheckedOut, true);
  assert.deepEqual(state(derive(shifts, [], at('12:00'))), { isCheckedIn: false, isCheckedOut: false });
});
console.log(`${count} verificaciones de dominio aprobadas. No se escribio en la base de datos.`);
