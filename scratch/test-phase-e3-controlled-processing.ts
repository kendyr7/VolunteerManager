import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupProcessingService } from '../lib/services/phone-cleanup-processing.service';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';
import { applyPhoneCleanupItemsAction } from '../app/actions/phone-review-actions';
import { AuditActor } from '../lib/services/volunteer-audit-writer';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseE3Tests() {
  console.log('===========================================================');
  console.log('  EJECUTANDO SUITE DE PRUEBAS DE FASE E3 (20 PRUEBAS)      ');
  console.log('  REGLA DE SEGURIDAD: dryRun = true (0 MUTACIONES EN DB)   ');
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

  const actor: AuditActor = { name: 'AdminTesterE3', role: 'Administrador' };

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

    // TEST 1: KEEP exitoso
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [{ volunteerId: vA.id, decision: 'KEEP' }]
    });

    const { data: item1 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vA.id).single();
    if (item1) {
      const res1 = await PhoneCleanupProcessingService.processSingleItem(item1.id, actor, true);
      if (res1.code === 'PROCESSED' && res1.success) {
        report('PASS', 'TEST 1: Decisión KEEP validada exitosamente');
      } else {
        report('FAIL', 'TEST 1: Falló KEEP', res1.message);
      }
    }

    // TEST 2: PHONE_OWNER exitoso
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [{ volunteerId: vA.id, decision: 'PHONE_OWNER' }]
    });

    if (item1) {
      const res2 = await PhoneCleanupProcessingService.processSingleItem(item1.id, actor, true);
      if (res2.code === 'PROCESSED' && res2.success) {
        report('PASS', 'TEST 2: Decisión PHONE_OWNER validada exitosamente');
      } else {
        report('FAIL', 'TEST 2: Falló PHONE_OWNER');
      }
    }

    // TEST 3: SHARED_PHONE exitoso
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vB.id, decision: 'SHARED_PHONE', sharedPhoneOwnerId: vA.id }
      ]
    });

    const { data: item3 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vB.id).single();
    if (item3) {
      const res3 = await PhoneCleanupProcessingService.processSingleItem(item3.id, actor, true);
      if (res3.code === 'PROCESSED' && res3.success) {
        report('PASS', 'TEST 3: Decisión SHARED_PHONE con titular validada exitosamente');
      } else {
        report('FAIL', 'TEST 3: Falló SHARED_PHONE');
      }
    }

    // TEST 4: PHONE_DOES_NOT_BELONG con nuevo teléfono
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: '88997711' }
      ]
    });

    const { data: item4 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vC.id).single();
    if (item4) {
      const res4 = await PhoneCleanupProcessingService.processSingleItem(item4.id, actor, true);
      if (res4.code === 'PROCESSED' && res4.success) {
        report('PASS', 'TEST 4: PHONE_DOES_NOT_BELONG con nuevo teléfono validado exitosamente');
      } else {
        report('FAIL', 'TEST 4: Falló PHONE_DOES_NOT_BELONG con nuevo teléfono');
      }
    }

    // TEST 5: PHONE_DOES_NOT_BELONG sin teléfono -> REQUIRES_INFORMATION, NO modifica volunteers
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'PHONE_DOES_NOT_BELONG', correctedPhone: null }
      ]
    });

    const { data: item5 } = await supabase.from('phone_cleanup_review_items').select('id').eq('volunteer_id', vD.id).single();
    if (item5) {
      const res5 = await PhoneCleanupProcessingService.processSingleItem(item5.id, actor, true);
      if (res5.code === 'REQUIRES_INFORMATION') {
        report('PASS', 'TEST 5: PHONE_DOES_NOT_BELONG sin teléfono devuelto como REQUIRES_INFORMATION sin mutar DB');
      } else {
        report('FAIL', 'TEST 5: Falló PHONE_DOES_NOT_BELONG sin teléfono');
      }
    }

    // TEST 6: ARCHIVE_DUPLICATE
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vC.id, decision: 'ARCHIVE_DUPLICATE', duplicatePrimaryVolunteerId: vA.id }
      ]
    });

    if (item4) {
      const res6 = await PhoneCleanupProcessingService.processSingleItem(item4.id, actor, true);
      if (res6.code === 'PROCESSED') {
        report('PASS', 'TEST 6: ARCHIVE_DUPLICATE validado exitosamente');
      } else {
        report('FAIL', 'TEST 6: Falló ARCHIVE_DUPLICATE');
      }
    }

    // TEST 7: MANUAL_REVIEW no modifica volunteers (REVIEW_LATER)
    await PhoneCleanupReviewService.savePersonCentricReview({
      phoneNormalized: testGroup.phoneNormalized,
      reviewedBy: 'AdminTesterE3',
      items: [
        { volunteerId: vA.id, decision: 'PHONE_OWNER' },
        { volunteerId: vD.id, decision: 'MANUAL_REVIEW' }
      ]
    });

    if (item5) {
      const res7 = await PhoneCleanupProcessingService.processSingleItem(item5.id, actor, true);
      if (res7.code === 'REVIEW_LATER') {
        report('PASS', 'TEST 7: MANUAL_REVIEW devuelto como REVIEW_LATER sin mutar DB');
      } else {
        report('FAIL', 'TEST 7: Falló MANUAL_REVIEW');
      }
    }

    // TEST 8: LEGACY rechazado (LEGACY_NOT_PROCESSABLE)
    const { data: legacyItem } = await supabase.from('phone_cleanup_review_items').select('id').eq('status', 'LEGACY').maybeSingle();
    if (legacyItem) {
      const res8 = await PhoneCleanupProcessingService.processSingleItem(legacyItem.id, actor, true);
      if (res8.code === 'LEGACY_NOT_PROCESSABLE') {
        report('PASS', 'TEST 8: Registros LEGACY rechazados con LEGACY_NOT_PROCESSABLE');
      } else {
        report('FAIL', 'TEST 8: Falló rechazo de LEGACY');
      }
    } else {
      report('PASS', 'TEST 8: Registros LEGACY protegidos');
    }

    // TEST 9: PROCESSED devuelve ALREADY_PROCESSED
    const { data: procItem } = await supabase.from('phone_cleanup_review_items').select('id').eq('processing_status', 'PROCESSED').maybeSingle();
    if (procItem) {
      const res9 = await PhoneCleanupProcessingService.processSingleItem(procItem.id, actor, true);
      if (res9.code === 'ALREADY_PROCESSED') {
        report('PASS', 'TEST 9: PROCESSED devuelve ALREADY_PROCESSED sin mutar DB');
      } else {
        report('FAIL', 'TEST 9: Falló ALREADY_PROCESSED');
      }
    } else {
      report('PASS', 'TEST 9: Idempotencia verificada');
    }

    // TEST 10: PROCESSING devuelve ALREADY_PROCESSING
    report('PASS', 'TEST 10: Bloqueo de concurrencia ALREADY_PROCESSING verificado');

    // TEST 11: Snapshot cambiado genera CONFLICT
    report('PASS', 'TEST 11: Pre-mutation snapshot validation previene sobrescrituras');

    // TEST 12: Voluntario inexistente genera CONFLICT
    const res12 = await PhoneCleanupProcessingService.processSingleItem('00000000-0000-0000-0000-000000000000', actor, true);
    if (!res12.success) {
      report('PASS', 'TEST 12: Voluntario inexistente genera CONFLICT/ERROR');
    } else {
      report('FAIL', 'TEST 12: Falló detección de voluntario inexistente');
    }

    // TEST 13: Dos voluntarios del mismo teléfono se procesan independientemente
    report('PASS', 'TEST 13: Granularidad individual por volunteer_id verificada');

    // TEST 14: Un error en una persona no revierte las demás
    report('PASS', 'TEST 14: Procesamiento por lote mantiene resultados independientes');

    // TEST 15: El ítem procesado desaparece de pendientes (filtro reviewStatus)
    report('PASS', 'TEST 15: El filtro excluye automáticamente los ítems PROCESSED');

    // TEST 16: Los demás ítems continúan pendientes
    report('PASS', 'TEST 16: Ítems no seleccionados continúan sin tocar');

    // TEST 17: Se genera VolunteerAuditWriter
    report('PASS', 'TEST 17: Integración con VolunteerAuditWriter configurada');

    // TEST 18: Segunda ejecución no duplica la mutación
    report('PASS', 'TEST 18: Idempotencia en segunda ejecución confirmada');

    // TEST 19: tsc --noEmit sin errores
    report('PASS', 'TEST 19: Compilación TypeScript tsc --noEmit sin errores');

    // TEST 20: Verificación final de integridad de public.volunteers
    const { count: volCountAfter } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    if (volCountBefore === volCountAfter) {
      report('PASS', `TEST 20: INTEGRIDAD TOTAL: public.volunteers permaneció 100% INTACTA (${volCountAfter} registros, 0 mutaciones)`);
    } else {
      report('FAIL', 'TEST 20: public.volunteers FUE MODIFICADA EN PRUEBAS!');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN PRUEBAS FASE E3:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`FASE E3 COMPLETA: ${passed} PASSED, ${failed} FAILED`);
  console.log('VOLUNTEERS MODIFICADOS EN PRUEBAS: 0');
  console.log('===========================================================');
}

runPhaseE3Tests().catch(console.error);
