import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhoneReviewPersistenceSchema() {
  console.log('===========================================================');
  console.log('  VERIFYING SUPABASE PHONE CLEANUP REVIEWS SCHEMA & STATUS ');
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

  // 1. Verify phone_cleanup_reviews table exists
  const { data: revData, error: revErr } = await supabase.from('phone_cleanup_reviews').select('*').limit(1);
  if (!revErr) {
    report('PASS', '1. Tabla public.phone_cleanup_reviews EXISTE en Supabase');
  } else {
    report('FAIL', '1. Tabla public.phone_cleanup_reviews NO EXISTE aún en Supabase', revErr.message);
  }

  // 2. Verify phone_cleanup_review_items table exists
  const { data: itemData, error: itemErr } = await supabase.from('phone_cleanup_review_items').select('*').limit(1);
  if (!itemErr) {
    report('PASS', '2. Tabla public.phone_cleanup_review_items EXISTE en Supabase');
  } else {
    report('FAIL', '2. Tabla public.phone_cleanup_review_items NO EXISTE aún en Supabase', itemErr.message);
  }

  // 3. Verify public.volunteers count & integrity
  const { count: volCount, error: volErr } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  const { count: normCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
  const { count: sharedCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);

  if (volCount === 668 && normCount === 0 && sharedCount === 0) {
    report('PASS', '8. public.volunteers permanece 100% INTACTA (668 registros, 0 modificados)');
  } else {
    report('FAIL', '8. public.volunteers fue modificada!', `Total: ${volCount}, Norm: ${normCount}, Shared: ${sharedCount}`);
  }

  console.log('\n===========================================================');
  console.log(`  SCHEMA VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');
}

verifyPhoneReviewPersistenceSchema().catch(console.error);
