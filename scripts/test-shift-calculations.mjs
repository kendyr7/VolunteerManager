import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const {
  findAttendanceSessionForShift,
  getShiftAttendanceReviewFlag,
  getShiftDisplayState,
} = jiti('../lib/shift-calculations.ts');

const volunteerId = 'volunteer-regression';
const assertNoAttendanceAlert = (display, message) => {
  assert.equal(Object.hasOwn(display, 'flag'), false, message);
};

const afternoonShift = { id: 'fri-t4', volunteer_id: volunteerId, day_key: 'vie 11', shift_key: 'T4' };
const morningOnlySession = {
  id: 'fri-morning-only', volunteer_id: volunteerId, day_key: 'vie 11',
  started_at: '2026-09-11T13:15:34.352Z',
  ended_at: '2026-09-11T17:54:39.410Z',
  status: 'completed',
};
assert.equal(
  findAttendanceSessionForShift('vie 11', 'T4', [morningOnlySession], [afternoonShift], volunteerId),
  null,
  'Una sesión cerrada antes del turno no puede contarse como visita al turno de la tarde.',
);
assert.equal(
  getShiftAttendanceReviewFlag('vie 11', 'T4', afternoonShift, [morningOnlySession], [afternoonShift], volunteerId),
  null,
  'La sesión de la mañana no debe crear una decisión pendiente para T4.',
);

const saturdayShifts = [
  { id: 'sat-t1', volunteer_id: volunteerId, day_key: 'sáb 12', shift_key: 'T1' },
  { id: 'sat-t2', volunteer_id: volunteerId, day_key: 'sáb 12', shift_key: 'T2' },
];
const saturdaySession = {
  id: 'sat-session',
  volunteer_id: volunteerId,
  day_key: 'sáb 12',
  started_at: '2026-09-12T12:23:55.471+00:00',
  ended_at: '2026-09-12T20:44:12.619+00:00',
  status: 'completed',
};

assert.equal(
  findAttendanceSessionForShift(
    'sáb 12', 'T3', [saturdaySession], saturdayShifts, volunteerId,
  ),
  null,
  'Una sesión de T1/T2 no debe asociarse a T3 solo por un traslape breve.',
);
assert.deepEqual(
  getShiftDisplayState(
    'sáb 12', 'T3', null, [saturdaySession], saturdayShifts, volunteerId,
  ),
  { status: 'scheduled', startAt: null, endAt: null },
  'Un turno no asignado con traslape breve debe permanecer neutral.',
);

const mondayShifts = [
  { id: 'mon-t3', volunteer_id: volunteerId, day_key: 'lun 14', shift_key: 'T3' },
  { id: 'mon-t4', volunteer_id: volunteerId, day_key: 'lun 14', shift_key: 'T4' },
];
const mondaySession = {
  id: 'mon-session',
  volunteer_id: volunteerId,
  day_key: 'lun 14',
  started_at: '2026-09-14T20:17:11.747+00:00',
  ended_at: '2026-09-15T02:19:32.910+00:00',
  status: 'completed',
};

assert.equal(
  findAttendanceSessionForShift(
    'lun 14', 'T2', [mondaySession], mondayShifts, volunteerId,
  ),
  null,
  'Una sesión de T3/T4 no debe asociarse retroactivamente a T2.',
);
assertNoAttendanceAlert(
  getShiftDisplayState(
    'lun 14', 'T2', null, [mondaySession], mondayShifts, volunteerId,
  ),
  'El perfil no debe mostrar una alerta en T2 cuando el voluntario no tenía T2 asignado.',
);

