// Regression tests for performance changes. No database access.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { fsCache: false, alias: { '@': path.resolve(__dirname, '..') } });
const { getGuatemalaHourFloat } = jiti('../lib/session-utils.ts');
const { getGuatemalaDate } = jiti('../lib/scan-history.ts');
const { processShiftsData, buildShiftScheduleData } = jiti('../lib/coordinator-data.ts');
const { retainEqualSnapshot } = jiti('../lib/utils/stable-snapshot.ts');
const { useVolunteerStore } = jiti('../lib/store/use-volunteer-store.ts');

// Midnight, day rollover, seconds, offsets, leap day and invalid input.
for (const [input, hour, day] of [
  ['2026-09-14T06:00:00Z', 0, '2026-09-14'],
  ['2026-09-14T05:59:59Z', 23 + 59 / 60 + 59 / 3600, '2026-09-13'],
  ['2026-09-14T13:30:45-06:00', 13 + 30 / 60 + 45 / 3600, '2026-09-14'],
  ['2024-03-01T05:00:00Z', 23, '2024-02-29'],
]) {
  assert.equal(getGuatemalaHourFloat(input), hour);
  assert.equal(getGuatemalaHourFloat(new Date(input)), hour);
  assert.equal(getGuatemalaDate(input), day);
}
assert.equal(getGuatemalaHourFloat('invalid'), 0);
assert.equal(getGuatemalaDate('invalid'), '');

const volunteers = [{ id: 'v1', committees: { name: 'Seguridad' } }];
const shifts = ['T1', 'T2'].map(shift_key => ({ id: shift_key, volunteer_id: 'v1', day_key: 'lun 14', shift_key }));
const sessions = [{ id: 'a1', volunteer_id: 'v1', day_key: 'lun 14', started_at: '2026-09-14T08:00:00-06:00', ended_at: null, status: 'open' }];
const schedule = buildShiftScheduleData(shifts, volunteers);
const before = processShiftsData(shifts, volunteers, sessions, new Date('2026-09-14T11:00:00-06:00'), schedule);
const after = processShiftsData(shifts, volunteers, sessions, new Date('2026-09-14T12:01:00-06:00'), schedule);
assert.equal(before.globalShifts, after.globalShifts);
assert.equal(before.shiftCounts, after.shiftCounts);
assert.equal(before.indexedAssignments, after.indexedAssignments);
assert.ok(!before.sessionCompletedShiftKeys['v1-lun 14-T1']);
assert.ok(after.sessionCompletedShiftKeys['v1-lun 14-T1']);
assert.deepEqual(after, processShiftsData(shifts, volunteers, sessions, new Date('2026-09-14T12:01:00-06:00')));

assert.equal(retainEqualSnapshot(volunteers, structuredClone(volunteers)), volunteers);
assert.notEqual(retainEqualSnapshot(volunteers, []), volunteers);
assert.notEqual(retainEqualSnapshot(volunteers, [{ ...volunteers[0], phone: '12345678' }]), volunteers);
useVolunteerStore.getState().setInitialVolunteers(volunteers);
useVolunteerStore.getState().setInitialShifts(shifts);
const store = useVolunteerStore.getState();
useVolunteerStore.getState().setInitialVolunteers(structuredClone(volunteers));
useVolunteerStore.getState().setInitialShifts(structuredClone(shifts));
assert.equal(useVolunteerStore.getState().volunteersMap, store.volunteersMap);
assert.equal(useVolunteerStore.getState().shiftsMap, store.shiftsMap);
useVolunteerStore.getState().setInitialVolunteers([]);
assert.equal(useVolunteerStore.getState().volunteersMap.size, 0);
console.log('PASS timezone boundaries, stable schedule indexes, attendance transitions, unchanged polls, edits and deletions');
