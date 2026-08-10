import { getVolunteerProfileMetrics } from '../lib/services/volunteer-profile.service';
import { inferShiftsForSession, calculateSessionMinutes } from '../lib/session-utils';

const KENDYR_ID = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';

async function runUiAudit() {
  console.log('===========================================================');
  console.log('  UI RENDERING & DATA SOURCE AUDIT (SCENARIOS A - E)       ');
  console.log('===========================================================\n');

  // Kendyr Assigned Shifts (Clean - 0 legacy flags)
  const kendyrShifts = [
    { id: 'shift-vie11-t2', volunteer_id: KENDYR_ID, day_key: 'vie 11', shift_key: 'T2', checked_in: false, checked_out: false },
    { id: 'shift-vie11-t4', volunteer_id: KENDYR_ID, day_key: 'vie 11', shift_key: 'T4', checked_in: false, checked_out: false },
    { id: 'shift-sab19-t1', volunteer_id: KENDYR_ID, day_key: 'sáb 19', shift_key: 'T1', checked_in: false, checked_out: false },
    { id: 'shift-sab19-t2', volunteer_id: KENDYR_ID, day_key: 'sáb 19', shift_key: 'T2', checked_in: false, checked_out: false },
    { id: 'shift-sab19-t3', volunteer_id: KENDYR_ID, day_key: 'sáb 19', shift_key: 'T3', checked_in: false, checked_out: false },
  ];

  // ----------------------------------------------------------------------
  // ESCENARIO A: SESIÓN ABIERTA (vie 11, 10:58 AM, ended_at: null, status: open)
  // ----------------------------------------------------------------------
  console.log('--- ESCENARIO A: SESIÓN ABIERTA (10:58 AM - En Servicio a las 12:30 PM) ---');
  const sessionA = [
    {
      id: 'sess-a',
      volunteer_id: KENDYR_ID,
      day_key: 'vie 11',
      started_at: '2026-09-11T16:58:00.000Z', // 10:58 AM America/Managua (UTC-6 = 16:58 UTC)
      ended_at: null,
      status: 'open',
      auto_closed: false
    }
  ];

  const profileA = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], sessionA);
  console.log('Metrics Profile A:');
  console.log(`  - isCheckedInNow: ${profileA.isCheckedInNow}`);
  console.log(`  - activeSession:`, profileA.activeSession);
  console.log(`  - totalWorkedMinutes: ${profileA.totalWorkedMinutes} (Total Definitivo Esperado: 0 min mientras está OPEN)`);
  console.log(`  - totalWorkedDisplay: "${profileA.totalWorkedDisplay}"`);
  console.log(`  - kpiValue: "${profileA.kpiValue}" | kpiLabel: "${profileA.kpiLabel}"`);
  console.log(`  - Turnos Relacionados en activeSession:`, profileA.activeSession?.relatedShiftKeys);

  // ----------------------------------------------------------------------
  // ESCENARIO B: SESIÓN COMPLETADA NORMAL (vie 11, 10:58 AM - 3:07 PM)
  // ----------------------------------------------------------------------
  console.log('\n--- ESCENARIO B: SESIÓN COMPLETADA NORMAL (10:58 AM - 3:07 PM) ---');
  const sessionB = [
    {
      id: 'sess-b',
      volunteer_id: KENDYR_ID,
      day_key: 'vie 11',
      started_at: '2026-09-11T16:58:00.000Z', // 10:58 AM Managua
      ended_at: '2026-09-11T21:07:00.000Z',   // 3:07 PM Managua
      status: 'completed',
      auto_closed: false
    }
  ];

  const profileB = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], sessionB);
  console.log('Metrics Profile B:');
  console.log(`  - totalWorkedMinutes: ${profileB.totalWorkedMinutes} min (Esperado: 249 min / 4h09m)`);
  console.log(`  - totalWorkedDisplay: "${profileB.totalWorkedDisplay}"`);
  console.log(`  - kpiValue: "${profileB.kpiValue}" | kpiLabel: "${profileB.kpiLabel}"`);
  console.log(`  - completedShiftsCount: ${profileB.completedShiftsCount}`);
  console.log(`  - Turnos Relacionados en Session:`, profileB.sessionsList[0]?.relatedShiftKeys);

  // ----------------------------------------------------------------------
  // ESCENARIO C: SESIÓN MULTI-TURNO T1 + T2 + T3 (sáb 19, 6:58 AM - 6:05 PM)
  // ----------------------------------------------------------------------
  console.log('\n--- ESCENARIO C: SESIÓN MULTI-TURNO T1 + T2 + T3 (6:58 AM - 6:05 PM) ---');
  const sessionC = [
    {
      id: 'sess-c',
      volunteer_id: KENDYR_ID,
      day_key: 'sáb 19',
      started_at: '2026-09-19T12:58:00.000Z', // 6:58 AM Managua
      ended_at: '2026-09-20T00:05:00.000Z',   // 6:05 PM Managua
      status: 'completed',
      auto_closed: false
    }
  ];

  const profileC = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], sessionC);
  console.log('Metrics Profile C:');
  console.log(`  - totalWorkedMinutes: ${profileC.totalWorkedMinutes} min (Esperado: 667 min / 11h07m)`);
  console.log(`  - totalWorkedDisplay: "${profileC.totalWorkedDisplay}"`);
  console.log(`  - kpiValue: "${profileC.kpiValue}" | kpiLabel: "${profileC.kpiLabel}"`);
  console.log(`  - completedShiftsCount: ${profileC.completedShiftsCount} (Esperado: 3 turnos cubiertos)`);
  console.log(`  - Turnos Relacionados en Session:`, profileC.sessionsList[0]?.relatedShiftKeys);

  // ----------------------------------------------------------------------
  // ESCENARIO D: SESIÓN PENDIENTE DEL DÍA ANTERIOR
  // ----------------------------------------------------------------------
  console.log('\n--- ESCENARIO D: SESIÓN PENDIENTE DEL DÍA ANTERIOR (started vie 11 11:02 AM, ended_at null, hoy sáb 12) ---');
  const sessionD = [
    {
      id: 'sess-d',
      volunteer_id: KENDYR_ID,
      day_key: 'vie 11',
      started_at: '2026-09-11T17:02:00.000Z', // vie 11 11:02 AM Managua
      ended_at: null,
      status: 'open',
      auto_closed: false
    }
  ];

  const profileD = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], sessionD);
  console.log('Metrics Profile D:');
  console.log(`  - activeSession:`, profileD.activeSession);
  console.log(`  - totalWorkedMinutes: ${profileD.totalWorkedMinutes} min`);

  // ----------------------------------------------------------------------
  // ESCENARIO E: AUTO_CLOSED = TRUE
  // ----------------------------------------------------------------------
  console.log('\n--- ESCENARIO E: SESIÓN AUTO_CLOSED = TRUE ---');
  const sessionE = [
    {
      id: 'sess-e',
      volunteer_id: KENDYR_ID,
      day_key: 'vie 11',
      started_at: '2026-09-11T17:00:00.000Z',
      ended_at: '2026-09-11T21:00:00.000Z',
      status: 'completed',
      auto_closed: true
    }
  ];

  const profileE = getVolunteerProfileMetrics(KENDYR_ID, kendyrShifts, [], sessionE);
  console.log('Metrics Profile E:');
  console.log(`  - sessionsList item:`, profileE.sessionsList[0]);
}

runUiAudit().catch(console.error);
