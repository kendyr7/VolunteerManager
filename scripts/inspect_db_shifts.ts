import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectShifts() {
  console.log("=== INSPECTING CHECKED_IN SHIFTS ===");
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select(`
      *,
      volunteers (
        id,
        first_name,
        last_name,
        committee_id,
        committees ( name )
      )
    `)
    .eq('checked_in', true);

  if (error) {
    console.error("Error querying shifts:", error);
    return;
  }

  console.log(`Found ${shifts?.length || 0} checked_in shifts:`);
  shifts?.forEach(s => {
    const volName = s.volunteers ? `${s.volunteers.first_name || ''} ${s.volunteers.last_name || ''}`.trim() : 'UNKNOWN';
    console.log(`[Shift ID: ${s.id}] Vol: ${volName} (ID: ${s.volunteer_id}) | DayKey: "${s.day_key}" | ShiftKey: "${s.shift_key}" | CheckedIn: ${s.checked_in} (${s.checked_in_at}) | CheckedOut: ${s.checked_out} (${s.checked_out_at})`);
  });

  console.log("\n=== INSPECTING ALL SHIFTS FOR KENDYR ===");
  const { data: kendyrVols } = await supabase.from('volunteers').select('id, first_name, last_name').ilike('first_name', '%Kendyr%');
  console.log("Kendyr volunteers found:", kendyrVols);

  if (kendyrVols && kendyrVols.length > 0) {
    const ids = kendyrVols.map(v => v.id);
    const { data: kendyrShifts } = await supabase.from('shifts').select('*').in('volunteer_id', ids);
    console.log("Shifts for Kendyr:", kendyrShifts);
  }
}

inspectShifts();
