import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { useVolunteerStore } from '../lib/store/use-volunteer-store';
import { RealtimeEventQueue } from '../lib/services/realtime-event-queue';

if (typeof (global as any).requestAnimationFrame === 'undefined') {
  (global as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
}

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function verifyMultiClientShiftsCycle() {
  console.log('===========================================================');
  console.log('  MULTI-CLIENT REALTIME SHIFTS CYCLE TEST                  ');
  console.log('===========================================================\n');

  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina
  const dayKey = 'jue 10';
  const shiftKey = 'Turno 1';

  // Create Browser B simulate queue
  const queueB = new RealtimeEventQueue((processed) => {
    console.log('[BROWSER B QUEUE FLUSHED] processed events:', processed.length);
  });

  // Setup Browser B Realtime Listener
  const channelB = supabase
    .channel('simulated-browser-b-shifts')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shifts' },
      (payload) => {
        console.log(`📡 [BROWSER B REALTIME EVENT] ${payload.eventType} for shift id: ${(payload.new as any)?.id || (payload.old as any)?.id}`);
        if (payload.eventType === 'DELETE') {
          queueB.enqueue('DELETE', payload.old, 'shifts');
        } else {
          queueB.enqueue(payload.eventType as any, payload.new, 'shifts');
        }
      }
    )
    .subscribe();

  await new Promise(r => setTimeout(r, 2000));

  // --- STEP 1: Browser A Adds Shift ---
  console.log('\n--- STEP 1: BROWSER A ADDS SHIFT ---');
  const { data: inserted1, error: insErr1 } = await supabase
    .from('shifts')
    .upsert({ volunteer_id: volunteerId, day_key: dayKey, shift_key: shiftKey }, { onConflict: 'volunteer_id,day_key,shift_key' })
    .select('*')
    .single();

  if (insErr1) throw insErr1;
  console.log('  Browser A INSERT committed shiftId:', inserted1.id);

  await new Promise(r => setTimeout(r, 2000));

  let shiftsInB = useVolunteerStore.getState().shiftsByVolunteerMap.get(volunteerId) || [];
  let isAssignedInB = shiftsInB.some((s: any) => s.day_key === dayKey && s.shift_key === shiftKey);
  console.log(`  Browser B Drawer sees shift assigned after STEP 1?: ${isAssignedInB ? 'YES ✅' : 'NO ❌'} (count=${shiftsInB.length})`);

  // --- STEP 2: Browser A Removes Shift ---
  console.log('\n--- STEP 2: BROWSER A REMOVES SHIFT ---');
  const { error: delErr } = await supabase
    .from('shifts')
    .delete()
    .eq('id', inserted1.id);

  if (delErr) throw delErr;
  console.log('  Browser A DELETE committed for shiftId:', inserted1.id);

  await new Promise(r => setTimeout(r, 2000));

  shiftsInB = useVolunteerStore.getState().shiftsByVolunteerMap.get(volunteerId) || [];
  isAssignedInB = shiftsInB.some((s: any) => s.day_key === dayKey && s.shift_key === shiftKey);
  console.log(`  Browser B Drawer sees shift removed after STEP 2?: ${!isAssignedInB ? 'YES ✅ (REMOVED)' : 'NO ❌'} (count=${shiftsInB.length})`);

  // --- STEP 3: Browser A Adds Shift Again ---
  console.log('\n--- STEP 3: BROWSER A ADDS SHIFT AGAIN ---');
  const { data: inserted2, error: insErr2 } = await supabase
    .from('shifts')
    .upsert({ volunteer_id: volunteerId, day_key: dayKey, shift_key: shiftKey }, { onConflict: 'volunteer_id,day_key,shift_key' })
    .select('*')
    .single();

  if (insErr2) throw insErr2;
  console.log('  Browser A INSERT committed shiftId:', inserted2.id);

  await new Promise(r => setTimeout(r, 2000));

  shiftsInB = useVolunteerStore.getState().shiftsByVolunteerMap.get(volunteerId) || [];
  isAssignedInB = shiftsInB.some((s: any) => s.day_key === dayKey && s.shift_key === shiftKey);
  console.log(`  Browser B Drawer sees shift assigned again after STEP 3?: ${isAssignedInB ? 'YES ✅' : 'NO ❌'} (count=${shiftsInB.length})`);

  // Cleanup shift
  await supabase.from('shifts').delete().eq('id', inserted2.id);
  supabase.removeChannel(channelB);
  console.log('\n[CLEANED UP TEST SHIFT & SUBSCRIPTION]');
}

verifyMultiClientShiftsCycle().catch(err => console.error(err));
