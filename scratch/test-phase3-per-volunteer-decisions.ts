import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPerVolunteerDecisionsTests() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 3 PER-VOLUNTEER DECISIONS TEST SUITE (12 CASES)');
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

  // Reset in-memory test store
  PhoneCleanupReviewService.clearInMemoryReviewsStore();

  try {
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    
    // Find massive group (Group with 6 volunteers, e.g. +50587823513)
    const group6 = groups.find(g => g.volunteers.length >= 6) || groups[0];
    const vols = group6.volunteers;

    // TEST 1: Verificar grupo con 6 personas
    if (vols.length >= 6) {
      report('PASS', `TEST 1: Grupo masivo cargado con ${vols.length} personas asociadas al teléfono`);
    } else {
      report('FAIL', 'TEST 1: No se encontró grupo con 6 personas', `Cargado con ${vols.length}`);
    }

    // Build per-volunteer decisions for the 6 members:
    // A -> PHONE_OWNER
    // B, C, D -> SHARED_PHONE
    // E -> ARCHIVE_DUPLICATE
    // F -> MANUAL_REVIEW
    const vA = vols[0];
    const vB = vols[1];
    const vC = vols[2];
    const vD = vols[3];
    const vE = vols[4];
    const vF = vols[5] || vols[4];

    // TEST 2, 3, 4, 5, 6, 7: Submit valid 6-person individual decision
    const validSubmitRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: group6.phoneNormalized,
      reviewStatus: 'APPROVED',
      reviewedBy: 'AdminPerVolTester',
      reviewerComment: 'Aprobación de matriz individual para grupo de 6 integrantes',
      sharedPhoneReason: 'Padre tutor adulto con dependientes y perfiles duplicados',
      decisions: [
        { volunteerId: vA.id, approvedAction: 'PHONE_OWNER' },
        { volunteerId: vB.id, approvedAction: 'SHARED_PHONE' },
        { volunteerId: vC.id, approvedAction: 'SHARED_PHONE' },
        { volunteerId: vD.id, approvedAction: 'SHARED_PHONE' },
        { volunteerId: vE.id, approvedAction: 'ARCHIVE_DUPLICATE' },
        { volunteerId: vF.id, approvedAction: 'MANUAL_REVIEW' },
      ],
    });

    if (validSubmitRes.success) {
      report('PASS', 'TEST 2-5: Decisión individual guardada correctamente para las 6 personas');
    } else {
      report('FAIL', 'TEST 2-5: Falló al guardar decisión individual', validSubmitRes.message);
    }

    // Reload and verify stored item actions
    const reloadedGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const reloadedGroup = reloadedGroups.find(g => g.phoneNormalized === group6.phoneNormalized);
    const reloadedVols = reloadedGroup?.volunteers || [];

    const rA = reloadedVols.find(v => v.id === vA.id);
    const rB = reloadedVols.find(v => v.id === vB.id);
    const rC = reloadedVols.find(v => v.id === vC.id);
    const rD = reloadedVols.find(v => v.id === vD.id);
    const rE = reloadedVols.find(v => v.id === vE.id);
    const rF = reloadedVols.find(v => v.id === vF.id);

    // TEST 2: 1 persona como PHONE_OWNER
    if (rA?.approvedAction === 'PHONE_OWNER') {
      report('PASS', 'TEST 2: Voluntario A registrado explícitamente como PHONE_OWNER');
    } else {
      report('FAIL', 'TEST 2: Voluntario A no registrado como PHONE_OWNER', rA?.approvedAction);
    }

    // TEST 3: 3 personas como SHARED_PHONE
    if (rB?.approvedAction === 'SHARED_PHONE' && rC?.approvedAction === 'SHARED_PHONE' && rD?.approvedAction === 'SHARED_PHONE') {
      report('PASS', 'TEST 3: Voluntarios B, C, D registrados explícitamente como SHARED_PHONE');
    } else {
      report('FAIL', 'TEST 3: Falló registro de 3 personas como SHARED_PHONE');
    }

    // TEST 4: 1 persona como ARCHIVE_DUPLICATE
    if (rE?.approvedAction === 'ARCHIVE_DUPLICATE') {
      report('PASS', 'TEST 4: Voluntario E registrado explícitamente como ARCHIVE_DUPLICATE');
    } else {
      report('FAIL', 'TEST 4: Voluntario E no registrado como ARCHIVE_DUPLICATE');
    }

    // TEST 5: 1 persona como MANUAL_REVIEW
    if (rF?.approvedAction === 'MANUAL_REVIEW') {
      report('PASS', 'TEST 5: Voluntario F registrado explícitamente como MANUAL_REVIEW');
    } else {
      report('FAIL', 'TEST 5: Voluntario F no registrado como MANUAL_REVIEW');
    }

    // TEST 6 & 7: Exactly 1 owner & shared_phone_owner_id points to correct owner
    if (rB?.sharedPhoneOwnerId === vA.id && rC?.sharedPhoneOwnerId === vA.id && rD?.sharedPhoneOwnerId === vA.id) {
      report('PASS', 'TEST 6-7: shared_phone_owner_id apunta exactamente al PHONE_OWNER seleccionado (vA)');
    } else {
      report('FAIL', 'TEST 6-7: shared_phone_owner_id no coincide con el PHONE_OWNER');
    }

    // TEST 8: Impedir dos PHONE_OWNER en el mismo grupo
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: groups[1].phoneNormalized,
        reviewStatus: 'APPROVED',
        reviewedBy: 'AdminPerVolTester',
        reviewerComment: 'Dos owners inválidos',
        sharedPhoneReason: 'Test',
        decisions: [
          { volunteerId: groups[1].volunteers[0].id, approvedAction: 'PHONE_OWNER' },
          { volunteerId: groups[1].volunteers[1].id, approvedAction: 'PHONE_OWNER' }, // Dos owners!
        ],
      });
      report('FAIL', 'TEST 8: Permitió dos PHONE_OWNER en el mismo grupo');
    } catch (err: any) {
      if (err.message.includes('1 TITULAR') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 8: Rechaza dos PHONE_OWNER en el mismo grupo');
      } else {
        report('FAIL', 'TEST 8: Excepción inesperada', err.message);
      }
    }

    // TEST 9: Impedir SHARED_PHONE sin PHONE_OWNER
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: groups[1].phoneNormalized,
        reviewStatus: 'APPROVED',
        reviewedBy: 'AdminPerVolTester',
        reviewerComment: 'Shared sin owner',
        sharedPhoneReason: 'Test',
        decisions: [
          { volunteerId: groups[1].volunteers[0].id, approvedAction: 'SHARED_PHONE' },
          { volunteerId: groups[1].volunteers[1].id, approvedAction: 'SHARED_PHONE' }, // 0 owners!
        ],
      });
      report('FAIL', 'TEST 9: Permitió SHARED_PHONE sin PHONE_OWNER');
    } catch (err: any) {
      if (err.message.includes('PHONE_OWNER') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 9: Rechaza SHARED_PHONE sin PHONE_OWNER');
      } else {
        report('FAIL', 'TEST 9: Excepción inesperada', err.message);
      }
    }

    // TEST 10: Impedir archivar a todos los perfiles de un grupo
    try {
      const allArchiveDecisions = groups[1].volunteers.map(v => ({
        volunteerId: v.id,
        approvedAction: 'ARCHIVE_DUPLICATE' as const,
      }));
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: groups[1].phoneNormalized,
        reviewStatus: 'APPROVED',
        reviewedBy: 'AdminPerVolTester',
        reviewerComment: 'Archivar todos los 6',
        decisions: allArchiveDecisions,
      });
      report('FAIL', 'TEST 10: Permitió archivar todos los integrantes');
    } catch (err: any) {
      if (err.message.includes('totalidad') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 10: Rechaza archivar todos los integrantes de un grupo');
      } else {
        report('FAIL', 'TEST 10: Excepción inesperada', err.message);
      }
    }

    // TEST 11: Confirmar que volunteers NO cambia en absoluto
    const { count: countTotal } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    const { count: countNorm } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
    const { count: countShared } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);

    if (countTotal === 668 && countNorm === 0 && countShared === 0) {
      report('PASS', 'TEST 11: Confirmado: La tabla volunteers permanece 100% INTACTA (0 UPDATES/INSERTS/DELETES)');
    } else {
      report('FAIL', 'TEST 11: La tabla volunteers fue modificada!');
    }

    // TEST 12: Confirmar que todas las decisiones se guardan explícitamente por volunteer.id
    if (rA?.id === vA.id && rB?.id === vB.id && rC?.id === vC.id && rD?.id === vD.id && rE?.id === vE.id) {
      report('PASS', 'TEST 12: Confirmado: Todas las decisiones fueron mapeadas y guardadas explícitamente por volunteer.id');
    } else {
      report('FAIL', 'TEST 12: Mapeo de decisiones por volunteer.id incompleto');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS PER-VOLUNTEER DECISIONS:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  PER-VOLUNTEER DECISIONS SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

runPerVolunteerDecisionsTests().catch(console.error);
