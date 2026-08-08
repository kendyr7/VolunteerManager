import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function runDirectRealtimeTest() {
  console.log('===========================================================');
  console.log('  ISOLATED DIRECT SUPABASE REALTIME TEST                   ');
  console.log('===========================================================\n');

  // Step 1: Select a volunteer
  const { data: vol, error: fetchErr } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, committee_id')
    .limit(1)
    .single();

  if (fetchErr || !vol) {
    console.error('❌ Failed to fetch test volunteer:', fetchErr);
    return;
  }

  console.log('TEST VOLUNTEER RECORD:');
  console.log('  id:', vol.id);
  console.log('  first_name:', vol.first_name);
  console.log('  committee_id:', vol.committee_id);
  console.log('  updated_at:', (vol as any).updated_at ?? 'COLUMN DOES NOT EXIST / NULL');
  console.log('-----------------------------------------------------------\n');

  let receivedEvent: any = null;
  let connectionStatus = 'PENDING';

  // Step 2: Create isolated subscription channel (Browser B simulation)
  const channel = supabase
    .channel('debug-volunteers-direct-test')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'volunteers',
      },
      (payload) => {
        console.log('\n🔥 [DIRECT REALTIME TEST] PAYLOAD RECEIVED:');
        console.log('  eventType:', payload.eventType);
        console.log('  table:', payload.table);
        console.log('  schema:', payload.schema);
        console.log('  new:', payload.new);
        console.log('  old:', payload.old);
        receivedEvent = payload;
      }
    )
    .subscribe((status) => {
      console.log(`📡 [DIRECT REALTIME STATUS] ${status}`);
      connectionStatus = status;
    });

  // Wait for subscription to establish
  console.log('Waiting for channel subscription to connect...');
  await new Promise(r => setTimeout(r, 3000));

  if (connectionStatus !== 'SUBSCRIBED') {
    console.error(`❌ Channel failed to reach SUBSCRIBED status. Current status: ${connectionStatus}`);
  } else {
    console.log('✅ Channel SUBSCRIBED successfully!');
  }

  // Step 3: Perform UPDATE (Browser A simulation)
  const newName = `${vol.first_name}_TEST_REALTIME`;
  console.log(`\nExecuting UPDATE on volunteer ${vol.id}: first_name -> "${newName}"...`);

  const { error: updateErr } = await supabase
    .from('volunteers')
    .update({ first_name: newName })
    .eq('id', vol.id);

  if (updateErr) {
    console.error('❌ DB UPDATE failed:', updateErr);
  } else {
    console.log('✅ DB UPDATE query completed successfully.');
  }

  // Step 4: Wait to see if WebSocket receives the event
  console.log('Listening for 5 seconds for Realtime WebSocket message...');
  await new Promise(r => setTimeout(r, 5000));

  // Revert test change
  await supabase.from('volunteers').update({ first_name: vol.first_name }).eq('id', vol.id);

  console.log('\n===========================================================');
  console.log('  DIRECT TEST SUMMARY:');
  console.log('  Channel Subscribed:', connectionStatus === 'SUBSCRIBED' ? 'YES' : 'NO');
  console.log('  Realtime Payload Received:', receivedEvent ? 'YES' : 'NO');
  console.log('===========================================================');

  supabase.removeChannel(channel);
}

runDirectRealtimeTest().catch(err => console.error(err));
