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

async function printData() {
  console.log('--- ALLISON ---');
  const { data: allison } = await supabase.from('volunteers').select('id, first_name, last_name').ilike('first_name', '%Allison%').single();
  console.log('Allison:', allison);
  
  const { data: aSessions } = await supabase.from('attendance_sessions').select('*').eq('volunteer_id', allison.id);
  console.log('Allison sessions:');
  for (const s of aSessions) {
    console.log(`  id: ${s.id} | day_key: ${s.day_key} | started_at: ${s.started_at} (local: ${new Date(s.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })}) | ended_at: ${s.ended_at ? new Date(s.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }) : 'null'} | status: ${s.status}`);
  }

  const { data: aShifts } = await supabase.from('shifts').select('*').eq('volunteer_id', allison.id).order('day_key');
  console.log('Allison shifts:');
  for (const sh of aShifts) {
    console.log(`  id: ${sh.id} | day_key: ${sh.day_key} | shift_key: ${sh.shift_key}`);
  }

  console.log('\n--- LUDER ---');
  const { data: luder } = await supabase.from('volunteers').select('id, first_name, last_name').ilike('first_name', '%Luder%').single();
  console.log('Luder:', luder);

  const { data: lSessions } = await supabase.from('attendance_sessions').select('*').eq('volunteer_id', luder.id);
  console.log('Luder sessions:');
  for (const s of lSessions) {
    console.log(`  id: ${s.id} | day_key: ${s.day_key} | started_at: ${s.started_at} (local: ${new Date(s.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })}) | ended_at: ${s.ended_at ? `${s.ended_at} (local: ${new Date(s.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })})` : 'null'} | status: ${s.status}`);
  }

  const { data: lShifts } = await supabase.from('shifts').select('*').eq('volunteer_id', luder.id).order('day_key');
  console.log('Luder shifts:');
  for (const sh of lShifts) {
    console.log(`  id: ${sh.id} | day_key: ${sh.day_key} | shift_key: ${sh.shift_key}`);
  }
}

printData().catch(console.error);
