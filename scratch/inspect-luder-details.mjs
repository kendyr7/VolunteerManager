import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { inferShiftsForSession, getGuatemalaHourFloat, getContinuousScheduledBlockForSession } from '../lib/session-utils.ts';
import { getOfficialShiftTime } from '../lib/dates.ts';

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

async function inspectLuder() {
  const lId = 'bc108c8c-496b-479a-9f3a-173c86f146e0';
  
  const { data: shifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('volunteer_id', lId)
    .order('day_key');

  const { data: sessions } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('volunteer_id', lId)
    .order('started_at');

  console.log('=== LUDER SHIFTS ===');
  shifts.forEach(s => console.log(`[Shift] ${s.day_key} ${s.shift_key} (ID: ${s.id}) checked_in: ${s.checked_in} checked_out: ${s.checked_out}`));

  console.log('\n=== LUDER SESSIONS ===');
  sessions.forEach(s => {
    console.log(`[Session] ID: ${s.id} | Day: ${s.day_key} | Status: ${s.status}`);
    console.log(`  Started: ${s.started_at} -> Local: ${new Date(s.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })}`);
    console.log(`  Ended:   ${s.ended_at} -> Local: ${s.ended_at ? new Date(s.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }) : 'null'}`);
    console.log(`  Updated: ${s.updated_at}`);
  });

  // Check what inferShiftsForSession and blocks calculate for Luder on vie 11:
  const v11Shifts = shifts.filter(s => s.day_key === 'vie 11').map(s => s.shift_key);
  const v11Session = sessions.find(s => s.day_key === 'vie 11');
  console.log('\n=== LUDER VIE 11 EVALUATION ===');
  console.log('Assigned shifts:', v11Shifts);
  if (v11Session) {
    const block = getContinuousScheduledBlockForSession('vie 11', v11Session.started_at, v11Shifts);
    console.log('Continuous Block:', block);
    const matched = inferShiftsForSession('vie 11', v11Session.started_at, v11Session.ended_at, v11Shifts);
    console.log('Matched Shifts:', matched.map(m => `${m.shiftKey} (${m.timeLabel})`));
  }
}

inspectLuder().catch(console.error);
