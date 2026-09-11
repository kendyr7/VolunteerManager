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

async function checkOpenSessions() {
  const { data: openSess, error } = await supabase
    .from('attendance_sessions')
    .select('*, volunteers(first_name, last_name, phone)')
    .eq('status', 'open')
    .order('started_at', { ascending: true });

  console.log(`Open sessions count: ${openSess?.length || 0}`);
  (openSess || []).forEach(s => {
    const startGt = new Date(s.started_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true });
    const dateGt = new Date(s.started_at).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' });
    const name = s.volunteers ? `${s.volunteers.first_name} ${s.volunteers.last_name || ''}`.trim() : 'Desconocido';
    console.log(`[${dateGt} ${s.day_key}] ${name} (${s.volunteers?.phone}): ${startGt} | id: ${s.id}`);
  });
}

checkOpenSessions().catch(console.error);
