import { getVolunteerProfileMetrics } from '../lib/services/volunteer-profile.service';
import { processShiftsData } from '../lib/coordinator-data';
import { calculateSessionMinutes, inferShiftsForSession } from '../lib/session-utils';

const KENDYR_ID = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';

async function testDebug() {
  const kendyrShifts = [
    { id: 'sh-vie11-t2', volunteer_id: KENDYR_ID, day_key: 'vie 11', shift_key: 'T2', checked_in: true, checked_out: true }, // Legacy 240
    { id: 'sh-sab12-t1', volunteer_id: KENDYR_ID, day_key: 'sáb 12', shift_key: 'T1', checked_in: true, checked_out: true }, // Legacy 300
    { id: 'sh-sab19-t1', volunteer_id: KENDYR_ID, day_key: 'sáb 19', shift_key: 'T1', checked_in: true, checked_out: true },
  ];

  const sessionC = {
    id: 'sess-c',
    volunteer_id: KENDYR_ID,
    day_key: 'sáb 19',
    started_at: '2026-09-19T12:58:00.000Z', // 6:58 AM
    ended_at: '2026-09-20T00:05:00.000Z',   // 6:05 PM
    status: 'completed'
  };

  // Test Caso H
  const profileH = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], [sessionC]);
  console.log('Caso H Debug:', {
    totalWorkedMinutes: profileH.totalWorkedMinutes,
    display: profileH.totalWorkedDisplay
  });

  // Test Caso E
  const sessionE = {
    id: 'sess-e',
    volunteer_id: KENDYR_ID,
    day_key: 'vie 11',
    started_at: '2026-09-11T16:58:00.000Z', // 10:58 AM
    ended_at: null,
    status: 'open'
  };

  const procE = processShiftsData(
    [
      { id: 's1', volunteer_id: KENDYR_ID, day_key: 'vie 11', shift_key: 'T2' },
      { id: 's2', volunteer_id: KENDYR_ID, day_key: 'vie 11', shift_key: 'T4' },
    ],
    [{ id: KENDYR_ID }],
    [sessionE]
  );

  console.log('Caso E Debug sessionOpenShiftKeys:', procE.sessionOpenShiftKeys);
}

testDebug().catch(console.error);
