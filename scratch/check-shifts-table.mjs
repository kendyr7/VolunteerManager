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

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkShiftsTable() {
  console.log('Checking shifts table for direct check_in / check_out timestamps...');
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .or('checked_in.eq.true,checked_out.eq.true');

  console.log(`Shifts with checked_in=true or checked_out=true: ${shifts?.length || 0}`);
  
  // Check if any shift has short duration in check_in_time/check_out_time
  const shortShifts = [];
  (shifts || []).forEach(s => {
    if (s.checked_in_at && s.checked_out_at) {
      const dur = (new Date(s.checked_out_at) - new Date(s.checked_in_at)) / 60000;
      if (dur < 30) {
        shortShifts.push({ ...s, dur });
      }
    }
  });

  console.log(`Shifts directly with < 30 min duration: ${shortShifts.length}`);
  shortShifts.forEach(s => console.log(s));
}

checkShiftsTable().catch(console.error);
