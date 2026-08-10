import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function testBroadcast() {
  console.log('--- Testing Supabase Realtime Broadcast ---');

  // Client 1 (Subscriber)
  const client1 = createClient(supabaseUrl, supabaseAnonKey);
  const ch1 = client1.channel('global_coordinator_realtime');

  let received = false;
  ch1.on('broadcast', { event: 'shift_sync' }, (payload) => {
    console.log('CLIENT 1 RECEIVED BROADCAST:', JSON.stringify(payload, null, 2));
    received = true;
  });

  await new Promise<void>((resolve) => {
    ch1.subscribe((status) => {
      console.log('Ch1 status:', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  console.log('Subscribed Ch1. Now sending broadcast from Server/Client2...');

  // Option A: Send via Service Role Client
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const chAdmin = adminClient.channel('global_coordinator_realtime');
  await new Promise<void>((resolve) => {
    chAdmin.subscribe(async (status) => {
      console.log('ChAdmin status:', status);
      if (status === 'SUBSCRIBED') {
        const sendRes = await chAdmin.send({
          type: 'broadcast',
          event: 'shift_sync',
          payload: {
            eventType: 'INSERT',
            table: 'shifts',
            record: {
              id: 'test-shift-123',
              volunteer_id: 'test-vol-456',
              day_key: '2026-08-15',
              shift_key: 'T1',
              updated_at: new Date().toISOString()
            }
          }
        });
        console.log('Broadcast send result:', sendRes);
        resolve();
      }
    });
  });

  // Wait 3 seconds to see if received
  await new Promise((r) => setTimeout(r, 3000));
  console.log('Broadcast test complete. Received?', received);

  await ch1.unsubscribe();
  await chAdmin.unsubscribe();
}

testBroadcast().catch(console.error);