// Regression test for consecutive assigned shifts handover (Gonzalo Javier Robles Canda case):
// Volunteer assigned to T1, T2, and T3; attendance registered for T2 (11:00 - 15:00).
// T1 (07:00-12:00) overlaps 11:00-12:00, and T3 (14:00-18:00) overlaps 14:00-15:00.
// These are official handover windows and must NOT generate alerts on T1 or T3.
const consecutiveShifts = [
  { id: 'jue-t1', volunteer_id: volunteerId, day_key: 'jue 17', shift_key: 'T1' },
  { id: 'jue-t2', volunteer_id: volunteerId, day_key: 'jue 17', shift_key: 'T2' },
  { id: 'jue-t3', volunteer_id: volunteerId, day_key: 'jue 17', shift_key: 'T3' },
];
const sessionT2Only = {
  id: 'jue-t2-session',
  volunteer_id: volunteerId,
  day_key: 'jue 17',
  started_at: '2026-09-17T17:00:00.000Z', // 11:00 AM GT
  ended_at: '2026-09-17T21:00:00.000Z',   // 15:00 PM GT
  status: 'completed',
};

const displayT1 = getShiftDisplayState('jue 17', 'T1', consecutiveShifts[0], [sessionT2Only], consecutiveShifts, volunteerId);
assert.equal(displayT1.status, 'scheduled', 'T1 debe permanecer scheduled sin alertar por el traslape de entrega');
assertNoAttendanceAlert(displayT1, 'T1 no debe exponer alertas de asistencia');

const displayT2 = getShiftDisplayState('jue 17', 'T2', consecutiveShifts[1], [sessionT2Only], consecutiveShifts, volunteerId);
assert.equal(displayT2.status, 'completed', 'T2 debe completarse con éxito');
assertNoAttendanceAlert(displayT2, 'T2 no debe exponer alertas de asistencia');

const displayT3 = getShiftDisplayState('jue 17', 'T3', consecutiveShifts[2], [sessionT2Only], consecutiveShifts, volunteerId);
assert.equal(displayT3.status, 'scheduled', 'T3 debe permanecer scheduled sin alertar por el traslape de entrega');
assertNoAttendanceAlert(displayT3, 'T3 no debe exponer alertas de asistencia');

const shortVisit = {
  id: 'short-visit',
  volunteer_id: volunteerId,
  day_key: 'jue 17',
  started_at: '2026-09-17T17:10:00.000Z',
  ended_at: '2026-09-17T17:40:00.000Z',
  status: 'completed',
};
const shortVisitDisplay = getShiftDisplayState(
  'jue 17', 'T2', consecutiveShifts[1], [shortVisit], consecutiveShifts, volunteerId,
  new Date('2026-09-21T18:00:00.000Z'),
);
assert.equal(shortVisitDisplay.status, 'completed', 'Una visita corta histórica debe mostrarse completada');
assertNoAttendanceAlert(shortVisitDisplay, 'Una visita corta no debe exponer alertas visuales en Turnos');
assert.equal(
  getShiftAttendanceReviewFlag(
    'jue 17', 'T2', consecutiveShifts[1], [shortVisit], consecutiveShifts, volunteerId,
    new Date('2026-09-21T18:00:00.000Z'),
  ),
  'Asistencia registrada, pero no supera el 50% del turno',
  'La visita corta debe conservarse en la cola de decisiones pendientes',
);

const staleOpenSession = {
  id: 'stale-open',
  volunteer_id: volunteerId,
  day_key: 'sáb 19',
  started_at: '2026-09-19T13:00:00.000Z',
  ended_at: null,
  status: 'open',
};
const staleShift = { id: 'stale-t1', volunteer_id: volunteerId, day_key: 'sáb 19', shift_key: 'T1' };
const staleDisplay = getShiftDisplayState(
  'sáb 19', 'T1', staleShift, [staleOpenSession], [staleShift], volunteerId,
  new Date('2026-09-21T18:00:00.000Z'),
);
assert.equal(staleDisplay.status, 'completed', 'Una sesión histórica abierta debe verse gris, no en turno');
assertNoAttendanceAlert(staleDisplay, 'Una salida pendiente histórica no debe exponer alertas visuales en Turnos');
assert.equal(
  getShiftAttendanceReviewFlag(
    'sáb 19', 'T1', staleShift, [staleOpenSession], [staleShift], volunteerId,
    new Date('2026-09-21T18:00:00.000Z'),
  ),
  'Salida pendiente: sesión abierta fuera del horario del turno',
  'La salida pendiente debe conservarse en la cola de decisiones pendientes',
);

console.log('Shift calculation regression tests passed.');
