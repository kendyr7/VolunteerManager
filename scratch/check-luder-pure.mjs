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

async function checkLuder() {
  const lId = 'bc108c8c-496b-479a-9f3a-173c86f146e0';

  const { data: vol } = await supabase.from('volunteers').select('*').eq('id', lId).single();
  console.log('=== VOLUNTEER ===');
  console.log(vol);

  const { data: shifts } = await supabase.from('shifts').select('*').eq('volunteer_id', lId).order('day_key');
  console.log('=== SHIFTS ===');
  shifts.forEach(s => console.log(s));

  const { data: sessions } = await supabase.from('attendance_sessions').select('*').eq('volunteer_id', lId).order('started_at');
  console.log('=== SESSIONS ===');
  sessions.forEach(s => console.log(s));
}

checkLuder().catch(console.error);
