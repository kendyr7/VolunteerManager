// Read-only domain verification: synthetic records; no database or server actions.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '..') } });
const { inferAdditionalCompletedShifts, inferShiftsForSession, calculateSessionMinutes, getContinuousScheduledBlocks, getSessionShiftCompletedAt, needsShortCheckoutConfirmation } = jiti('../lib/session-utils.ts');
const { processShiftsData, getShiftAttendanceState } = jiti('../lib/coordinator-data.ts');
const { getVolunteerProfileMetrics } = jiti('../lib/services/volunteer-profile.service.ts');
const { reconcileVolunteerAssignedShifts } = jiti('../lib/volunteer-assignments.ts');
const { findAttendanceSessionForShift, getUnifiedShiftTimes, getUnifiedShiftWorkedMinutes, getShiftDisplayState } = jiti('../lib/shift-calculations.ts');
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
check('Al terminar T1 se completa y T2 sigue abierto, sin registrar salida fisica', () => {
  for (const time of ['12:00', '14:59', '15:01']) {
    const data = derive(shifts, [session], at(time));
    assert.deepEqual(state(data, 0), { isCheckedIn: false, isCheckedOut: true });
    assert.deepEqual(state(data, 1), { isCheckedIn: true, isCheckedOut: false });
    assert.equal(data.sessionCompletedShiftKeys[`${id}-${day}-T1`], true);
    assert.equal(data.sessionOpenShiftKeys[`${id}-${day}-T1`], undefined);
    assert.equal(data.activeSessionsByVolunteer[id], session);
    assert.equal(session.ended_at, null);
  }
});
check('Con T1 T2 T3, T1 termina a las 12 y T2 a las 15', () => {
  const records = [...shifts, { ...shifts[0], id: 'synthetic-T3', shift_key: 'T3' }];
  const before = derive(records, [session], at('11:59'));
  assert.equal(state(before, 0, records).isCheckedIn, true);
  assert.equal(state(before, 2, records).isCheckedIn, false);
  const overlap = derive(records, [session], at('14:30'));
  assert.equal(state(overlap, 0, records).isCheckedOut, true);
  assert.equal(state(overlap, 1, records).isCheckedIn, true);
  assert.equal(state(overlap, 2, records).isCheckedIn, true);
  const after = derive(records, [session], at('15:00'));
  assert.equal(state(after, 1, records).isCheckedOut, true);
  assert.equal(state(after, 2, records).isCheckedIn, true);
});
check('T2 T3 cierran T2 al terminar su horario; no antes', () => {
  const records = ['T2', 'T3'].map(key => ({ ...shifts[0], id: key, shift_key: key }));
  const lateSession = { ...session, started_at: at('11:05') };
  assert.equal(state(derive(records, [lateSession], at('14:59')), 0, records).isCheckedIn, true);
  assert.equal(state(derive(records, [lateSession], at('15:00')), 0, records).isCheckedOut, true);
});
check('No se completa ni activa otro bloque separado sin salida y nueva entrada', () => {
  const records = ['T1', 'T3'].map(key => ({ ...shifts[0], id: key, shift_key: key }));
  const data = derive(records, [session], at('15:00'));
  assert.deepEqual(state(data, 0, records), { isCheckedIn: true, isCheckedOut: false });
  assert.deepEqual(state(data, 1, records), { isCheckedIn: false, isCheckedOut: false });
});
check('Una sesion antigua no vuelve a abrir turnos completados al cambiar de dia', () => {
  const data = derive(shifts, [session], '2026-09-11T08:00:00-06:00');
  assert.equal(state(data, 0).isCheckedOut, true);
  assert.equal(state(data, 1).isCheckedIn, true);
});
check('Horarios y perfil reflejan el cierre de T1 conservando la sesion abierta', () => {
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [at('14:30')])); }
    static now() { return new RealDate(at('14:30')).getTime(); }
  };
  try {
    const match = findAttendanceSessionForShift(day, 'T1', [session], shifts, id);
    assert.equal(match.shift_completed_at, new RealDate(at('12:00')).toISOString());
    assert.equal(match.status, 'open');
    assert.equal(match.ended_at, null);
    assert.match(getUnifiedShiftTimes(day, 'T1', shifts, [], [session], id).endTime, /12:00/);
    assert.equal(getUnifiedShiftTimes(day, 'T2', shifts, [], [session], id).endTime, 'En curso');
    const metrics = getVolunteerProfileMetrics(id, shifts, [], [session]);
    assert.equal(metrics.completedShiftsCount, 1);
    assert.equal(metrics.totalWorkedMinutes, 0);
    assert.equal(metrics.isCheckedInNow, true);
  } finally { global.Date = RealDate; }
});
const completed = { ...session, status: 'completed', ended_at: at('15:00') };
check('Salida QR completa ambos y retira la sesion activa', () => {
  const data = derive(shifts, [completed], at('15:00'));
  for (let i = 0; i < 2; i++) assert.deepEqual(state(data, i), { isCheckedIn: false, isCheckedOut: true });
  assert.equal(Object.keys(data.activeSessionsByVolunteer).length, 0);
});
check('Salida real anticipada prevalece y el cierre de T1 se conserva al salir de T2', () => {
  const early = { ...completed, ended_at: at('11:30') };
  assert.equal(findAttendanceSessionForShift(day, 'T1', [early], shifts, id).shift_completed_at, early.ended_at);
  assert.equal(findAttendanceSessionForShift(day, 'T1', [completed], shifts, id).shift_completed_at, new RealDate(at('12:00')).toISOString());
  assert.equal(findAttendanceSessionForShift(day, 'T2', [completed], shifts, id).shift_completed_at, completed.ended_at);
});
check('Sin entrada, pasar la hora de finalizacion no completa ningun turno', () => {
  const data = derive(shifts, [], at('16:00'));
  for (let i = 0; i < shifts.length; i++) assert.deepEqual(state(data, i), { isCheckedIn: false, isCheckedOut: false });
});
check('Perfil cuenta 420 minutos sin duplicar la hora solapada', () => {
  assert.equal(calculateSessionMinutes(session.started_at, completed.ended_at).totalWorkedMinutes, 420);
  const metrics = getVolunteerProfileMetrics(id, shifts, [], [completed]);
  assert.equal(metrics.completedShiftsCount, 2);
  assert.equal(metrics.totalWorkedMinutes, 420);
});
check('Una sesion abierta no acredita turnos adicionales', () => {
  const onlyT1 = [shifts[0]];
  const data = derive(onlyT1, [session], at('17:14'));
  assert.deepEqual(inferAdditionalCompletedShifts(day, session.started_at, null, ['T1']), []);
  assert.equal(data.sessionAdditionalCompletedShiftKeys[`${id}-${day}-T2`], undefined);
  assert.deepEqual(state(data, 0, onlyT1), { isCheckedIn: true, isCheckedOut: false });
});
check('Un adicional exige mas del 50% de su propio horario', () => {
  const onlyT1 = [shifts[0]];
  // 17:14 solo tiene 14 min en T4 (17:00-17:14), por lo que acredita T2 y T3, pero NO T4
  const extended1714 = { ...completed, started_at: at('06:51'), ended_at: at('17:14') };
  assert.deepEqual(
    inferAdditionalCompletedShifts(day, extended1714.started_at, extended1714.ended_at, ['T1']).map(shift => shift.shiftKey),
    ['T2', 'T3'],
  );

  // Exactamente 2 horas dentro de T4 es 50%, y no alcanza.
  const extended1900 = { ...completed, started_at: at('06:51'), ended_at: at('19:00') };
  assert.deepEqual(
    inferAdditionalCompletedShifts(day, extended1900.started_at, extended1900.ended_at, ['T1']).map(shift => shift.shiftKey),
    ['T2', 'T3'],
  );
  const extended1901 = { ...completed, started_at: at('06:51'), ended_at: at('19:01') };
  const data = derive(onlyT1, [extended1901], at('19:01'));
  assert.deepEqual(data.globalShifts[id][day], ['T1']);
  for (const shiftKey of ['T2', 'T3', 'T4']) {
    const key = `${id}-${day}-${shiftKey}`;
    assert.equal(data.sessionAdditionalCompletedShiftKeys[key], true);
    assert.equal(data.checkedOutMap[key], true);
    assert.ok(data.additionalCompletedByDayShift[day][shiftKey].includes(id));
  }
  const extraT2 = findAttendanceSessionForShift(day, 'T2', [extended1901], onlyT1, id);
  assert.equal(extraT2.is_additional_shift, true);
  assert.equal(extraT2.shift_completed_at, new RealDate(at('15:00')).toISOString());
});
check('El perfil suma los adicionales sin alterar el cumplimiento programado', () => {
  const onlyT1 = [shifts[0]];
  const extended = { ...completed, started_at: at('06:51'), ended_at: at('19:01') };
  const metrics = getVolunteerProfileMetrics(id, onlyT1, [], [extended]);
  assert.equal(metrics.scheduledShiftsCount, 1);
  assert.equal(metrics.scheduledCompletedShiftsCount, 1);
  assert.equal(metrics.additionalCompletedShiftsCount, 3);
  assert.equal(metrics.completedShiftsCount, 4);
  assert.equal(metrics.attendancePercentage, 100);
  assert.deepEqual(metrics.sessionsList[0].relatedShiftKeys, ['T1', 'T2', 'T3', 'T4']);
  assert.deepEqual(metrics.sessionsList[0].additionalShiftKeys, ['T2', 'T3', 'T4']);
  assert.equal(metrics.totalWorkedMinutes, 730);
});
check('El calendario conserva los turnos agendados aunque el cache de registros este vacio', () => {
  const assigned = reconcileVolunteerAssignedShifts(id, [], { [day]: ['T1', 'T2'] });
  const attended = { ...completed, started_at: at('07:00'), ended_at: at('15:00') };
  const data = processShiftsData(assigned, [{ id }], [attended]);
  const metrics = getVolunteerProfileMetrics(id, assigned, [], [attended]);
  assert.equal(data.sessionAdditionalCompletedShiftKeys[`${id}-${day}-T1`], undefined);
  assert.equal(data.sessionAdditionalCompletedShiftKeys[`${id}-${day}-T2`], undefined);
  assert.equal(metrics.scheduledCompletedShiftsCount, 2);
  assert.equal(metrics.additionalCompletedShiftsCount, 0);
});
check('Extension de 1 hora no acredita turno adicional pero conserva horas trabajadas', () => {
  const onlyT1 = [shifts[0]];
  // Salió a las 13:00 (1 hora después de las 12:00)
  const ext1h = { ...completed, started_at: at('07:00'), ended_at: at('13:00') };
  assert.deepEqual(inferAdditionalCompletedShifts(day, ext1h.started_at, ext1h.ended_at, ['T1']), []);
  const metrics = getVolunteerProfileMetrics(id, onlyT1, [], [ext1h]);
  assert.equal(metrics.scheduledCompletedShiftsCount, 1);
  assert.equal(metrics.additionalCompletedShiftsCount, 0);
  assert.equal(metrics.totalWorkedMinutes, 360); // 6 horas completas
});
check('Turno programado T1+T2 con salida a las 11:51 solo completa T1 y no T2', () => {
  const t1t2 = [shifts[0], shifts[1]];
  const session1151 = { ...completed, started_at: at('06:30'), ended_at: at('11:51') };
  const matched = inferShiftsForSession(day, session1151.started_at, session1151.ended_at, ['T1', 'T2']);
  assert.deepEqual(matched.map(s => s.shiftKey), ['T1']);
});
check('Llegar tarde conserva el turno agendado solo al superar la mitad', () => {
  assert.deepEqual(inferShiftsForSession(day, at('13:00'), at('15:00'), ['T2']).map(s => s.shiftKey), []);
  assert.deepEqual(inferShiftsForSession(day, at('12:59'), at('15:00'), ['T2']).map(s => s.shiftKey), ['T2']);
  assert.deepEqual(inferShiftsForSession(day, at('06:58'), at('07:10'), ['T1']).map(s => s.shiftKey), []);
});
check('Un turno intermedio abierto no finaliza con menos de la mitad trabajada', () => {
  assert.equal(getSessionShiftCompletedAt(day, 'T1', at('11:59'), null, ['T1', 'T2'], at('12:01')), null);
  assert.equal(getSessionShiftCompletedAt(day, 'T1', at('09:29'), null, ['T1', 'T2'], at('12:01')), new RealDate(at('12:00')).toISOString());
});
check('Un turno no agendado anterior tambien cuenta si supera la mitad', () => {
  assert.deepEqual(
    inferAdditionalCompletedShifts(day, at('11:00'), at('21:00'), ['T4']).map(s => s.shiftKey),
    ['T2', 'T3'],
  );
});
check('Un turno de cinco horas exige mas de dos horas y media', () => {
  const extendedAt = time => `2026-09-14T${time}:00-06:00`;
  assert.deepEqual(inferAdditionalCompletedShifts('lun 14', extendedAt('17:00'), extendedAt('19:30'), ['T1']).map(s => s.shiftKey), []);
  assert.deepEqual(inferAdditionalCompletedShifts('lun 14', extendedAt('17:00'), extendedAt('19:31'), ['T1']).map(s => s.shiftKey), ['T4']);
});
check('Escaneo accidental de segundos no completa el turno', () => {
  const accidental = { ...completed, started_at: at('17:57'), ended_at: at('17:57:15') };
  const matched = inferShiftsForSession(day, accidental.started_at, accidental.ended_at, ['T3']);
  assert.deepEqual(matched, []);
});
check('El intento de salida antes de una hora exige una confirmacion explicita', () => {
  assert.equal(needsShortCheckoutConfirmation(at('08:00'), '2026-09-10T08:59:59-06:00'), true);
  assert.equal(needsShortCheckoutConfirmation(at('08:00'), at('09:00')), false);
});
check('Un turno separado no se marca durante el primer bloque', () => {
  assert.deepEqual(inferShiftsForSession(day, at('08:00'), at('12:00'), ['T1', 'T4']).map(s => s.shiftKey), ['T1']);
});
check('Una salida real que cubre dos bloques separados acredita ambos turnos agendados', () => {
  const records = ['T1', 'T4'].map(key => ({ ...shifts[0], id: key, shift_key: key }));
  const continuous = { ...completed, started_at: at('06:58'), ended_at: at('20:38') };
  assert.deepEqual(inferShiftsForSession(day, continuous.started_at, continuous.ended_at, ['T1', 'T4']).map(s => s.shiftKey), ['T1', 'T4']);
  const data = derive(records, [continuous], at('20:38'));
  assert.deepEqual(state(data, 0, records), { isCheckedIn: false, isCheckedOut: true });
  assert.deepEqual(state(data, 1, records), { isCheckedIn: false, isCheckedOut: true });
  assert.equal(getShiftDisplayState(day, 'T4', records[1], [continuous], records, id).status, 'completed');
  assert.equal(getVolunteerProfileMetrics(id, records, [], [continuous]).scheduledCompletedShiftsCount, 2);
  assert.equal(findAttendanceSessionForShift(day, 'T1', [continuous], records, id).shift_completed_at, new RealDate(at('12:00')).toISOString());
});
check('Una sesion aun abierta no inventa presencia en otro bloque agendado', () => {
  const records = ['T1', 'T4'].map(key => ({ ...shifts[0], id: key, shift_key: key }));
  const open = { ...session, started_at: at('06:58') };
  const data = derive(records, [open], at('19:00'));
  assert.equal(data.sessionOpenShiftKeys[`${id}-${day}-T4`], undefined);
  assert.equal(findAttendanceSessionForShift(day, 'T4', [open], records, id), null);
});
check('Una salida breve en el segundo bloque aparece como cerrada para revisar, sin acreditar', () => {
  const records = ['T1', 'T4'].map(key => ({ ...shifts[0], id: key, shift_key: key }));
  const shortLate = { ...completed, started_at: at('11:30'), ended_at: at('17:10') };
  const display = getShiftDisplayState(day, 'T4', records[1], [shortLate], records, id);
  assert.equal(display.status, 'needs_review');
  assert.equal(display.endAt, shortLate.ended_at);
  assert.match(display.flag, /50%/);
});
check('Una segunda asistencia breve no oculta un turno ya completado', () => {
  const first = { ...completed, id: 'first', started_at: at('07:00'), ended_at: at('11:30') };
  const second = { ...completed, id: 'second', started_at: at('11:40'), ended_at: at('11:50') };
  const match = findAttendanceSessionForShift(day, 'T1', [first, second], [shifts[0]], id);
  assert.equal(match.id, first.id);
  assert.equal(getShiftDisplayState(day, 'T1', shifts[0], [first, second], [shifts[0]], id).status, 'completed');
});
check('Marcacion manual vuelve a pendiente al limpiar las banderas', () => {
  const manual = [{ ...shifts[0], checked_in: true, checked_out: true, checked_in_at: at('08:00'), checked_out_at: at('12:00') }];
  assert.equal(state(derive(manual, [], at('12:00')), 0, manual).isCheckedOut, true);
  assert.deepEqual(state(derive(shifts, [], at('12:00'))), { isCheckedIn: false, isCheckedOut: false });
});
check('Una salida breve queda para revisar sin acreditar el turno', () => {
  const brief = { ...completed, started_at: at('08:00'), ended_at: at('08:10') };
  assert.equal(inferShiftsForSession(day, brief.started_at, brief.ended_at, ['T1']).length, 0);
  const display = getShiftDisplayState(day, 'T1', shifts[0], [brief], [shifts[0]], id, new RealDate(at('09:00')));
  assert.equal(display.status, 'needs_review');
  assert.match(display.flag, /50%/);
  assert.equal(display.endAt, brief.ended_at);
});
check('Sesion abierta vencida no cuenta como persona en turno', () => {
  const stale = getShiftDisplayState(day, 'T2', shifts[1], [session], shifts, id, new RealDate(at('16:00')));
  assert.equal(stale.status, 'needs_review');
  assert.match(stale.flag, /Salida pendiente/);
});
check('Flags antiguos de entrada sin sesion no cuentan como presencia real', () => {
  const legacy = { ...shifts[0], checked_in: true, checked_in_at: at('08:00') };
  const display = getShiftDisplayState(day, 'T1', legacy, [], [legacy], id, new RealDate(at('09:00')));
  assert.equal(display.status, 'needs_review');
  assert.match(display.flag, /verificar presencia/i);
});
check('La sesion prevalece sobre flags heredados contradictorios', () => {
  const flagged = { ...shifts[1], checked_in: true, checked_out: true };
  const otherBlock = { ...completed, started_at: at('07:00'), ended_at: at('10:00') };
  const display = getShiftDisplayState(day, 'T2', flagged, [otherBlock], [shifts[0], flagged], id, new RealDate(at('11:00')));
  assert.equal(display.status, 'scheduled');
  assert.match(display.flag, /Flags/);
});
check('Entrada heredada no genera alerta cuando la sesión ya terminó normalmente', () => {
  const flagged = { ...shifts[0], checked_in: true, checked_out: false };
  const display = getShiftDisplayState(day, 'T1', flagged, [completed], [flagged], id, new RealDate(at('16:00')));
  assert.equal(display.status, 'completed');
  assert.equal(display.flag, null);
});
check('Turno continuo muestra la hora de inicio propia y no la entrada del bloque anterior', () => {
  const joined = { ...completed, started_at: at('08:00'), ended_at: at('15:00') };
  const display = getShiftDisplayState(day, 'T2', shifts[1], [joined], shifts, id, new RealDate(at('15:00')));
  assert.equal(display.startAt, new RealDate(at('11:00')).toISOString());
  assert.match(getUnifiedShiftTimes(day, 'T2', shifts, [], [joined], id).startTime, /11:00/);
});
check('Sin asignacion conocida una sesion abierta no se atribuye a todos los turnos', () => {
  for (const shiftKey of ['T1', 'T2', 'T3', 'T4']) {
    assert.equal(findAttendanceSessionForShift(day, shiftKey, [session], [], id), null);
  }
});
check('No se inventan horas de prueba ni duraciones para turnos sin asistencia', () => {
  assert.equal(getUnifiedShiftTimes('vie 11', 'T4', [], [], [], id).startTime, '5:00 PM');
  assert.equal(getUnifiedShiftWorkedMinutes('vie 11', 'T4', []), 0);
  assert.equal(getUnifiedShiftWorkedMinutes(day, 'T1', [{ ...shifts[0], checked_in: true, checked_out: true }]), 0);
  assert.equal(getUnifiedShiftWorkedMinutes(day, 'T1', [{ ...shifts[0], checked_in_at: at('08:00'), checked_out_at: at('10:00') }]), 120);
});
check('Asistencia sustancial de mas de 1 hora se completa sin generar alerta de revision', () => {
  const substantial = { ...completed, started_at: at('09:40'), ended_at: at('12:00') };
  const display = getShiftDisplayState(day, 'T1', shifts[0], [substantial], shifts, id, new RealDate(at('16:00')));
  assert.equal(display.status, 'completed');
  assert.equal(display.flag, null);
});
console.log(`${count} verificaciones de dominio aprobadas. No se escribio en la base de datos.`);
