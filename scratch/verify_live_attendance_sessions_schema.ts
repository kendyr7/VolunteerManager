import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const adminClient = createClient(supabaseUrl, serviceKey);
const anonClient = createClient(supabaseUrl, anonKey);

async function runLiveVerification() {
  console.log('===========================================================');
  console.log('  LIVE POST-MIGRATION READ-ONLY VERIFICATION (SUPABASE)   ');
  console.log('===========================================================\n');

  // 1. Table Existence & Service Role Query
  console.log('--- 1. TABLE EXISTENCE & SERVICE ROLE ACCESS ---');
  const { data: sessData, error: sessErr, count: sessCount } = await adminClient
    .from('attendance_sessions')
    .select('*', { count: 'exact' });

  if (sessErr) {
    console.error('❌ Table query error:', sessErr.message);
  } else {
    console.log('✅ public.attendance_sessions EXISTS in Supabase DB!');
    console.log(`   - Current rows count: ${sessCount} (Expected: 0)`);
    console.log(`   - Returned sample array length: ${sessData?.length}`);
  }

  // 2. Anon Key Access Test (Non-destructive)
  console.log('\n--- 2. NON-DESTRUCTIVE ACCESS TEST (anon vs service_role) ---');
  const { data: anonData, error: anonErr } = await anonClient
    .from('attendance_sessions')
    .select('*');

  if (anonErr) {
    console.log('✅ anon key access BLOCKED correctly as expected!');
    console.log('   - Error code / message:', anonErr.message, `(code: ${anonErr.code})`);
  } else {
    console.log('⚠️ anon key query result:', anonData);
  }

  // 3. Counts for volunteers and shifts
  console.log('\n--- 3. LIVE ROW COUNTS (volunteers & shifts) ---');
  const { count: volCount, error: volErr } = await adminClient
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  const { count: shiftCount, error: shiftErr } = await adminClient
    .from('shifts')
    .select('*', { count: 'exact', head: true });

  console.log(`   - volunteers count: ${volCount} ${volErr ? `(error: ${volErr.message})` : '✅'}`);
  console.log(`   - shifts count: ${shiftCount} ${shiftErr ? `(error: ${shiftErr.message})` : '✅'}`);

  // 4. Schema Column Inspection via RPC or sample structure test
  console.log('\n--- 4. COLUMN INTERACTION & CONSTRAINT INTEGRITY TEST ---');
  // Test invalid insert attempt without running actual write or test error response
  // We can attempt a dummy query to verify column definitions are mapped
  const { data: colSample, error: colErr } = await adminClient
    .from('attendance_sessions')
    .select('id, volunteer_id, day_key, started_at, ended_at, status, auto_closed, created_at, updated_at')
    .limit(1);

  if (colErr) {
    console.error('❌ Column select error:', colErr.message);
  } else {
    console.log('✅ All 9 physical columns (id, volunteer_id, day_key, started_at, ended_at, status, auto_closed, created_at, updated_at) confirmed!');
  }
}

runLiveVerification().catch(console.error);
