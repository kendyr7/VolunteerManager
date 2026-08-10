import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';
import { saveShiftsAction, toggleShiftAction } from '../app/actions/volunteer-actions';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, supabaseKey);

async function runShiftSaveFlowTests() {
  console.log('===========================================================');
  console.log('  RUNNING SHIFT SAVE FLOW AUTOMATED TESTS (CASES A, B, C, D)');
  console.log('===========================================================\n');

  // Fetch a real volunteer ID
  const { data: vol } = await adminClient.from('volunteers').select('id, first_name').limit(1).single();
  if (!vol) {
    throw new Error('No volunteer found in DB for testing');
  }
  const volunteerId = vol.id;
  console.log(`Using test volunteer: ID=${volunteerId}, Name=${vol.first_name}\n`);

  // Clean slate: clear all shifts for test volunteer
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);

  // --- CASE A: Entrar en edición sin cambios -> Guardar ---
  console.log('--- CASE A: Edit mode entered without changes -> Save ---');
  const caseA_res = await saveShiftsAction(volunteerId, {});
  console.log('Case A Result:', caseA_res);
  const { data: shiftsA } = await adminClient.from('shifts').select('*').eq('volunteer_id', volunteerId);
  const caseA_passed = caseA_res.success === true && (shiftsA?.length ?? 0) === 0;
  console.log(`Case A Passed? ${caseA_passed ? '✅ YES' : '❌ NO'}\n`);

  // --- CASE B: Agregar un turno -> Guardar ---
  console.log('--- CASE B: Add 1 shift (2026-08-25 T1) -> Save ---');
  const toggleB_res = await toggleShiftAction(volunteerId, '2026-08-25', 'T1', true);
  console.log('Case B Toggle Result:', toggleB_res);
  const saveB_res = await saveShiftsAction(volunteerId, { '2026-08-25': ['T1'] });
  console.log('Case B Save Result:', saveB_res);
  const { data: shiftsB } = await adminClient.from('shifts').select('*').eq('volunteer_id', volunteerId);
  const caseB_passed = saveB_res.success === true && shiftsB?.length === 1 && shiftsB[0].shift_key === 'T1';
  console.log(`Case B Passed? ${caseB_passed ? '✅ YES' : '❌ NO'}\n`);

  // --- CASE C: Eliminar un turno -> Guardar ---
  console.log('--- CASE C: Delete shift (2026-08-25 T1) -> Save ---');
  const toggleC_res = await toggleShiftAction(volunteerId, '2026-08-25', 'T1', false);
  console.log('Case C Toggle Result:', toggleC_res);
  const saveC_res = await saveShiftsAction(volunteerId, {});
  console.log('Case C Save Result:', saveC_res);
  const { data: shiftsC } = await adminClient.from('shifts').select('*').eq('volunteer_id', volunteerId);
  const caseC_passed = saveC_res.success === true && (shiftsC?.length ?? 0) === 0;
  console.log(`Case C Passed? ${caseC_passed ? '✅ YES' : '❌ NO'}\n`);

  // --- CASE D: Agregar y eliminar varios turnos -> Guardar ---
  console.log('--- CASE D: Add and remove multiple shifts -> Save ---');
  // First toggle T1, T2, T3
  await toggleShiftAction(volunteerId, '2026-08-25', 'T1', true);
  await toggleShiftAction(volunteerId, '2026-08-25', 'T2', true);
  await toggleShiftAction(volunteerId, '2026-08-26', 'T3', true);
  // Batch save new set: '2026-08-25': ['T2'], '2026-08-26': ['T4']
  const saveD_res = await saveShiftsAction(volunteerId, {
    '2026-08-25': ['T2'],
    '2026-08-26': ['T4'],
  });
  console.log('Case D Save Result:', saveD_res);
  const { data: shiftsD } = await adminClient.from('shifts').select('*').eq('volunteer_id', volunteerId);
  const caseD_hasT2 = shiftsD?.some(s => s.day_key === '2026-08-25' && s.shift_key === 'T2');
  const caseD_hasT4 = shiftsD?.some(s => s.day_key === '2026-08-26' && s.shift_key === 'T4');
  const caseD_passed = saveD_res.success === true && shiftsD?.length === 2 && caseD_hasT2 && caseD_hasT4;
  console.log(`Case D Passed? ${caseD_passed ? '✅ YES' : '❌ NO'}\n`);

  // Cleanup test shifts
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);

  console.log('===========================================================');
  console.log('  SUMMARY OF SAVE FLOW TESTS:');
  console.log(`  Case A (No changes): ${caseA_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Case B (Add shift):  ${caseB_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Case C (Del shift):  ${caseC_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Case D (Multiple):   ${caseD_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('===========================================================');

  if (caseA_passed && caseB_passed && caseC_passed && caseD_passed) {
    console.log('\n✨ ALL 4 SHIFT SAVE CASES COMPLETED AND VERIFIED 100% SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runShiftSaveFlowTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
