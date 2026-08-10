import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function runShiftBroadcastVerification() {
  console.log('===========================================================');
  console.log('  TESTING REALTIME BROADCAST SHIFT MUTATION CYCLE (A -> B) ');
  console.log('===========================================================\n');

  // Client B (Simulated Browser B listening on global_coordinator_realtime)
  const clientB = createClient(supabaseUrl, supabaseAnonKey);
  const chB = clientB.channel('global_coordinator_realtime');

  let broadcastReceivedInsert = false;
  let broadcastReceivedDelete = false;
  let receivedRecord: any = null;

  chB.on('broadcast', { event: 'shift_sync' }, (payload) => {
    console.log('🎯 [BROWSER B] RECEIVED BROADCAST SHIFT EVENT:', JSON.stringify(payload, null, 2));
    if (payload.payload?.eventType === 'INSERT') {
      broadcastReceivedInsert = true;
      receivedRecord = payload.payload.record;
    } else if (payload.payload?.eventType === 'DELETE') {
      broadcastReceivedDelete = true;
    }
  });

  await new Promise<void>((resolve) => {
    chB.subscribe((status) => {
      console.log('[BROWSER B] Channel status:', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  console.log('\n[BROWSER A] Fetching a real volunteer ID for testing...');
  const { data: realVol } = await clientB.from('volunteers').select('id').limit(1).single();
  const testVolId = realVol?.id || '00000000-0000-0000-0000-000000000001';
  console.log('Using test volunteerId:', testVolId);

  const testDayKey = '2026-08-25';
  const testShiftKey = 'T3';

  // Perform toggleShift (assign = true)
  const insResult = await VolunteerMutationService.toggleShift(testVolId, testDayKey, testShiftKey, true);
  console.log('[BROWSER A] toggleShift INSERT result:', insResult);

  // Wait 3 seconds for Browser B to receive broadcast
  await new Promise((r) => setTimeout(r, 3000));

  console.log('\n[BROWSER A] Executing toggleShift (DELETE)...');
  const delResult = await VolunteerMutationService.toggleShift(testVolId, testDayKey, testShiftKey, false);
  console.log('[BROWSER A] toggleShift DELETE result:', delResult);

  // Wait 3 seconds for Browser B to receive broadcast
  await new Promise((r) => setTimeout(r, 3000));

  await chB.unsubscribe();

  console.log('\n===========================================================');
  console.log(`  VERIFICATION RESULTS:`);
  console.log(`  INSERT Broadcast Received by Browser B? ${broadcastReceivedInsert ? '✅ YES' : '❌ NO'}`);
  console.log(`  DELETE Broadcast Received by Browser B? ${broadcastReceivedDelete ? '✅ YES' : '❌ NO'}`);
  if (receivedRecord) {
    console.log(`  Received Record Data: shift_id=${receivedRecord.id}, volunteer_id=${receivedRecord.volunteer_id}, day_key=${receivedRecord.day_key}, shift_key=${receivedRecord.shift_key}`);
  }
  console.log('===========================================================');

  if (broadcastReceivedInsert && broadcastReceivedDelete) {
    console.log('\n✨ Realtime shift synchronization A -> B is 100% WORKING and VERIFIED!');
  } else {
    console.error('\n⚠️ Broadcast event was not received by Browser B.');
  }
}

runShiftBroadcastVerification().catch(console.error);
