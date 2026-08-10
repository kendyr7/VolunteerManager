import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { checkOutVolunteer, checkInVolunteer } from '../app/actions/attendance';
import { processShiftsData } from '../lib/coordinator-data';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const realtimeClient = createClient(supabaseUrl, supabaseAnonKey);

async function testCheckoutRealtimeCheckInSync() {
  console.log('===========================================================');
  console.log('  TESTING CHECKOUT -> REALTIME BROADCAST -> CHECKIN SYNC   ');
  console.log('===========================================================\n');

  // 1. Setup Realtime Listener representing Browser B on /check-in
  const receivedBroadcasts: any[] = [];
  const channel = realtimeClient.channel('global_coordinator_realtime');

  channel.on('broadcast', { event: 'shift_sync' }, (payload) => {
    console.log(`🎯 [BROWSER B REALTIME RECEIVED] Event=${payload.payload?.eventType}, Table=${payload.payload?.table}, Shift ID=${payload.payload?.record?.id}, checked_out=${payload.payload?.record?.checked_out}`);
    receivedBroadcasts.push(payload.payload);
  });

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      console.log('[BROWSER B CLIENT] Realtime Channel Status:', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  // Fetch test volunteer
  const { data: vol } = await adminClient.from('volunteers').select('id, first_name, last_name').limit(1).single();
  if (!vol) throw new Error('No test volunteer found');
  const volunteerId = vol.id;

  // Setup test shift
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);
  const { data: initialShift } = await adminClient.from('shifts').insert({
    volunteer_id: volunteerId,
    day_key: '2026-08-28',
    shift_key: 'T1',
    checked_in: true,
    checked_in_at: new Date().toISOString(),
    checked_out: false
  }).select('*').single();

  if (!initialShift) throw new Error('Could not create test shift');
  const shiftId = initialShift.id;
  console.log(`Created Test Shift (Checked-in): ID=${shiftId}, Vol=${vol.first_name} ${vol.last_name}\n`);

  await new Promise((r) => setTimeout(r, 1500));

  // 2. Simular Browser A: checkOutVolunteer(shiftId)
  console.log('--- BROWSER A: Performing checkOutVolunteer(shiftId) ---');
  const initialBroadcastCount = receivedBroadcasts.length;
  const checkoutRes = await checkOutVolunteer(shiftId);
  console.log('checkOutVolunteer Result:', checkoutRes);

  // Wait for broadcast delivery to Browser B
  await new Promise((r) => setTimeout(r, 2500));

  // 3. Verify Broadcast Reception on Browser B
  const sliceB = receivedBroadcasts.slice(initialBroadcastCount);
  const checkoutBroadcast = sliceB.find(b => b.eventType === 'UPDATE' && b.record?.id === shiftId);

  const broadcastReceived = !!checkoutBroadcast;
  console.log(`\nBrowser B Received Broadcast? ${broadcastReceived ? '✅ YES' : '❌ NO'}`);

  if (checkoutBroadcast) {
    const isCheckedOutInRecord = checkoutBroadcast.record?.checked_out === true;
    console.log(`Broadcast Record checked_out is true? ${isCheckedOutInRecord ? '✅ YES' : '❌ NO'}`);

    // 4. Verify processShiftsData checkedOutMap computation
    const derived = processShiftsData([checkoutBroadcast.record]);
    const checkedOutByShiftId = derived.checkedOutMap[shiftId] === true;
    const checkedOutByVolId = derived.checkedOutMap[volunteerId] === true;
    const checkedOutByKey = derived.checkedOutMap[`${volunteerId}-2026-08-28-T1`] === true;

    console.log(`checkedOutMap[shiftId] is true? ${checkedOutByShiftId ? '✅ YES' : '❌ NO'}`);
    console.log(`checkedOutMap[volId] is true? ${checkedOutByVolId ? '✅ YES' : '❌ NO'}`);
    console.log(`checkedOutMap[volId-day-shift] is true? ${checkedOutByKey ? '✅ YES' : '❌ NO'}`);

    if (broadcastReceived && isCheckedOutInRecord && checkedOutByShiftId && checkedOutByVolId && checkedOutByKey) {
      console.log('\n✨ CHECKOUT REALTIME /CHECK-IN SYNC VERIFIED 100% SUCCESSFULLY!');
    } else {
      console.error('\n❌ VERIFICATION FAILED!');
      process.exit(1);
    }
  } else {
    console.error('\n❌ NO BROADCAST RECEIVED BY BROWSER B!');
    process.exit(1);
  }

  // Cleanup
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);
  await channel.unsubscribe();
}

testCheckoutRealtimeCheckInSync().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
