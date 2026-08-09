import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const clientA = createClient(supabaseUrl, serviceKey);
const clientB = createClient(supabaseUrl, serviceKey);

const results = {
  volunteersUPDATE: { clientA: false, clientB: false },
  volunteersINSERT: { clientA: false, clientB: false },
  volunteersDELETE: { clientA: false, clientB: false },
  shiftsINSERT: { clientA: false, clientB: false },
  shiftsDELETE: { clientA: false, clientB: false },
};

const statusMap = {
  clientA: 'CONNECTING',
  clientB: 'CONNECTING',
};

async function runCriticalCallbackTest() {
  console.log('===========================================================');
  console.log('  CRITICAL APP CALLBACK REALTIME TEST                      ');
  console.log('===========================================================\n');

  // Client A Subscription (Simulating Browser A CoordinatorDataProvider)
  const channelA = clientA
    .channel('global_coordinator_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      console.log('🚨 [CRITICAL REALTIME CALLBACK][CLIENT A - SHIFTS]:', payload.eventType, (payload.new as any)?.id || (payload.old as any)?.id);
      if (payload.eventType === 'INSERT') results.shiftsINSERT.clientA = true;
      if (payload.eventType === 'DELETE') results.shiftsDELETE.clientA = true;
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, (payload) => {
      console.log('🚨 [CRITICAL REALTIME CALLBACK][CLIENT A - VOLUNTEERS]:', payload.eventType, (payload.new as any)?.id || (payload.old as any)?.id);
      if (payload.eventType === 'UPDATE') results.volunteersUPDATE.clientA = true;
      if (payload.eventType === 'INSERT') results.volunteersINSERT.clientA = true;
      if (payload.eventType === 'DELETE') results.volunteersDELETE.clientA = true;
    })
    .subscribe((status) => {
      statusMap.clientA = status;
      console.log(`[CLIENT A CHANNEL STATUS]: ${status}`);
    });

  // Client B Subscription (Simulating Browser B CoordinatorDataProvider)
  const channelB = clientB
    .channel('global_coordinator_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      console.log('🚨 [CRITICAL REALTIME CALLBACK][CLIENT B - SHIFTS]:', payload.eventType, (payload.new as any)?.id || (payload.old as any)?.id);
      if (payload.eventType === 'INSERT') results.shiftsINSERT.clientB = true;
      if (payload.eventType === 'DELETE') results.shiftsDELETE.clientB = true;
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, (payload) => {
      console.log('🚨 [CRITICAL REALTIME CALLBACK][CLIENT B - VOLUNTEERS]:', payload.eventType, (payload.new as any)?.id || (payload.old as any)?.id);
      if (payload.eventType === 'UPDATE') results.volunteersUPDATE.clientB = true;
      if (payload.eventType === 'INSERT') results.volunteersINSERT.clientB = true;
      if (payload.eventType === 'DELETE') results.volunteersDELETE.clientB = true;
    })
    .subscribe((status) => {
      statusMap.clientB = status;
      console.log(`[CLIENT B CHANNEL STATUS]: ${status}`);
    });

  // Wait for SUBSCRIBED
  await new Promise(r => setTimeout(r, 2500));

  console.log('\n--- EXECUTING TEST MUTATIONS FROM BROWSER A ---\n');

  // 1. volunteers UPDATE
  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina
  console.log('1. MUTATION: volunteers UPDATE neighborhood -> RT_TEST_A');
  await clientA
    .from('volunteers')
    .update({ neighborhood: 'RT_TEST_A' })
    .eq('id', volunteerId);

  await new Promise(r => setTimeout(r, 2000));

  // Revert neighborhood
  await clientA
    .from('volunteers')
    .update({ neighborhood: 'Diriomo' })
    .eq('id', volunteerId);

  await new Promise(r => setTimeout(r, 2000));

  // 2. volunteers INSERT
  console.log('\n2. MUTATION: volunteers INSERT test volunteer...');
  const { data: insertedVol } = await clientA
    .from('volunteers')
    .insert({
      first_name: 'TestRealtimeVol',
      last_name: 'CallbackCheck',
      phone: '88990011',
      status: 'active',
    })
    .select('id')
    .single();

  await new Promise(r => setTimeout(r, 2000));

  // 3. volunteers DELETE
  if (insertedVol) {
    console.log('\n3. MUTATION: volunteers DELETE test volunteer id:', insertedVol.id);
    await clientA
      .from('volunteers')
      .delete()
      .eq('id', insertedVol.id);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 4. shifts INSERT
  console.log('\n4. MUTATION: shifts INSERT test shift...');
  const { data: insertedShift } = await clientA
    .from('shifts')
    .insert({
      volunteer_id: volunteerId,
      day_key: 'jue 10',
      shift_key: 'Turno Test',
    })
    .select('id')
    .single();

  await new Promise(r => setTimeout(r, 2000));

  // 5. shifts DELETE
  if (insertedShift) {
    console.log('\n5. MUTATION: shifts DELETE test shift id:', insertedShift.id);
    await clientA
      .from('shifts')
      .delete()
      .eq('id', insertedShift.id);
  }

  await new Promise(r => setTimeout(r, 2500));

  console.log('\n===========================================================');
  console.log('  FINAL CRITICAL CALLBACK AUDIT RESULTS                    ');
  console.log('===========================================================');
  console.log('Client A Channel:', 'global_coordinator_realtime', 'Status:', statusMap.clientA);
  console.log('Client B Channel:', 'global_coordinator_realtime', 'Status:', statusMap.clientB);
  console.table(results);

  clientA.removeChannel(channelA);
  clientB.removeChannel(channelB);
}

runCriticalCallbackTest().catch(err => console.error(err));
