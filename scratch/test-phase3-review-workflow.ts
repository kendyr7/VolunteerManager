import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase3ReviewWorkflowTests() {
  console.log('===========================================================');
  console.log('  RUNNING FASE 3 PASO 2B-A REVIEW WORKFLOW TEST SUITE (12 CASES)');
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
    // 1. Fetch initial duplicate groups
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    
    // TEST 1: Crear revisión PENDING por defecto
    const pendingGroup = groups.find(g => g.reviewStatus === 'PENDING');
    if (pendingGroup && groups.length > 0) {
      report('PASS', 'TEST 1: Carga inicial genera grupo en estado PENDING');
    } else {
      report('FAIL', 'TEST 1: No se encontraron grupos en estado PENDING');
    }

    const testGroupA = groups[0];
    const testGroupB = groups[1] || groups[0];
    const testGroupC = groups[2] || groups[0];
    const testGroupD = groups[3] || groups[0];

    // TEST 2: Aprobar SHARED_PHONE válido
    const validOwner = testGroupA.volunteers.find(v => v.status === 'active') || testGroupA.volunteers[0];
    const approveRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: testGroupA.phoneNormalized,
      decisionAction: 'SHARED_PHONE',
      reviewStatus: 'APPROVED',
      sharedPhoneOwnerId: validOwner.id,
      sharedPhoneReason: 'Tutor legal adulto y menor de edad comparten número',
      reviewedBy: 'AdminTester',
      reviewerComment: 'Aprobado en prueba de integración de workflow',
    });

    if (approveRes.success) {
      report('PASS', 'TEST 2: Aprobar SHARED_PHONE válido registrado correctamente');
    } else {
      report('FAIL', 'TEST 2: Error al aprobar SHARED_PHONE válido', approveRes.message);
    }

    // TEST 3: Rechazar propuesta
    const rejectRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: testGroupB.phoneNormalized,
      decisionAction: 'REJECTED',
      reviewStatus: 'REJECTED',
      reviewedBy: 'AdminTester',
      reviewerComment: 'Rechazado por inconsistencia de datos personales',
    });

    if (rejectRes.success) {
      report('PASS', 'TEST 3: Rechazar propuesta registrado correctamente');
    } else {
      report('FAIL', 'TEST 3: Error al registrar rechazo', rejectRes.message);
    }

    // TEST 4: No permitir SHARED_PHONE sin owner
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupC.phoneNormalized,
        decisionAction: 'SHARED_PHONE',
        reviewStatus: 'APPROVED',
        sharedPhoneReason: 'Motivo cualquiera',
        reviewedBy: 'AdminTester',
        reviewerComment: 'Falta owner',
      });
      report('FAIL', 'TEST 4: Permitió SHARED_PHONE sin ownerId');
    } catch (err: any) {
      if (err.message.includes('sharedPhoneOwnerId') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 4: Rechaza SHARED_PHONE sin ownerId');
      } else {
        report('FAIL', 'TEST 4: Excepción inesperada', err.message);
      }
    }

    // TEST 5: No permitir SHARED_PHONE sin reason
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupC.phoneNormalized,
        decisionAction: 'SHARED_PHONE',
        reviewStatus: 'APPROVED',
        sharedPhoneOwnerId: validOwner.id,
        sharedPhoneReason: '', // Vacío
        reviewedBy: 'AdminTester',
        reviewerComment: 'Falta razón',
      });
      report('FAIL', 'TEST 5: Permitió SHARED_PHONE sin reason');
    } catch (err: any) {
      if (err.message.includes('sharedPhoneReason') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 5: Rechaza SHARED_PHONE sin reason');
      } else {
        report('FAIL', 'TEST 5: Excepción inesperada', err.message);
      }
    }

    // TEST 6: No permitir owner que no pertenece al grupo
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupC.phoneNormalized,
        decisionAction: 'SHARED_PHONE',
        reviewStatus: 'APPROVED',
        sharedPhoneOwnerId: '00000000-0000-0000-0000-000000000000', // Non existent owner
        sharedPhoneReason: 'Test invalid owner',
        reviewedBy: 'AdminTester',
        reviewerComment: 'Owner no pertenece al grupo',
      });
      report('FAIL', 'TEST 6: Permitió owner que no pertenece al grupo');
    } catch (err: any) {
      if (err.message.includes('no pertenece a este grupo') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 6: Rechaza owner que no pertenece al grupo');
      } else {
        report('FAIL', 'TEST 6: Excepción inesperada', err.message);
      }
    }

    // TEST 7: No permitir ARCHIVE_DUPLICATE sin seleccionar principal
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupD.phoneNormalized,
        decisionAction: 'ARCHIVE_DUPLICATE',
        reviewStatus: 'APPROVED',
        archivedVolunteerIds: [testGroupD.volunteers[0].id],
        reviewedBy: 'AdminTester',
        reviewerComment: 'Falta primaryVolunteerId',
      });
      report('FAIL', 'TEST 7: Permitió ARCHIVE_DUPLICATE sin primaryVolunteerId');
    } catch (err: any) {
      if (err.message.includes('primaryVolunteerId') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 7: Rechaza ARCHIVE_DUPLICATE sin primaryVolunteerId');
      } else {
        report('FAIL', 'TEST 7: Excepción inesperada', err.message);
      }
    }

    // TEST 8: No permitir archivar todos los perfiles de un grupo
    try {
      const allIds = testGroupD.volunteers.map(v => v.id);
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupD.phoneNormalized,
        decisionAction: 'ARCHIVE_DUPLICATE',
        reviewStatus: 'APPROVED',
        primaryVolunteerId: allIds[0],
        archivedVolunteerIds: allIds, // Incluye la totalidad
        reviewedBy: 'AdminTester',
        reviewerComment: 'Intento de archivar todos',
      });
      report('FAIL', 'TEST 8: Permitió archivar la totalidad de los perfiles');
    } catch (err: any) {
      if (err.message.includes('no puede estar marcado para archivar') || err.message.includes('totalidad') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 8: Rechaza archivar la totalidad de los perfiles');
      } else {
        report('FAIL', 'TEST 8: Excepción inesperada', err.message);
      }
    }

    // TEST 9: No permitir aprobación sin reviewer
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupD.phoneNormalized,
        decisionAction: 'NORMALIZE_ONLY',
        reviewStatus: 'APPROVED',
        reviewedBy: '', // Sin revisor
        reviewerComment: 'Sin revisor',
      });
      report('FAIL', 'TEST 9: Permitió decisión sin reviewedBy');
    } catch (err: any) {
      if (err.message.includes('reviewedBy') || err.message.includes('ValidationError')) {
        report('PASS', 'TEST 9: Rechaza decisión sin reviewedBy');
      } else {
        report('FAIL', 'TEST 9: Excepción inesperada', err.message);
      }
    }

    // TEST 10: CONFIRMAR QUE LAS DECISIONES NO MODIFICAN VOLUNTEERS
    const { count: countTotal } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    const { count: countNorm } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
    const { count: countShared } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);

    if (countTotal === 668 && countNorm === 0 && countShared === 0) {
      report('PASS', 'TEST 10: Confirmado: Las decisiones NO modifican volunteers (phone_normalized NULL = 668, is_shared_phone = false = 668)');
    } else {
      report('FAIL', 'TEST 10: La tabla volunteers fue alterada durante el workflow!', `Total=${countTotal}, Norm=${countNorm}, Shared=${countShared}`);
    }

    // TEST 11: Confirmar múltiples decisiones guardadas en auditoría
    const updatedGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const approvedCount = updatedGroups.filter(g => g.reviewStatus === 'APPROVED').length;
    const rejectedCount = updatedGroups.filter(g => g.reviewStatus === 'REJECTED').length;

    if (approvedCount >= 1 && rejectedCount >= 1) {
      report('PASS', 'TEST 11: Confirmado: Workflow guarda múltiples decisiones en auditoría');
    } else {
      report('FAIL', 'TEST 11: Múltiples decisiones no fueron persistidas en la auditoría');
    }

    // TEST 12: Confirmar que no se permiten 2 decisiones APPROVED conflictivas
    try {
      await PhoneCleanupReviewService.submitGroupReviewDecision({
        phoneNormalized: testGroupA.phoneNormalized, // Ya APROBADO en TEST 2
        decisionAction: 'ARCHIVE_DUPLICATE',
        reviewStatus: 'APPROVED',
        primaryVolunteerId: testGroupA.volunteers[0].id,
        archivedVolunteerIds: [testGroupA.volunteers[1].id],
        reviewedBy: 'AdminTester2',
        reviewerComment: 'Intento de decisión conflictiva',
      });
      report('FAIL', 'TEST 12: Permitió 2 decisiones APPROVED conflictivas');
    } catch (err: any) {
      if (err.message.includes('ConflictingDecisionError') || err.message.includes('conflictiva')) {
        report('PASS', 'TEST 12: Rechaza 2 decisiones APPROVED conflictivas sobre el mismo grupo');
      } else {
        report('FAIL', 'TEST 12: Excepción inesperada', err.message);
      }
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS WORKFLOW FASE 3:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  FASE 3 WORKFLOW TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

runPhase3ReviewWorkflowTests().catch(console.error);
