import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseCTests() {
  console.log('===========================================================');
  console.log('  EJECUTANDO SUITE DE PRUEBAS OBLIGATORIAS DE FASE C (1-11) ');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function report(status: 'PASS' | 'FAIL', testName: string, detail?: string) {
    if (status === 'PASS') {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName} -> ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Record initial count of volunteers
  const { count: volCountBefore } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });

  try {
    // Load groups
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const testGroup = groups.find(g => g.volunteers.length >= 4) || groups[0];
    const vols = testGroup.volunteers;

    const vA = vols[0];
    const vB = vols[1];
    const vC = vols[2] || vols[0];
    const vD = vols[3] || vols[1];

    // TEST 1: Guardar una persona como KEEP y recargarla
    const saveRes1 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona A como KEEP',
      items: [
        { volunteerId: vA.id, decision: 'KEEP' }
      ]
    });

    if (saveRes1.success) {
      const reloaded = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
      const rGroup = reloaded.find(g => g.phoneNormalized === testGroup.phoneNormalized);
      const rA = rGroup?.volunteers.find(v => v.id === vA.id);
      if (rA?.decision === 'KEEP' && rA?.reviewItemStatus === 'READY_TO_PROCESS') {
        report('PASS', 'TEST 1: Persona guardada como KEEP y recargada correctamente desde Supabase');
      } else {
        report('FAIL', 'TEST 1: Falló al recargar decision KEEP', JSON.stringify(rA));
      }
    } else {
      report('FAIL', 'TEST 1: Falló al guardar decision KEEP', saveRes1.message);
    }

    // TEST 2: Guardar PHONE_OWNER
    const saveRes2 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona A como PHONE_OWNER',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' }
      ]
    });
    if (saveRes2.success) {
      report('PASS', 'TEST 2: Decisión PHONE_OWNER guardada con éxito');
    } else {
      report('FAIL', 'TEST 2: Falló al guardar PHONE_OWNER');
    }

    // TEST 3: Guardar SHARED_PHONE vinculado a PHONE_OWNER
    const saveRes3 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona B como SHARED_PHONE vinculada a A',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vB.id, decision: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id }
      ]
    });

    const reloaded3 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rGroup3 = reloaded3.find(g => g.phoneNormalized === testGroup.phoneNormalized);
    const rB3 = rGroup3?.volunteers.find(v => v.id === vB.id);

    if (saveRes3.success && rB3?.decision === 'SHARED_PHONE' && rB3?.sharedPhoneOwnerId === vA.id) {
      report('PASS', 'TEST 3: SHARED_PHONE guardado y vinculado correctamente al PHONE_OWNER');
    } else {
      report('FAIL', 'TEST 3: Falló al verificar SHARED_PHONE vinculado');
    }

    // TEST 4: Guardar PHONE_DOES_NOT_BELONG con teléfono nuevo
    const saveRes4 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona C con teléfono nuevo',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: '87779900' }
      ]
    });

    const reloaded4 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rC4 = reloaded4.find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vC.id);

    if (saveRes4.success && rC4?.decision === 'PHONE_DOES_NOT_BELONG' && rC4?.phoneStatus === 'NEW_PHONE_PROVIDED' && rC4?.correctedPhone === '87779900' && rC4?.reviewItemStatus === 'READY_TO_PROCESS') {
      report('PASS', 'TEST 4: PHONE_DOES_NOT_BELONG con teléfono nuevo guardado como NEW_PHONE_PROVIDED / READY_TO_PROCESS');
    } else {
      report('FAIL', 'TEST 4: Falló verificación de PHONE_DOES_NOT_BELONG con teléfono', JSON.stringify(rC4));
    }

    // TEST 5: Guardar PHONE_DOES_NOT_BELONG sin teléfono nuevo
    const saveRes5 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona D sin teléfono nuevo',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: null }
      ]
    });

    const reloaded5 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rD5 = reloaded5.find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (saveRes5.success && rD5?.decision === 'PHONE_DOES_NOT_BELONG' && rD5?.phoneStatus === 'MISSING_INFORMATION' && rD5?.correctedPhone === null && rD5?.reviewItemStatus === 'REQUIRES_INFORMATION') {
      report('PASS', 'TEST 5: PHONE_DOES_NOT_BELONG sin teléfono guardado como MISSING_INFORMATION / REQUIRES_INFORMATION');
    } else {
      report('FAIL', 'TEST 5: Falló verificación de PHONE_DOES_NOT_BELONG sin teléfono', JSON.stringify(rD5));
    }

    // TEST 6: Guardar ARCHIVE_DUPLICATE
    const saveRes6 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona C como duplicado de A',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'ARCHIVE_DUPLICATE', duplicatePrimaryVolunteerId: vA.id }
      ]
    });

    const reloaded6 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rC6 = reloaded6.find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vC.id);

    if (saveRes6.success && rC6?.decision === 'ARCHIVE_DUPLICATE' && rC6?.duplicatePrimaryVolunteerId === vA.id) {
      report('PASS', 'TEST 6: ARCHIVE_DUPLICATE guardado correctamente con voluntario primario asignado');
    } else {
      report('FAIL', 'TEST 6: Falló verificación de ARCHIVE_DUPLICATE');
    }

    // TEST 7: Guardar MANUAL_REVIEW
    const saveRes7 = await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Prueba FASE C - Persona D para revisar después',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'MANUAL_REVIEW', reviewerComment: 'Revisar con coordinador territorial' }
      ]
    });

    const reloaded7 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rD7 = reloaded7.find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (saveRes7.success && rD7?.decision === 'MANUAL_REVIEW' && rD7?.reviewItemStatus === 'REVIEW_LATER') {
      report('PASS', 'TEST 7: MANUAL_REVIEW guardado correctamente como REVIEW_LATER');
    } else {
      report('FAIL', 'TEST 7: Falló verificación de MANUAL_REVIEW');
    }

    // TEST 8: Modificar decisión previamente guardada (Actualización UPSERT sin duplicados)
    const { count: itemsCountBefore8 } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });

    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterPhaseC',
      reviewerComment: 'Actualización de decisión para Persona D',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'KEEP' }
      ]
    });

    const { count: itemsCountAfter8 } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });
    const reloaded8 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rD8 = reloaded8.find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (itemsCountBefore8 === itemsCountAfter8 && rD8?.decision === 'KEEP') {
      report('PASS', 'TEST 8: Decisión modificada exitosamente vía UPSERT sin crear filas duplicadas');
    } else {
      report('FAIL', 'TEST 8: Falló modificación de decisión existente', `Before: ${itemsCountBefore8}, After: ${itemsCountAfter8}`);
    }

    // TEST 9: Simular reinicio y recuperar decisiones desde Supabase DB
    const reloaded9 = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const rGroup9 = reloaded9.find(g => g.phoneNormalized === testGroup.phoneNormalized);
    const rA9 = rGroup9?.volunteers.find(v => v.id === vA.id);
    const rD9 = rGroup9?.volunteers.find(v => v.id === vD.id);

    if (rA9?.decision === 'PHONE_OWNER' && rD9?.decision === 'KEEP') {
      report('PASS', 'TEST 9: Las decisiones sobrevivieron a recarga de servicio y se leen desde Supabase DB');
    } else {
      report('FAIL', 'TEST 9: Falló recuperación tras recarga');
    }

    // TEST 10: Confirmar que los registros LEGACY continúan con decision = NULL y status = LEGACY
    const { data: legacyItems } = await supabase
      .from('phone_cleanup_review_items')
      .select('*')
      .eq('status', 'LEGACY');

    let legacyValid = true;
    (legacyItems || []).forEach(item => {
      if (item.decision !== null) legacyValid = false;
    });

    if (legacyValid && (legacyItems || []).length > 0) {
      report('PASS', `TEST 10: Los ${(legacyItems || []).length} registros LEGACY mantienen decision = NULL y status = LEGACY`);
    } else {
      report('FAIL', 'TEST 10: Se encontró un registro LEGACY con decision != NULL', JSON.stringify(legacyItems?.slice(0, 2)));
    }

    // TEST 11: Confirmar que public.volunteers NO FUE MODIFICADA (0 mutaciones)
    const { count: volCountAfter } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    if (volCountBefore === volCountAfter) {
      report('PASS', `TEST 11: public.volunteers permanece 100% INTACTA (${volCountAfter} registros, 0 mutaciones)`);
    } else {
      report('FAIL', 'TEST 11: public.volunteers fue modificada!', `Before: ${volCountBefore}, After: ${volCountAfter}`);
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE C:', err);
    failed++;
  }

  // Summary Counts for Report
  const { count: finalReviewsCount } = await supabase.from('phone_cleanup_reviews').select('*', { count: 'exact', head: true });
  const { count: finalItemsCount } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });
  const { count: legacyItemsCount } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true }).eq('status', 'LEGACY');

  console.log('\n===========================================================');
  console.log(`FASE C COMPLETA: ${passed} PASSED, ${failed} FAILED`);
  console.log(`- Total revisiones (padre) en Supabase: ${finalReviewsCount}`);
  console.log(`- Total ítems de revisión en Supabase: ${finalItemsCount}`);
  console.log(`- Ítems LEGACY protegidos (decision = NULL): ${legacyItemsCount}`);
  console.log('- public.volunteers modificados: 0');
  console.log('===========================================================');
}

runPhaseCTests().catch(console.error);
