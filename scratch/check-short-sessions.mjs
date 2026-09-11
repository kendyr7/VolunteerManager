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

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkShort() {
  const ids = [
    '5ca4a68d-c81d-4549-abcb-2a44df35745d', // Dora
    '6e83adbf-786b-4644-b348-b3cdc6289e90', // Dagoberto
    '744c6274-39d2-4c90-966d-54f41a58ee99', // Aura
    '0ca862e2-c950-42e0-b48d-efc54402a514', // Alma
    '4e1d8d70-b9c8-466c-974a-2e743b60df36'  // Steve
  ];

  const { data: volunteers } = await supabase.from('volunteers').select('id, first_name, last_name').in('id', ids);
  const nameMap = new Map((volunteers || []).map(v => [v.id, `${v.first_name} ${v.last_name || ''}`.trim()]));

  const { data: sessions } = await supabase.from('attendance_sessions').select('*').in('volunteer_id', ids).order('started_at');
  console.log('All sessions for these 5 volunteers:');
  sessions.forEach(s => {
    const startGt = new Date(s.started_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true });
    const endGt = s.ended_at ? new Date(s.ended_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true }) : 'open';
    const durMins = s.ended_at ? Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000 * 10) / 10 : null;
    console.log(`${nameMap.get(s.volunteer_id)} | ${s.day_key} | ${startGt} -> ${endGt} (${durMins} min) | status: ${s.status}`);
  });

  // Also check audit_logs for these volunteers
  const { data: logs } = await supabase.from('audit_logs').select('*').in('volunteer_id', ids).order('created_at', { ascending: false });
  console.log(`\nAudit logs count: ${logs?.length || 0}`);
  (logs || []).forEach(l => {
    console.log(`[LOG] ${l.volunteer_id} | ${l.created_at} | ${l.action || l.title} | ${l.description || l.details}`);
  });
}

checkShort().catch(console.error);
