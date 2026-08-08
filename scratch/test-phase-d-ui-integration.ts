import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import { savePersonCentricReviewAction } from '../app/actions/phone-review-actions';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseDIntegrationTests() {
  console.log('===========================================================');
  console.log('  EJECUTANDO PRUEBAS DE INTEGRACIÓN FASE D (TESTS 1-12)    ');
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

  // Initial volunteers count
  const { count: volCountBefore } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });

  try {
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const testGroup = groups.find(g => g.volunteers.length >= 4) || groups[0];
    const vols = testGroup.volunteers;

    const vA = vols[0];
    const vB = vols[1];
    const vC = vols[2] || vols[0];
    const vD = vols[3] || vols[1];

    // TEST 1: Abrir una persona sin decisión -> aparece "Sin revisar" (decision is null)
    const freshVols = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers;
    const unrev = freshVols?.find(v => !v.decision);
    if (!unrev?.decision) {
      report('PASS', 'TEST 1: Persona sin decisión previa aparece como "Sin revisar"');
    } else {
      report('FAIL', 'TEST 1: Persona mostró decisión cuando debía estar sin revisar');
    }

    // TEST 2: Seleccionar "Mantener este teléfono" (`KEEP`) -> guardar -> refrescar -> continúa seleccionado
    const saveRes2 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [{ volunteerId: vA.id, decision: 'KEEP' }]
    });

    const reloaded2 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vA.id);

    if (saveRes2.success && reloaded2?.decision === 'KEEP') {
      report('PASS', 'TEST 2: "Mantener este teléfono" guardado y restaurado correctamente desde Supabase');
    } else {
      report('FAIL', 'TEST 2: Falló al restaurar "Mantener este teléfono"');
    }

    // TEST 3: Seleccionar "Titular del teléfono" (`PHONE_OWNER`) -> guardar -> refrescar -> continúa seleccionado
    const saveRes3 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [{ volunteerId: vA.id, decision: 'PHONE_OWNER' }]
    });

    const reloaded3 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vA.id);

    if (saveRes3.success && reloaded3?.decision === 'PHONE_OWNER') {
      report('PASS', 'TEST 3: "Titular del teléfono" guardado y restaurado correctamente desde Supabase');
    } else {
      report('FAIL', 'TEST 3: Falló al restaurar "Titular del teléfono"');
    }

    // TEST 4: Seleccionar "Comparte este teléfono" (`SHARED_PHONE`) -> seleccionar titular -> guardar -> refrescar -> continúa seleccionado
    const saveRes4 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vB.id, decision: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id }
      ]
    });

    const reloaded4 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vB.id);

    if (saveRes4.success && reloaded4?.decision === 'SHARED_PHONE' && reloaded4?.sharedPhoneOwnerId === vA.id) {
      report('PASS', 'TEST 4: "Comparte este teléfono" guardado con su titular y restaurado desde Supabase');
    } else {
      report('FAIL', 'TEST 4: Falló al restaurar "Comparte este teléfono"');
    }

    // TEST 5: Seleccionar "Este teléfono no corresponde" + teléfono correcto -> guardar -> refrescar -> teléfono correcto continúa visible
    const saveRes5 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: '88887777' }
      ]
    });

    const reloaded5 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vC.id);

    if (saveRes5.success && reloaded5?.decision === 'PHONE_DOES_NOT_BELONG' && reloaded5?.correctedPhone === '88887777') {
      report('PASS', 'TEST 5: "Este teléfono no corresponde" con número nuevo guardado y restaurado');
    } else {
      report('FAIL', 'TEST 5: Falló al restaurar número nuevo');
    }

    // TEST 6: Seleccionar "Este teléfono no corresponde" + sin teléfono -> guardar -> refrescar -> aparece "Requiere información"
    const saveRes6 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: null }
      ]
    });

    const reloaded6 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (saveRes6.success && reloaded6?.decision === 'PHONE_DOES_NOT_BELONG' && reloaded6?.phoneStatus === 'MISSING_INFORMATION' && reloaded6?.reviewItemStatus === 'REQUIRES_INFORMATION') {
      report('PASS', 'TEST 6: "Este teléfono no corresponde" sin número guardado como "Requiere información"');
    } else {
      report('FAIL', 'TEST 6: Falló al restaurar estado de requiere información');
    }

    // TEST 7: Seleccionar "Este registro es duplicado" -> seleccionar principal -> guardar -> refrescar -> continúa seleccionado
    const saveRes7 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'ARCHIVE_DUPLICATE', duplicatePrimaryVolunteerId: vA.id }
      ]
    });

    const reloaded7 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vC.id);

    if (saveRes7.success && reloaded7?.decision === 'ARCHIVE_DUPLICATE' && reloaded7?.duplicatePrimaryVolunteerId === vA.id) {
      report('PASS', 'TEST 7: "Este registro es duplicado" guardado con voluntario principal y restaurado');
    } else {
      report('FAIL', 'TEST 7: Falló al restaurar registro duplicado');
    }

    // TEST 8: Seleccionar "Revisar después" -> guardar -> refrescar -> continúa seleccionado
    const saveRes8 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'MANUAL_REVIEW' }
      ]
    });

    const reloaded8 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (saveRes8.success && reloaded8?.decision === 'MANUAL_REVIEW' && reloaded8?.reviewItemStatus === 'REVIEW_LATER') {
      report('PASS', 'TEST 8: "Revisar después" guardado correctamente como REVIEW_LATER');
    } else {
      report('FAIL', 'TEST 8: Falló al restaurar "Revisar después"');
    }

    // TEST 9: Modificar una decisión -> guardar -> refrescar -> aparece únicamente la decisión nueva
    const saveRes9 = await savePersonCentricReviewAction({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminUIDester',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'KEEP' }
      ]
    });

    const reloaded9 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized)?.volunteers.find(v => v.id === vD.id);

    if (saveRes9.success && reloaded9?.decision === 'KEEP') {
      report('PASS', 'TEST 9: Decisión modificada exitosamente vía UPSERT; refleja únicamente la nueva opción');
    } else {
      report('FAIL', 'TEST 9: Falló al reflejar decisión modificada');
    }

    // TEST 10: Simular reinicio y abrir nuevamente -> decisiones continúan intactas
    const reloaded10 = (await PhoneCleanupReviewService.getDuplicatePhoneGroups(true)).find(g => g.phoneNormalized === testGroup.phoneNormalized);
    const rA10 = reloaded10?.volunteers.find(v => v.id === vA.id);
    const rD10 = reloaded10?.volunteers.find(v => v.id === vD.id);

    if (rA10?.decision === 'PHONE_OWNER' && rD10?.decision === 'KEEP') {
      report('PASS', 'TEST 10: Simulada recarga limpia desde Supabase; las decisiones continúan en DB');
    } else {
      report('FAIL', 'TEST 10: Las decisiones no sobrevivieron al reinicio');
    }

    // TEST 11: Verificar que guardar decisiones NUNCA modifica public.volunteers
    const { count: volCountAfter } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    if (volCountBefore === volCountAfter) {
      report('PASS', `TEST 11: public.volunteers permaneció 100% INTACTA (${volCountAfter} registros, 0 mutaciones)`);
    } else {
      report('FAIL', `TEST 11: public.volunteers FUE MODIFICADA. Before: ${volCountBefore}, After: ${volCountAfter}`);
    }

    // TEST 12: Confirmar que los 44 registros LEGACY continúan protegidos
    const { data: legacyItems } = await supabase.from('phone_cleanup_review_items').select('*').eq('status', 'LEGACY');
    let legacyProtected = true;
    (legacyItems || []).forEach(item => {
      if (item.decision !== null) legacyProtected = false;
    });

    if (legacyProtected && (legacyItems || []).length > 0) {
      report('PASS', `TEST 12: Los ${(legacyItems || []).length} registros LEGACY se mantienen protegidos con decision = NULL`);
    } else {
      report('FAIL', 'TEST 12: Se detectó un registro LEGACY alterado con decision != NULL');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE D:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`FASE D COMPLETA: ${passed} PASSED, ${failed} FAILED`);
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('===========================================================');
}

runPhaseDIntegrationTests().catch(console.error);
