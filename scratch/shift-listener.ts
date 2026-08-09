import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

console.log('===========================================================');
console.log('  ISOLATED SHIFTS REALTIME LISTENER                        ');
console.log('===========================================================\n');
console.log('URL:', supabaseUrl);

let eventCount = 0;

const channel = supabase
  .channel('debug-shifts-realtime-listener')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'shifts',
    },
    (payload) => {
      eventCount++;
      console.log(`\n🔥 [SHIFTS LISTENER] SHIFT EVENT RECEIVED #${eventCount}:`);
      console.log('  eventType:', payload.eventType);
      console.log('  table:', payload.table);
      console.log('  id:', (payload.new as any)?.id || (payload.old as any)?.id);
      console.log('  new:', payload.new);
      console.log('  old:', payload.old);
    }
  )
  .subscribe((status) => {
    console.log(`📡 [SHIFTS LISTENER STATUS] ${status}`);
    if (status === 'SUBSCRIBED') {
      console.log('✅ SHIFTS LISTENER SUBSCRIBED AND WAITING...\n');
    }
  });

setTimeout(() => {
  console.log(`\n[SHIFTS LISTENER] Total events captured: ${eventCount}`);
  supabase.removeChannel(channel);
  process.exit(0);
}, 15000);
