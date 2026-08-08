import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function runControlledAppTraceTest() {
  console.log('===========================================================');
  console.log('  CONTROLLED APP REALTIME TRACE TEST                      ');
  console.log('===========================================================\n');

  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc';

  // 1. Fetch current volunteer state
  const { data: vol, error: fetchErr } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, committee_id, updated_at')
    .eq('id', volunteerId)
    .single();

  if (fetchErr || !vol) {
    console.error('❌ Failed to fetch test volunteer:', fetchErr);
    return;
  }

  console.log('INITIAL RECORD FOR TRACE TEST:');
  console.log('  ID:', vol.id);
  console.log('  first_name:', vol.first_name);
  console.log('  committee_id:', vol.committee_id);
  console.log('  updated_at:', vol.updated_at);
  console.log('-----------------------------------------------------------\n');

  // Test 1: first_name update -> REALTIME_APP_TEST_1
  console.log('Executing UPDATE 1: first_name -> "REALTIME_APP_TEST_1"...');
  const { error: err1 } = await supabase
    .from('volunteers')
    .update({ first_name: 'REALTIME_APP_TEST_1' })
    .eq('id', volunteerId);

  if (err1) console.error('UPDATE 1 failed:', err1);
  else console.log('✅ UPDATE 1 committed to PostgreSQL.');

  await new Promise(r => setTimeout(r, 2000));

  // Test 2: first_name update -> REALTIME_APP_TEST_2
  console.log('Executing UPDATE 2: first_name -> "REALTIME_APP_TEST_2"...');
  const { error: err2 } = await supabase
    .from('volunteers')
    .update({ first_name: 'REALTIME_APP_TEST_2' })
    .eq('id', volunteerId);

  if (err2) console.error('UPDATE 2 failed:', err2);
  else console.log('✅ UPDATE 2 committed to PostgreSQL.');

  await new Promise(r => setTimeout(r, 2000));

  // Revert to original first_name: Marina
  console.log('Reverting first_name -> "Marina"...');
  await supabase
    .from('volunteers')
    .update({ first_name: 'Marina' })
    .eq('id', volunteerId);

  console.log('✅ Reverted test volunteer first_name to "Marina".');
}

runControlledAppTraceTest().catch(err => console.error(err));
