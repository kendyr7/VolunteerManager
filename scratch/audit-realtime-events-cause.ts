import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env vars');
  process.exit(1);
}

// Client 1: Browser client equivalent (Anon Key)
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

// Client 2: Service role client equivalent (Admin)
const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : anonClient;

// Listener client (Simulates Browser B)
const listenerClient = createClient(supabaseUrl, supabaseAnonKey);

interface EventRecord {
  table: string;
  eventType: string;
  payload: any;
  timestamp: number;
}

const receivedEvents: EventRecord[] = [];

async function main() {
  console.log('========================================');
  console.log('  REALTIME CAUSE AUDIT SCRIPT');
  console.log('========================================\n');

  // 1. Subscribe Listener Client (Simulating Browser B)
  const channel = listenerClient.channel('global_coordinator_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, (payload) => {
      console.log('?? [LISTENER] volunteers event:', payload.eventType, 'new:', payload.new, 'old:', payload.old);
      receivedEvents.push({ table: 'volunteers', eventType: payload.eventType, payload, timestamp: Date.now() });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      console.log('?? [LISTENER] shifts event:', payload.eventType, 'new:', payload.new, 'old:', payload.old);
      receivedEvents.push({ table: 'shifts', eventType: payload.eventType, payload, timestamp: Date.now() });
    })
    .subscribe((status) => {
      console.log('?? [LISTENER] Channel status:', status);
    });

  // Wait for subscription to become active
  await new Promise((r) => setTimeout(r, 2500));

  // Find a test volunteer
  const { data: vols } = await adminClient.from('volunteers').select('id, first_name, last_name, neighborhood').eq('status', 'active').limit(1);
  if (!vols || vols.length === 0) {
    console.error('No test volunteer found');
    process.exit(1);
  }
  const testVol = vols[0];
  console.log(`?? Test Volunteer: ${testVol.first_name} (${testVol.id})\n`);

  // --- TEST A: UPDATE volunteers using ADMIN CLIENT (Service Role Key) ---
  console.log('--- TEST A: UPDATE volunteers via Service Role Key (Admin) ---');
  const originalNeigh = testVol.neighborhood || 'Diriomo';
  const newNeigh = `TEST_AUDIT_${Date.now()}`;

  const { data: volUpData, error: volUpErr } = await adminClient
    .from('volunteers')
    .update({ neighborhood: newNeigh })
    .eq('id', testVol.id)
    .select()
    .single();

  console.log('DB Update result:', volUpErr ? `ERROR: ${volUpErr.message}` : `SUCCESS -> neighborhood: ${volUpData?.neighborhood}`);
  await new Promise((r) => setTimeout(r, 3000));

  // --- TEST B: UPDATE volunteers using ANON CLIENT ---
  console.log('\n--- TEST B: UPDATE volunteers via Anon Key ---');
  const { data: volAnonData, error: volAnonErr } = await anonClient
    .from('volunteers')
    .update({ neighborhood: originalNeigh })
    .eq('id', testVol.id)
    .select();

  console.log('Anon DB Update result:', volAnonErr ? `ERROR: ${volAnonErr.message}` : `Rows updated: ${volAnonData?.length}`);
  await new Promise((r) => setTimeout(r, 3000));

  // Restore volunteer
  await adminClient.from('volunteers').update({ neighborhood: originalNeigh }).eq('id', testVol.id);

  // --- TEST C: INSERT shift via ANON CLIENT (as Drawer does) ---
  console.log('\n--- TEST C: INSERT shift via Anon Key (Drawer style) ---');
  const dayKey = 'dom 10';
  const shiftKey = 'Turno 4';

  const { data: shiftInsData, error: shiftInsErr } = await anonClient
    .from('shifts')
    .insert({
      volunteer_id: testVol.id,
      day_key: dayKey,
      shift_key: shiftKey,
    })
    .select();

  console.log('Anon Shift Insert result:', shiftInsErr ? `ERROR: ${shiftInsErr.message}` : `Inserted ID: ${shiftInsData?.[0]?.id}`);
  const insertedShiftId = shiftInsData?.[0]?.id;
  await new Promise((r) => setTimeout(r, 3000));

  // --- TEST D: DELETE shift via ANON CLIENT (as Drawer does) ---
  if (insertedShiftId) {
    console.log('\n--- TEST D: DELETE shift via Anon Key (Drawer style) ---');
    const { data: shiftDelData, error: shiftDelErr } = await anonClient
      .from('shifts')
      .delete()
      .eq('id', insertedShiftId)
      .select();

    console.log('Anon Shift Delete result:', shiftDelErr ? `ERROR: ${shiftDelErr.message}` : `Deleted count: ${shiftDelData?.length}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // --- SUMMARY OF REALTIME EVENTS RECEIVED BY LISTENER ---
  console.log('\n========================================');
  console.log('  EVENTS RECEIVED BY LISTENER (BROWSER B SIMULATION)');
  console.log('========================================');
  console.table(receivedEvents.map(e => ({
    table: e.table,
    eventType: e.eventType,
    hasNew: !!e.payload.new && Object.keys(e.payload.new).length > 0,
    hasOld: !!e.payload.old && Object.keys(e.payload.old).length > 0,
    id: e.payload.new?.id || e.payload.old?.id,
  })));

  await listenerClient.removeChannel(channel);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
