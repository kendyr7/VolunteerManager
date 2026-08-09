import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function runShiftWriter() {
  console.log('===========================================================');
  console.log('  ISOLATED SHIFTS REALTIME WRITER                          ');
  console.log('===========================================================\n');

  const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina
  const testDayKey = 'jue 10';
  const testShiftKey = 'Turno 1';

  // 1. Execute INSERT (upsert) shift
  console.log(`[1. WRITER INSERT] Adding shift: volunteer_id=${volunteerId}, day_key="${testDayKey}", shift_key="${testShiftKey}"...`);

  const { data: inserted, error: insErr } = await supabase
    .from('shifts')
    .upsert(
      {
        volunteer_id: volunteerId,
        day_key: testDayKey,
        shift_key: testShiftKey,
      },
      { onConflict: 'volunteer_id,day_key,shift_key' }
    )
    .select('*')
    .single();

  if (insErr) {
    console.error('❌ Shift INSERT error:', insErr);
    return;
  }
  console.log('✅ Shift INSERT committed:', inserted);

  // Wait 3 seconds
  await new Promise(r => setTimeout(r, 3000));

  // 2. Execute DELETE shift
  console.log(`\n[2. WRITER DELETE] Deleting shift: id=${inserted.id}...`);

  const { error: delErr } = await supabase
    .from('shifts')
    .delete()
    .eq('id', inserted.id);

  if (delErr) {
    console.error('❌ Shift DELETE error:', delErr);
  } else {
    console.log('✅ Shift DELETE committed for id:', inserted.id);
  }
}

runShiftWriter().catch(err => console.error(err));
