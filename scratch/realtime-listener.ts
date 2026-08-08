import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

console.log('===========================================================');
console.log('  REALTIME LISTENER (SEPARATE ISOLATED PROCESS)            ');
console.log('===========================================================\n');
console.log('URL:', supabaseUrl);

let receivedCount = 0;

const channel = supabase
  .channel('realtime-listener-isolated')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'volunteers',
    },
    (payload) => {
      receivedCount++;
      console.log('\n🔥 [LISTENER] REALTIME EVENT RECEIVED #', receivedCount);
      console.log('  eventType:', payload.eventType);
      console.log('  table:', payload.table);
      console.log('  schema:', payload.schema);
      console.log('  id:', (payload.new as any)?.id || (payload.old as any)?.id);
      console.log('  new:', payload.new);
      console.log('  old:', payload.old);
    }
  )
  .subscribe((status) => {
    console.log(`📡 [LISTENER STATUS] ${status}`);
    if (status === 'SUBSCRIBED') {
      console.log('✅ LISTENER IS SUBSCRIBED AND WAITING FOR WRITER EVENTS...\n');
    }
  });

// Keep process alive for 25 seconds
setTimeout(() => {
  console.log('\n[LISTENER] Total events received:', receivedCount);
  supabase.removeChannel(channel);
  process.exit(0);
}, 25000);
