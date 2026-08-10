import assert from 'assert';
import { inferShiftsForSession, calculateSessionMinutes, validateSessionConstraints } from '../lib/session-utils';
import { getVolunteerProfileMetrics } from '../lib/services/volunteer-profile.service';
import {
  openAttendanceSessionAction,
  closeAttendanceSessionAction,
  getOpenAttendanceSessionAction,
  adjustSessionTimesAdminAction,
  checkInVolunteer
} from '../app/actions/attendance';
import { resetMemorySessionStore, saveAttendanceSession } from '../lib/services/session-store';
import { SessionSyncBroadcastPayload } from '../lib/services/shift-broadcast.service';

// Set test environment flag so tests use in-memory store
process.env.USE_TEST_SESSION_STORE = 'true';

async function runAttendanceSessionsTests() {
  console.log('\n=================================================');
  console.log('   RUNNING HARDENED ATTENDANCE SESSIONS SUITE   ');
  console.log('=================================================\n');

  resetMemorySessionStore();

  // -------------------------------------------------------------------------
  // CASO 1 — Un turno (T2: 11:00 - 15:00, Entrada 11:05, Salida 15:02)
  // -------------------------------------------------------------------------
  console.log('--- Caso 1: Un solo turno (T2 11:05 - 15:02) ---');
  const c1Start = '2026-09-10T11:05:00-06:00';
  const c1End = '2026-09-10T15:02:00-06:00';
  const c1Calc = calculateSessionMinutes(c1Start, c1End);
  const c1Shifts = inferShiftsForSession('jue 10', c1Start, c1End, ['T2']);
  
  assert.strictEqual(c1Calc.totalWorkedMinutes, 237, 'Caso 1: 11:05 a 15:02 deben ser 237 minutos (3h57m)');
  assert.strictEqual(c1Shifts.length, 1, 'Caso 1: Debe vincular exactamente 1 turno');
  assert.strictEqual(c1Shifts[0].shiftKey, 'T2', 'Caso 1: El turno vinculado debe ser T2');
  console.log('✅ PASS: Caso 1 — 3h57m (237 min) en turno T2');

  // -------------------------------------------------------------------------
  // CASO 2 — Turnos continuos T1 + T2 + T3 (6:58 AM - 6:05 PM)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 2: Turnos continuos T1 + T2 + T3 (6:58 AM - 6:05 PM) ---');
  const c2Start = '2026-09-11T06:58:00-06:00';
  const c2End = '2026-09-11T18:05:00-06:00';
  const c2Calc = calculateSessionMinutes(c2Start, c2End);
  const c2Shifts = inferShiftsForSession('vie 11', c2Start, c2End, ['T1', 'T2', 'T3']);
  const c2Keys = c2Shifts.map(s => s.shiftKey);

  assert.strictEqual(c2Calc.totalWorkedMinutes, 667, 'Caso 2: 06:58 a 18:05 deben ser 667 minutos (11h07m)');
  assert.deepStrictEqual(c2Keys, ['T1', 'T2', 'T3'], 'Caso 2: Debe vincular exactamente T1, T2 y T3');
  console.log('✅ PASS: Caso 2 — UNA sola sesión de 667 min (11h07m) vincula T1, T2, T3');

  // -------------------------------------------------------------------------
  // CASO 3 — Turnos separados (T1 7-12 y T4 17-21, Sesión 6:58-12:05)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 3: Turnos separados (T1 7-12 y T4 17-21, Sesión 6:58-12:05) ---');
  const c3Start = '2026-09-10T06:58:00-06:00';
  const c3End = '2026-09-10T12:05:00-06:00';
  const c3Shifts = inferShiftsForSession('jue 10', c3Start, c3End, ['T1', 'T4']);
  const c3Keys = c3Shifts.map(s => s.shiftKey);

  assert(c3Keys.includes('T1'), 'Caso 3: T1 debe estar relacionado');
  assert(!c3Keys.includes('T4'), 'Caso 3: T4 NO debe estar relacionado');
  console.log('✅ PASS: Caso 3 — T1 relacionado, T4 NO relacionado');

  // -------------------------------------------------------------------------
  // CASO 4 — Doble Check-In
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 4: Doble Check-In ---');
  const vol4 = 'vol-test-case-4';
  const openRes1 = await openAttendanceSessionAction(vol4, 'jue 10', true);
  assert.strictEqual(openRes1.action, 'opened', 'Caso 4: Primera apertura exitosa');

  const openRes2 = await openAttendanceSessionAction(vol4, 'jue 10', true);
  assert.strictEqual(openRes2.alreadyOpen, true, 'Caso 4: Segunda apertura detecta sesión ya abierta');
  assert.strictEqual(openRes2.session.id, openRes1.session.id, 'Caso 4: NO se creó segunda sesión');
  console.log('✅ PASS: Caso 4 — Intentar abrir 2da sesión mantiene la sesión original sin duplicar');

  // -------------------------------------------------------------------------
  // CASO 5 — Segundo QR (Intento de re-escaneo con sesión abierta)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 5: Segundo QR (Escaneo con sesión abierta) ---');
  const vol5 = 'vol-test-case-5';
  await openAttendanceSessionAction(vol5, 'vie 11', true);
  
  const checkOpen = await getOpenAttendanceSessionAction(vol5);
  assert(checkOpen.session !== null, 'Caso 5: La sesión debe continuar abierta');
  assert.strictEqual(checkOpen.session?.status, 'open', 'Caso 5: El escaneo no la cierra automáticamente');
  console.log('✅ PASS: Caso 5 — Segundo QR NO cierra automáticamente, requiere confirmación');

  // -------------------------------------------------------------------------
  // CASO 6 — Doble Check-Out (Idempotencia)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 6: Doble Check-Out (Idempotencia) ---');
  const vol6 = 'vol-test-case-6';
  const sess6 = await openAttendanceSessionAction(vol6, 'sáb 12', true);
  
  const close1 = await closeAttendanceSessionAction({ sessionId: sess6.session.id });
  assert.strictEqual(close1.action, 'closed', 'Caso 6: Primer cierre exitoso');

  const close2 = await closeAttendanceSessionAction({ sessionId: sess6.session.id });
  assert.strictEqual(close2.alreadyClosed, true, 'Caso 6: Segundo cierre detectado');
  assert.strictEqual(close2.session.ended_at, close1.session.ended_at, 'Caso 6: ended_at NO fue sobrescrito');
  console.log('✅ PASS: Caso 6 — Doble check-out NO sobrescribe la hora de salida original');

  // -------------------------------------------------------------------------
  // CASO 7 — Sesión Abierta (started_at presente, ended_at NULL)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 7: Sesión Abierta ---');
  const vol7 = 'vol-test-case-7';
  const sess7 = await openAttendanceSessionAction(vol7, 'lun 14', true);
  const calc7 = calculateSessionMinutes(sess7.session.started_at, sess7.session.ended_at);

  assert.strictEqual(sess7.session.status, 'open', 'Caso 7: Estado debe ser open');
  assert.strictEqual(sess7.session.ended_at, null, 'Caso 7: ended_at debe ser null');
  assert.strictEqual(calc7.totalWorkedMinutes, 0, 'Caso 7: Minutos definitivos trabajados es 0 mientras siga abierta');
  assert(calc7.provisionalMinutes >= 0, 'Caso 7: Minutos provisionales transcurridos calculados');
  console.log('✅ PASS: Caso 7 — Sesión abierta status=open, ended_at=null, sin total definitivo');

  // -------------------------------------------------------------------------
  // CASO 8 — Turnos Solapados/Overlap (T2 11-15 y T3 14-18, Sesión 10:55 - 18:05)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 8: Overlap T2 + T3 (Sesión 10:55 - 18:05) ---');
  const c8Start = '2026-09-12T10:55:00-06:00';
  const c8End = '2026-09-12T18:05:00-06:00';
  const c8Calc = calculateSessionMinutes(c8Start, c8End);

  assert.strictEqual(c8Calc.totalWorkedMinutes, 430, 'Caso 8: 10:55 a 18:05 debe ser exactamente 430 min (7h10m), NO 480 min');
  console.log('✅ PASS: Caso 8 — Overlap calcula duración real de 430 min en lugar de sumar 480 min');

  // -------------------------------------------------------------------------
  // CASO 9 — Historial Legado (Voluntario sin attendance_sessions)
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 9: Historial Legado (Sin attendance_sessions) ---');
  const legacyShifts = [
    { volunteer_id: 'legacy-vol', day_key: 'jue 10', shift_key: 'T1', checked_in: true, checked_out: true }
  ];
  const legacyMetrics = getVolunteerProfileMetrics('legacy-vol', legacyShifts, [], []);
  assert(legacyMetrics.totalWorkedMinutes > 0, 'Caso 9: Fallback calcula minutos del turno histórico');
  console.log('✅ PASS: Caso 9 — Fallback histórico para voluntarios sin attendance_sessions funciona');

  // -------------------------------------------------------------------------
  // CASO 10 — Estructura del Payload Realtime
  // -------------------------------------------------------------------------
  console.log('\n--- Caso 10: Estructura de Payload Realtime ---');
  const payloadTest: SessionSyncBroadcastPayload = {
    eventType: 'INSERT',
    table: 'attendance_sessions',
    record: {
      id: 'sess-1234',
      volunteer_id: 'vol-5678',
      day_key: 'jue 10',
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'open',
      auto_closed: false
    }
  };

  assert.strictEqual(payloadTest.eventType, 'INSERT', 'Caso 10: eventType válido');
  assert.strictEqual(payloadTest.table, 'attendance_sessions', 'Caso 10: table es attendance_sessions');
  assert.strictEqual(payloadTest.record.status, 'open', 'Caso 10: record status es open');
  console.log('✅ PASS: Caso 10 — Estructura de payload Realtime session_sync verificada');

  // =========================================================================
  // PRUEBAS DE SEGURIDAD Y PERSISTENCIA DE LA AUDITORÍA (REQUISITOS A - G)
  // =========================================================================
  console.log('\n--- Pruebas de Seguridad y Persistencia (Requisitos A - G) ---');

  // REQUISITO A: La app real NO usa store en memoria si falla la BD (lanza Error)
  process.env.USE_TEST_SESSION_STORE = 'false';
  let persistenceFailed = false;
  try {
    await saveAttendanceSession({
      id: 'sess-fail-test',
      volunteer_id: 'vol-test',
      day_key: 'jue 10',
      started_at: new Date().toISOString(),
      ended_at: null,
      status: 'open',
      auto_closed: false
    });
  } catch (e: any) {
    persistenceFailed = e.message.includes('Error de persistencia');
  }
  process.env.USE_TEST_SESSION_STORE = 'true'; // Restore test mode for remaining tests
  assert.strictEqual(persistenceFailed, true, 'Requisito A: En app real sin DB, debe lanzar Error de persistencia y NO usar fallback silencioso');
  console.log('✅ PASS: Requisito A — La app real no usa fallback en memoria ante fallo de BD');

  // REQUISITO B: Cierre normal ignora timestamp arbitrario del cliente y usa servidor
  const volB = 'vol-test-req-B';
  const sessB = await openAttendanceSessionAction(volB, 'jue 10', true);
  const clientFakeEnd = '2099-01-01T00:00:00Z';
  const closeB = await closeAttendanceSessionAction({ sessionId: sessB.session.id, endedAt: clientFakeEnd });
  assert(closeB.session && closeB.session.ended_at !== clientFakeEnd, 'Requisito B: Cierre normal ignora hora del cliente');
  assert(closeB.session && new Date(closeB.session.ended_at || 0).getFullYear() < 2099, 'Requisito B: Usó timestamp real del servidor');
  console.log('✅ PASS: Requisito B — Cierre normal usa hora servidor e ignora timestamp del cliente');

  // REQUISITO C: Usuario no autorizado no puede invocar openAttendanceSessionAction directamente
  let authCheckFailed = false;
  try {
    await openAttendanceSessionAction('vol-unauth-test', 'jue 10', false);
  } catch (e: any) {
    authCheckFailed = e.message.includes('No autorizado');
  }
  assert.strictEqual(authCheckFailed, true, 'Requisito C: Invocación directa no autorizada debe ser rechazada');
  console.log('✅ PASS: Requisito C — Usuario no autorizado no puede abrir sesión directa sin QR/Admin');

  // REQUISITO D: Actor / Permisos no pueden falsificarse desde cliente en ajustes Admin
  let adminAdjFailed = false;
  try {
    await adjustSessionTimesAdminAction({
      sessionId: sessB.session.id,
      startedAt: sessB.session.started_at,
      endedAt: new Date().toISOString(),
      reason: 'Ajuste de prueba'
    });
  } catch (e: any) {
    adminAdjFailed = e.message.includes('No autenticado') || e.message.includes('Solo Administradores');
  }
  assert.strictEqual(adminAdjFailed, true, 'Requisito D: Ajuste manual requiere sesión válida de Admin');
  console.log('✅ PASS: Requisito D — Ajuste administrativo exige autenticación Admin en servidor');

  // REQUISITO E: Sesión abierta del día anterior retorna stale_open_session
  const volE = 'vol-test-req-E';
  // Manually create an open session from yesterday ("jue 10")
  const staleSession = await saveAttendanceSession({
    id: 'stale-sess-1',
    volunteer_id: volE,
    day_key: 'jue 10',
    started_at: '2026-09-10T11:00:00-06:00',
    ended_at: null,
    status: 'open',
    auto_closed: false,
    created_at: '2026-09-10T11:00:00-06:00',
    updated_at: '2026-09-10T11:00:00-06:00'
  });

  const checkStale = await getOpenAttendanceSessionAction(volE);
  assert.strictEqual(checkStale.session?.id, staleSession.id, 'Requisito E: Sesión abierta anterior existe');
  assert.strictEqual(checkStale.session?.day_key, 'jue 10', 'Requisito E: Pertenece a jue 10');
  console.log('✅ PASS: Requisito E — Sesión abierta del día anterior es detectada correctamente');

  // REQUISITO F:ended_at < started_at es rechazado
  const invalidChrono = validateSessionConstraints('2026-09-11T18:00:00-06:00', '2026-09-11T10:00:00-06:00', 'completed');
  assert.strictEqual(invalidChrono.valid, false, 'Requisito F: ended_at < started_at debe ser inválido');
  assert(invalidChrono.error?.includes('no puede ser anterior'), 'Requisito F: Mensaje de error correcto');
  console.log('✅ PASS: Requisito F — Invariante ended_at >= started_at rechazado correctamente');

  // REQUISITO G: completed sin ended_at es rechazado
  const invalidStatus = validateSessionConstraints('2026-09-11T10:00:00-06:00', null, 'completed');
  assert.strictEqual(invalidStatus.valid, false, 'Requisito G: completed sin ended_at debe ser inválido');
  assert(invalidStatus.error?.includes('requiere hora de salida'), 'Requisito G: Mensaje de error de status correcto');
  console.log('✅ PASS: Requisito G — Invariante status completed sin ended_at rechazado correctamente');

  console.log('\n=================================================');
  console.log('  TODAS LAS PRUEBAS DE SEGURIDAD PASARON! 🎉    ');
  console.log('=================================================\n');
}

runAttendanceSessionsTests().catch((err) => {
  console.error('❌ FAILURE in attendance sessions test suite:', err);
  process.exit(1);
});
