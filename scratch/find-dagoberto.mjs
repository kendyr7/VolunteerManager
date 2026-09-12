import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('Searching for Dagoberto in volunteers table...');
  const { data: vols, error: volErr } = await supabase
    .from('volunteers')
    .select('*')
    .ilike('first_name', '%Dagoberto%');

  if (volErr) {
    console.error('Error fetching volunteers:', volErr);
    return;
  }

  console.log('Volunteers found:', vols);

  if (!vols || vols.length === 0) {
    const { data: allVols } = await supabase.from('volunteers').select('id, first_name, last_name').limit(20);
    console.log('Sample volunteers:', allVols);
    return;
  }

  for (const v of vols) {
    console.log(`\n=== VOLUNTEER: ${v.first_name} ${v.last_name} (ID: ${v.id}) ===`);
    
    // Check attendance_sessions
    const { data: sessions, error: sessErr } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('volunteer_id', v.id)
      .order('started_at', { ascending: true });
    
    console.log('Attendance Sessions:', sessions);
    if (sessErr) console.error('Session error:', sessErr);

    // Check shifts
    const { data: shifts, error: shiftErr } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', v.id);

    console.log('Shifts:', shifts);
    if (shiftErr) console.error('Shift error:', shiftErr);
  }
}

main().catch(console.error);
