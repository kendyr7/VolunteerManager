import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const listenerClient = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('--- TESTING SHIFT INSERT/DELETE REALTIME WITH ADMIN MUTATION ---');
  let shiftEventReceived: any = null;

  const ch = listenerClient.channel('test_shift_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      console.log('? LISTENER RECEIVED SHIFT REALTIME EVENT:', payload.eventType, 'payload:', payload.new || payload.old);
      shiftEventReceived = payload;
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 2500));

  // Get test volunteer
  const { data: vols } = await adminClient.from('volunteers').select('id').limit(1);
  const volId = vols![0].id;

  // Perform shift INSERT using Admin client
  console.log('Executing shift INSERT via Admin client...');
  const { data: ins, error: insErr } = await adminClient.from('shifts').insert({
    volunteer_id: volId,
    day_key: 'lun 11',
    shift_key: 'Turno 1'
  }).select().single();

  if (insErr) {
    console.error('Insert error:', insErr);
  } else {
    console.log('Shift inserted ID:', ins.id);
  }

  await new Promise(r => setTimeout(r, 3000));

  if (ins?.id) {
    console.log('Executing shift DELETE via Admin client...');
    await adminClient.from('shifts').delete().eq('id', ins.id);
    await new Promise(r => setTimeout(r, 3000));
  }

  await listenerClient.removeChannel(ch);
  process.exit(0);
}

main().catch(console.error);
