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

async function checkOthers() {
  const ids = [
    '5ca4a68d-c81d-4549-abcb-2a44df35745d', // Dora
    '6e83adbf-786b-4644-b348-b3cdc6289e90', // Dagoberto
    '744c6274-39d2-4c90-966d-54f41a58ee99', // Aura
    '4e1d8d70-b9c8-466c-974a-2e743b60df36'  // Steve
  ];

  const { data: logs } = await supabase.from('activity_logs').select('*')
    .in('target_id', ids)
    .order('created_at', { ascending: true });

  console.log(`Found ${logs?.length || 0} logs:`);
  (logs || []).forEach(l => {
    console.log(`${l.created_at} | ${l.user_name} (${l.user_role}) | ${l.action_type} | ${l.description} | ${l.details}`);
  });
}

checkOthers().catch(console.error);
