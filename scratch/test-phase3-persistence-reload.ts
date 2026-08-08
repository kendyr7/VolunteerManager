import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PhoneCleanupReviewService } from '../lib/services/phone-cleanup-review.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPersistenceReloadTest() {
  console.log('===========================================================');
  console.log('  RUNNING PERSISTENCE RELOAD SIMULATION TEST              ');
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
    // 1. Guardar decisiones en grupo de prueba
    const groups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const testGroup = groups[1] || groups[0];
    const vols = testGroup.volunteers;

    const saveRes = await PhoneCleanupReviewService.submitGroupReviewDecision({
      phoneNormalized: testGroup.phoneNormalized,
      reviewStatus: 'APPROVED',
      reviewedBy: 'AdminReloadTester',
      reviewerComment: 'Prueba de resistencia a reinicio de servidor',
      sharedPhoneReason: 'Test de reinicio',
      decisions: [
        { volunteerId: vols[0].id, approvedAction: 'PHONE_OWNER' },
        { volunteerId: vols[1].id, approvedAction: 'SHARED_PHONE', sharedPhoneOwnerId: vols[0].id, correctedPhone: '88990011' },
      ],
    });

    if (saveRes.success) {
      report('PASS', '1. Decisión de prueba guardada correctamente');
    } else {
      report('FAIL', '1. Error al guardar decisión', saveRes.message);
    }

    // 2. Destruir en-memory cache para simular reinicio de proceso Node.js / Next.js
    PhoneCleanupReviewService.clearInMemoryReviewsStore();
    report('PASS', '2. Memoria RAM de Node.js limpiada (Simulación de reinicio de servidor)');

    // 3. Volver a cargar el grupo desde la fuente persistente
    const reloadedGroups = await PhoneCleanupReviewService.getDuplicatePhoneGroups();
    const reloadedGroup = reloadedGroups.find(g => g.phoneNormalized === testGroup.phoneNormalized);
    const rVols = reloadedGroup?.volunteers || [];

    const r0 = rVols.find(v => v.id === vols[0].id);
    const r1 = rVols.find(v => v.id === vols[1].id);

    // 4. Confirmar persistencia tras reinicio
    if (r0?.approvedAction === 'PHONE_OWNER' && r1?.approvedAction === 'SHARED_PHONE' && r1?.correctedPhone === '88990011') {
      report('PASS', '3-4. Las decisiones y corrected_phone SOBREVIVIERON al reinicio de proceso Node.js');
    } else {
      report('FAIL', '3-4. Las decisiones no sobrevivieron al reinicio', JSON.stringify({ r0: r0?.approvedAction, r1: r1?.approvedAction, phone: r1?.correctedPhone }));
    }

    // 5. Confirmar que public.volunteers permane 100% intacta
    const { count: volCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
    const { count: normCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);

    if (volCount === 668 && normCount === 0) {
      report('PASS', '5. Confirmado: public.volunteers se mantiene 100% INTACTA (0 mutaciones)');
    } else {
      report('FAIL', '5. public.volunteers fue modificada!');
    }

  } catch (err: any) {
    console.error('EXCEPTION EN TEST DE REINICIO:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`  RELOAD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

runPersistenceReloadTest().catch(console.error);
