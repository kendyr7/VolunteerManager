import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSupabasePersistenceTests() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 3 SUPABASE PERSISTENCE TEST SUITE (A-L)    ');
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

  try {
    // A. Obtener grupo real de revisión
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const group4 = groups.find(g => g.volunteers.length >= 4) || groups[0];
    const vols = group4.volunteers;

    if (vols.length < 2) {
      report('FAIL', 'A. No se encontró grupo con suficientes voluntarios para la prueba');
      return;
    }
    report('PASS', `A. Grupo real cargado (${group4.phoneNormalized}) con ${vols.length} voluntarios`);

    const vA = vols[0];
    const vB = vols[1];
    const vC = vols[2] || vols[1];
    const vD = vols[3] || vols[1];

    // B. Guardar decisiones para varios volunteer.id
    const initialSubmitRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: group4.phoneNormalized,
      reviewStatus: 'APPROVED',
      reviewedBy: 'AdminPersistenceTester',
      reviewerComment: 'Prueba de persistencia multi-decisión por volunteer_id',
      sharedPhoneReason: 'Tutor y menor de edad en grupo de prueba',
      decisions: [
        { volunteerId: vA.id, approvedAction: 'PHONE_OWNER' },
        { volunteerId: vB.id, approvedAction: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id },
        { volunteerId: vC.id, approvedAction: 'ARCHIVE_DUPLICATE' },
        { volunteerId: vD.id, approvedAction: 'MANUAL_REVIEW', correctedPhone: '88881234' },
      ],
    });

    if (initialSubmitRes.success) {
      report('PASS', 'B. Guardado inicial de 4 decisiones ejecutado con éxito');
    } else {
      report('FAIL', 'B. Falló el guardado inicial de decisiones', initialSubmitRes.message);
    }

    // C & D & E. Leer nuevamente y confirmar decisiones y corrected_phone
    const reloadedGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const reloadedGroup = reloadedGroups.find(g => g.phoneNormalized === group4.phoneNormalized);
    const rVols = reloadedGroup?.volunteers || [];

    const rA = rVols.find(v => v.id === vA.id);
    const rB = rVols.find(v => v.id === vB.id);
    const rC = rVols.find(v => v.id === vC.id);
    const rD = rVols.find(v => v.id === vD.id);

    if (
      rA?.approvedAction === 'PHONE_OWNER' &&
      rB?.approvedAction === 'SHARED_PHONE' &&
      rC?.approvedAction === 'ARCHIVE_DUPLICATE' &&
      rD?.approvedAction === 'MANUAL_REVIEW'
    ) {
      report('PASS', 'C-D. Las 4 decisiones existen exactamente como se guardaron');
    } else {
      report('FAIL', 'C-D. Discrepancia en decisiones leídas', JSON.stringify({ rA: rA?.approvedAction, rB: rB?.approvedAction, rC: rC?.approvedAction, rD: rD?.approvedAction }));
    }

    if (rD?.correctedPhone === '88881234') {
      report('PASS', 'E. corrected_phone = "88881234" recuperado correctamente');
    } else {
      report('FAIL', 'E. corrected_phone no se recuperó correctamente', rD?.correctedPhone || 'null');
    }

    // F & G. Volver a guardar y confirmar que NO se duplicaron ítems
    await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: group4.phoneNormalized,
      reviewStatus: 'APPROVED',
      reviewedBy: 'AdminPersistenceTester',
      reviewerComment: 'Re-guardado para verificar idempotencia sin duplicados',
      sharedPhoneReason: 'Tutor y menor de edad en grupo de prueba',
      decisions: [
        { volunteerId: vA.id, approvedAction: 'PHONE_OWNER' },
        { volunteerId: vB.id, approvedAction: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id },
        { volunteerId: vC.id, approvedAction: 'ARCHIVE_DUPLICATE' },
        { volunteerId: vD.id, approvedAction: 'MANUAL_REVIEW', correctedPhone: '88881234' },
      ],
    });

    const reloadedGroups2 = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const reloadedGroup2 = reloadedGroups2.find(g => g.phoneNormalized === group4.phoneNormalized);

    if (reloadedGroup2?.volunteers.length === group4.volunteers.length) {
      report('PASS', 'F-G. Volver a guardar es idempotente: NO se duplicaron ítems en el grupo');
    } else {
      report('FAIL', 'F-G. Se duplicaron ítems al volver a guardar!');
    }

    // H & I & J & K. Cambiar decisión de D a KEEP con corrected_phone = "87771234"
    await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: group4.phoneNormalized,
      reviewStatus: 'APPROVED',
      reviewedBy: 'AdminPersistenceTester',
      reviewerComment: 'Actualización de decisión para voluntario D',
      sharedPhoneReason: 'Tutor y menor de edad en grupo de prueba',
      decisions: [
        { volunteerId: vA.id, approvedAction: 'PHONE_OWNER' },
        { volunteerId: vB.id, approvedAction: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id },
        { volunteerId: vC.id, approvedAction: 'ARCHIVE_DUPLICATE' },
        { volunteerId: vD.id, approvedAction: 'KEEP', correctedPhone: '87771234' },
      ],
    });

    const reloadedGroups3 = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const reloadedGroup3 = reloadedGroups3.find(g => g.phoneNormalized === group4.phoneNormalized);
    const rD3 = reloadedGroup3?.volunteers.find(v => v.id === vD.id);

    if (rD3?.approvedAction === 'KEEP' && rD3?.correctedPhone === '87771234') {
      report('PASS', 'H-K. Decisión de voluntario D actualizada a KEEP y corrected_phone = "87771234"');
    } else {
      report('FAIL', 'H-K. Falló actualización de voluntario D', JSON.stringify(rD3));
    }

    // L. Confirmar que public.volunteers NO fue modificada
    const { count: countTotal } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    const { count: countNorm } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
    const { count: countShared } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);

    if (countTotal === 668 && countNorm === 0 && countShared === 0) {
      report('PASS', 'L. Confirmado: public.volunteers permanece 100% INTACTA (0 UPDATES/INSERTS/DELETES)');
    } else {
      report('FAIL', 'L. La tabla public.volunteers fue modificada!');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN TEST DE PERSISTENCIA:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  SUPABASE PERSISTENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

runSupabasePersistenceTests().catch(console.error);
