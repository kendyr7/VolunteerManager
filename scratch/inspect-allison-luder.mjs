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

async function inspectCases() {
  console.log('=== CASE 1: ALLISON JAZMIN SALINAS REYES ===');
  const { data: allisonVols } = await supabase
    .from('volunteers')
    .select('*')
    .ilike('first_name', '%Allison%');
  console.log('Allison volunteer(s):', allisonVols);

  if (allisonVols && allisonVols.length > 0) {
    const aId = allisonVols[0].id;
    const { data: aSessions } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('volunteer_id', aId)
      .order('started_at', { ascending: true });
    console.log('Allison sessions:', aSessions);

    const { data: aShifts } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', aId)
      .eq('day_key', 'vie 11');
    console.log('Allison shifts (vie 11):', aShifts);

    const { data: aLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', aId)
      .order('created_at', { ascending: true });
    console.log('Allison logs:', aLogs);
  }

  console.log('\n=== CASE 2: LUDER MOISES GONZALEZ SANTANA ===');
  const { data: luderVols } = await supabase
    .from('volunteers')
    .select('*')
    .ilike('first_name', '%Luder%');
  console.log('Luder volunteer(s):', luderVols);

  if (luderVols && luderVols.length > 0) {
    const lId = luderVols[0].id;
    const { data: lSessions } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('volunteer_id', lId)
      .order('started_at', { ascending: true });
    console.log('Luder sessions:', lSessions);

    const { data: lShifts } = await supabase
      .from('shifts')
      .select('*')
      .eq('volunteer_id', lId)
      .eq('day_key', 'vie 11');
    console.log('Luder shifts (vie 11):', lShifts);

    const { data: lLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', lId)
      .order('created_at', { ascending: true });
    console.log('Luder logs:', lLogs);
  }
}

inspectCases().catch(console.error);
