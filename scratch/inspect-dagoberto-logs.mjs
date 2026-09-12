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
  const volId = '6e83adbf-786b-4644-b348-b3cdc6289e90';
  console.log('=== ACTIVITY LOGS FOR DAGOBERTO ===');
  const { data: logs, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('target_id', volId)
    .order('created_at', { ascending: true });

  if (error) console.error('Error fetching logs:', error);
  else console.log(JSON.stringify(logs, null, 2));

  console.log('\n=== ATTENDANCE SESSION FOR JUE 10 ===');
  const { data: session } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('volunteer_id', volId)
    .eq('day_key', 'jue 10');
  console.log(JSON.stringify(session, null, 2));
}

main().catch(console.error);
