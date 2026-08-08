import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function testTrigger() {
  console.log('===========================================================');
  console.log('  TESTING DATABASE TRIGGER FOR UPDATED_AT                   ');
  console.log('===========================================================\n');

  // 1. Fetch a volunteer
  const { data: before, error: fetchErr } = await supabase
    .from('volunteers')
    .select('id, first_name, committee_id, updated_at')
    .limit(1)
    .single();

  if (fetchErr || !before) {
    console.error('❌ Failed to fetch volunteer from DB:', fetchErr);
    return;
  }

  console.log('BEFORE UPDATE:');
  console.log('  id:', before.id);
  console.log('  first_name:', before.first_name);
  console.log('  committee_id:', before.committee_id);
  console.log('  updated_at:', before.updated_at);

  // Wait 1 second to ensure timestamp difference
  await new Promise(r => setTimeout(r, 1100));

  // 2. Perform an UPDATE query (WITHOUT passing updated_at)
  const { error: updateErr } = await supabase
    .from('volunteers')
    .update({ first_name: before.first_name })
    .eq('id', before.id);

  if (updateErr) {
    console.error('❌ Update failed:', updateErr);
    return;
  }

  // 3. Fetch record AFTER update
  const { data: after, error: fetchAfterErr } = await supabase
    .from('volunteers')
    .select('id, first_name, committee_id, updated_at')
    .eq('id', before.id)
    .single();

  if (fetchAfterErr || !after) {
    console.error('❌ Failed to fetch after update:', fetchAfterErr);
    return;
  }

  console.log('\nAFTER UPDATE:');
  console.log('  id:', after.id);
  console.log('  first_name:', after.first_name);
  console.log('  committee_id:', after.committee_id);
  console.log('  updated_at:', after.updated_at);

  const beforeTime = before.updated_at ? new Date(before.updated_at).getTime() : 0;
  const afterTime = after.updated_at ? new Date(after.updated_at).getTime() : 0;

  if (afterTime > beforeTime) {
    console.log('\n✅ VERIFIED: updated_at AFTER > updated_at BEFORE! Trigger is active in DB.');
  } else {
    console.log('\n⚠️ NOT VERIFIED: updated_at did NOT change automatically. Remote trigger needs manual SQL execution in Supabase Dashboard.');
  }
}

testTrigger().catch(err => console.error(err));
