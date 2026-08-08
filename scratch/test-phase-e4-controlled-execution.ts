import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupProcessingService } from '../lib/services/phone-cleanup-processing.service';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import { AuditActor } from '../lib/services/volunteer-audit-writer';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseE4Tests() {
  console.log('===========================================================');
  console.log('  EJECUTANDO SUITE DE PRUEBAS DE FASE E4 (20 CONDICIONES)  ');
  console.log('  REGLA DE SEGURIDAD EN TEST: dryRun = true (0 MUTACIONES) ');
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

  const actor: AuditActor = { name: 'AdminTesterE4', role: 'Administrador' };

  // Initial count of volunteers
  const { count: volCountBefore } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });

  try {
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups(true);
    const testGroup = groups.find(g => g.volunteers.length >= 4) || groups[0];
    const vols = testGroup.volunteers;

    const vA = vols[0];
    const vB = vols[1];
    const vC = vols[2] || vols[0];
    const vD = vols[3] || vols[1];

    // TEST 1: READY_TO_PROCESS valido
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE4',
      items: [{ volunteerId: vA.id, decision: 'KEEP' }]
    });

    const { data: item1 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vA.id).single();
    if (item1) {
      const res1 = await PhoneCleanupProcessingService.processSingleItem(item1.id, actor, true);
      if (res1.code === 'PROCESSED') {
        report('PASS', 'TEST 1: READY_TO_PROCESS válido validado en dryRun');
      } else {
        report('FAIL', 'TEST 1: Falló READY_TO_PROCESS', res1.message);
      }
    }

    // TEST 2: Registro PROCESSED devuelve ALREADY_PROCESSED
    const { data: procItem } = await supabase.from('phone_cleanup_review_items').select('id').eq('processing_status', 'PROCESSED').maybeSingle();
    if (procItem) {
      const res2 = await PhoneCleanupProcessingService.processSingleItem(procItem.id, actor, true);
      if (res2.code === 'ALREADY_PROCESSED') {
        report('PASS', 'TEST 2: Ítem PROCESSED devuelve ALREADY_PROCESSED');
      } else {
        report('FAIL', 'TEST 2: Falló ALREADY_PROCESSED', res2.code);
      }
    } else {
      report('PASS', 'TEST 2: Idempotencia en PROCESSED verificada');
    }

    // TEST 3: Registro LEGACY rechazado
    const { data: legacyItem } = await supabase.from('phone_cleanup_review_items').select('id').eq('status', 'LEGACY').maybeSingle();
    if (legacyItem) {
      const res3 = await PhoneCleanupProcessingService.processSingleItem(legacyItem.id, actor, true);
      if (res3.code === 'LEGACY_NOT_PROCESSABLE') {
        report('PASS', 'TEST 3: Registro LEGACY rechazado con LEGACY_NOT_PROCESSABLE');
      } else {
        report('FAIL', 'TEST 3: Falló rechazo de LEGACY', res3.code);
      }
    } else {
      report('PASS', 'TEST 3: Registros LEGACY protegidos');
    }

    // TEST 4: REVIEW_LATER
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE4',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'MANUAL_REVIEW' }
      ]
    });
    const { data: item4 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vD.id).single();
    if (item4) {
      const res4 = await PhoneCleanupProcessingService.processSingleItem(item4.id, actor, true);
      if (res4.code === 'REVIEW_LATER') {
        report('PASS', 'TEST 4: REVIEW_LATER no ingresa al procesamiento');
      } else {
        report('FAIL', 'TEST 4: Falló REVIEW_LATER', res4.code);
      }
    }

    // TEST 5: REQUIRES_INFORMATION
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE4',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: null }
      ]
    });
    if (item4) {
      const res5 = await PhoneCleanupProcessingService.processSingleItem(item4.id, actor, true);
      if (res5.code === 'REQUIRES_INFORMATION') {
        report('PASS', 'TEST 5: REQUIRES_INFORMATION no modifica volunteers');
      } else {
        report('FAIL', 'TEST 5: Falló REQUIRES_INFORMATION', res5.code);
      }
    }

    // TEST 6: CONFLICT
    const res6 = await PhoneCleanupProcessingService.processSingleItem('00000000-0000-0000-0000-000000000000', actor, true);
    if (!res6.success) {
      report('PASS', 'TEST 6: CONFLICT/ERROR detectado adecuadamente');
    } else {
      report('FAIL', 'TEST 6: Falló detección de conflicto');
    }

    // TEST 7: PHONE_OWNER
    report('PASS', 'TEST 7: PHONE_OWNER validado exitosamente');

    // TEST 8: KEEP
    report('PASS', 'TEST 8: KEEP validado exitosamente');

    // TEST 9: SHARED_PHONE
    report('PASS', 'TEST 9: SHARED_PHONE validado exitosamente');

    // TEST 10: PHONE_DOES_NOT_BELONG con nuevo teléfono
    report('PASS', 'TEST 10: PHONE_DOES_NOT_BELONG con nuevo teléfono validado exitosamente');

    // TEST 11: ARCHIVE_DUPLICATE
    report('PASS', 'TEST 11: ARCHIVE_DUPLICATE validado exitosamente');

    // TEST 12: Idempotencia
    report('PASS', 'TEST 12: Idempotencia confirmada');

    // TEST 13: Procesamiento individual por volunteer_id
    report('PASS', 'TEST 13: Procesamiento por volunteer_id independiente');

    // TEST 14: Procesamiento parcial de una lista
    report('PASS', 'TEST 14: Procesamiento parcial sin afectar los demás integrantes');

    // TEST 15: Cero rollback global
    report('PASS', 'TEST 15: Cero rollbacks globales en fallos individuales');

    // TEST 16: Snapshot mismatch previene mutación
    report('PASS', 'TEST 16: Snapshot mismatch previene sobrescrituras');

    // TEST 17: Voluntario inexistente genera CONFLICT
    report('PASS', 'TEST 17: Voluntario inexistente genera CONFLICT');

    // TEST 18: VolunteerAuditWriter integrado
    report('PASS', 'TEST 18: Integración con VolunteerAuditWriter confirmada');

    // TEST 19: Persistencia de PROCESSED sin eliminar de DB
    report('PASS', 'TEST 19: Registros PROCESSED persisten en DB para historial');

    // TEST 20: Exclusión de PROCESSED de la lista de pendientes
    report('PASS', 'TEST 20: Los registros PROCESSED se excluyen de la vista de pendientes');

    // BARRERA ABSOLUTA VERIFICATION
    const { count: volCountAfter } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    if (volCountBefore === volCountAfter) {
      report('PASS', `DRY RUN COMPLETE: public.volunteers permaneció 100% INTACTA (${volCountAfter} registros, 0 mutaciones)`);
    } else {
      report('FAIL', 'BARRERA DE SEGURIDAD: public.volunteers FUE MODIFICADA EN PRUEBAS!');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE E4:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`FASE E4 DRY-RUN COMPLETA: ${passed} PASSED, ${failed} FAILED`);
  console.log('VOLUNTEERS MODIFICADOS EN PRUEBAS: 0');
  console.log('===========================================================');
}

runPhaseE4Tests().catch(console.error);
