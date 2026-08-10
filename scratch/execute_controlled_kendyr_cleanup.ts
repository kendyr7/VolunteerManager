import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceKey);

const KENDYR_ID = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';
const TARGET_SHIFT_IDS = [
  '6a0b2e0e-2382-4b51-8106-2fcaecee5e35', // lun 14 T4
  'cf06bfec-6cbd-4c21-85c8-ad60e87cc84f', // vie 11 T2
  '6f39d888-0c91-498a-96ca-ef1cf8083862', // vie 11 T4
  'e0411fc7-bb8e-4280-b5d0-a7902960c513', // sáb 12 T3
];

async function runControlledCleanup() {
  console.log('===========================================================');
  console.log('  CONTROLLED CLEANUP FOR KENDYR GABRIEL QUINTANILLA ESTRADA  ');
  console.log('===========================================================\n');

  // STEP 1: PRE-VALIDATION
  console.log('--- 1. VALIDACIÓN PREVIA DE PROPIEDAD DE SHIFTS ---');
  const { data: shiftCheck, error: checkErr } = await adminClient
    .from('shifts')
    .select('id, volunteer_id, day_key, shift_key, checked_in, checked_out')
    .in('id', TARGET_SHIFT_IDS);

  if (checkErr) {
    console.error('❌ Error consultando shifts objetivos:', checkErr.message);
    return;
  }

  console.log(`Shifts encontrados: ${shiftCheck?.length || 0} de 4 declarados.`);

  if (shiftCheck?.length !== 4) {
    console.error('❌ ERROR CRÍTICO: No se encontraron los 4 shift IDs objetivos. ABORTANDO.');
    return;
  }

  const mismatch = shiftCheck.filter(s => s.volunteer_id !== KENDYR_ID);
  if (mismatch.length > 0) {
    console.error('❌ ERROR CRÍTICO: Hay shifts que no pertenecen a Kendyr:', mismatch);
    return;
  }

  console.log('✅ PRE-VALIDACIÓN EXITOSA: Los 4 shifts pertenecen 100% a Kendyr Gabriel Quintanilla Estrada.');
  shiftCheck.forEach(s => {
    console.log(`  - ID: ${s.id} (${s.day_key} ${s.shift_key}) | In: ${s.checked_in} | Out: ${s.checked_out}`);
  });

  // STEP 2: CONTROLLED UPDATE
  console.log('\n--- 2. EJECUTANDO UPDATE CONTROLADO SOBRE LOS 4 SHIFTS ---');
  const nowIso = new Date().toISOString();

  const { data: updatedShifts, error: updateErr } = await adminClient
    .from('shifts')
    .update({
      checked_in: false,
      checked_in_at: null,
      checked_in_by: null,
      checked_out: false,
      checked_out_at: null,
      updated_at: nowIso
    })
    .in('id', TARGET_SHIFT_IDS)
    .select('id, day_key, shift_key, checked_in, checked_out');

  if (updateErr) {
    console.error('❌ Error actualizando shifts:', updateErr.message);
    return;
  }

  console.log(`Filas modificadas reportadas por Supabase: ${updatedShifts?.length || 0}`);

  if (updatedShifts?.length !== 4) {
    console.error(`❌ ERROR CRÍTICO: Se esperaban 4 filas modificadas pero se obtuvieron ${updatedShifts?.length}. ABORTANDO.`);
    return;
  }

  console.log('✅ UPDATE EXITOSO: 4/4 shifts modificados correctamente a estado Programado (CheckedIn=false, CheckedOut=false).');

  // STEP 3: CREATE NEW ACTIVITY LOG
  console.log('\n--- 3. REGISTRANDO LOG DE CONTROL EN activity_logs ---');
  const logPayload = {
    user_name: 'Administrador',
    user_role: 'Admin',
    action_type: 'Reinicio Pruebas',
    description: 'Se restablecieron las marcas legacy de asistencia de Kendyr Gabriel Quintanilla Estrada para iniciar prueba controlada de attendance_sessions',
    details: JSON.stringify({
      volunteerId: KENDYR_ID,
      volunteerName: 'Kendyr Gabriel Quintanilla Estrada',
      targetShiftIds: TARGET_SHIFT_IDS,
      reason: 'Limpieza previa a prueba controlada de attendance_sessions',
      timestamp: nowIso
    }),
    target_id: KENDYR_ID
  };

  const { data: newLog, error: logErr } = await adminClient
    .from('activity_logs')
    .insert(logPayload)
    .select('*')
    .single();

  if (logErr) {
    console.error('❌ Error creando activity log:', logErr.message);
  } else {
    console.log('✅ Log de Reinicio Pruebas creado exitosamente con ID:', newLog.id);
  }

  // STEP 4: POST-EXECUTION VERIFICATION
  console.log('\n--- 4. VERIFICACIÓN FINAL POSTERIOR ---');
  const { data: all24Shifts } = await adminClient
    .from('shifts')
    .select('id, day_key, shift_key, checked_in, checked_in_at, checked_out, checked_out_at')
    .eq('volunteer_id', KENDYR_ID);

  const nonCleanShifts = (all24Shifts || []).filter(s => s.checked_in || s.checked_out || s.checked_in_at || s.checked_out_at);

  console.log(`   - Total de turnos de Kendyr en BD: ${all24Shifts?.length || 0}`);
  console.log(`   - Turnos sin limpiar restantes: ${nonCleanShifts.length} ${nonCleanShifts.length === 0 ? '✅ (24/24 limpios)' : '❌'}`);

  const { count: sessionCount } = await adminClient
    .from('attendance_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('volunteer_id', KENDYR_ID);

  console.log(`   - attendance_sessions de Kendyr: ${sessionCount} (Esperado: 0) ${sessionCount === 0 ? '✅' : '❌'}`);

  const { data: allLogs } = await adminClient
    .from('activity_logs')
    .select('id, action_type, description, created_at')
    .or(`target_id.eq.${KENDYR_ID},description.ilike.%Kendyr%`)
    .order('created_at', { ascending: false });

  console.log(`   - Total activity_logs de Kendyr: ${allLogs?.length || 0} (Esperado: 16) ${allLogs?.length === 16 ? '✅' : '❌'}`);
  console.log('   - Último log registrado:', allLogs?.[0]);
}

runControlledCleanup().catch(console.error);
