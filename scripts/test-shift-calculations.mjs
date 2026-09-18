import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const {
  findAttendanceSessionForShift,
  getShiftDisplayState,
} = jiti('../lib/shift-calculations.ts');

const volunteerId = 'volunteer-regression';

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
  { status: 'scheduled', startAt: null, endAt: null, flag: null },
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
assert.equal(
  getShiftDisplayState(
    'lun 14', 'T2', null, [mondaySession], mondayShifts, volunteerId,
  ).flag,
  null,
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
assert.equal(displayT1.flag, null, 'T1 no debe tener alerta');

const displayT2 = getShiftDisplayState('jue 17', 'T2', consecutiveShifts[1], [sessionT2Only], consecutiveShifts, volunteerId);
assert.equal(displayT2.status, 'completed', 'T2 debe completarse con éxito');
assert.equal(displayT2.flag, null, 'T2 no debe tener alerta');

const displayT3 = getShiftDisplayState('jue 17', 'T3', consecutiveShifts[2], [sessionT2Only], consecutiveShifts, volunteerId);
assert.equal(displayT3.status, 'scheduled', 'T3 debe permanecer scheduled sin alertar por el traslape de entrega');
assert.equal(displayT3.flag, null, 'T3 no debe tener alerta');

console.log('Shift calculation regression tests passed.');
