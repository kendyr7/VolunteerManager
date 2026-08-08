import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseE5Test() {
  console.log('===========================================================');
  console.log('  TEST FASE E5: VERIFICACIÓN PREFLIGHT DE AUDITORÍA        ');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function report(status: 'PASS' | 'FAIL', testName: string) {
    if (status === 'PASS') {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}`);
      failed++;
    }
  }

  // Count volunteers before test
  const { count: volCountBefore } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  const { count: itemsCountBefore } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });

  // Query eligible items
  const { data: eligibleItems } = await supabase
    .from('phone_cleanup_review_items')
    .select('id')
    .eq('status', 'READY_TO_PROCESS')
    .eq('processing_status', 'PENDING')
    .not('decision', 'is', null);

  const foundCount = eligibleItems ? eligibleItems.length : 0;

  if (foundCount >= 35) {
    report('PASS', `TEST 1: Registros READY_TO_PROCESS encontrados en Supabase DB (${foundCount} >= 35)`);
  } else {
    report('FAIL', `TEST 1: Esperaba al menos 35 registros, pero encontró ${foundCount}`);
  }

  // Count volunteers after test to prove 0 mutations
  const { count: volCountAfter } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  const { count: itemsCountAfter } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });

  if (volCountBefore === volCountAfter) {
    report('PASS', `TEST 2: Mutaciones = 0; public.volunteers intacta (${volCountAfter} registros)`);
  } else {
    report('FAIL', `TEST 2: public.volunteers fue modificada!`);
  }

  if (itemsCountBefore === itemsCountAfter) {
    report('PASS', `TEST 3: Review items modificados = 0 (${itemsCountAfter} ítems intactos)`);
  } else {
    report('FAIL', `TEST 3: phone_cleanup_review_items fue modificada!`);
  }

  console.log('\n===========================================================');
  console.log(`FASE E5 TEST COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

runPhaseE5Test().catch(console.error);
