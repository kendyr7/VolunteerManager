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

async function checkFridaySessions() {
  const { data: sessions, error } = await supabase
    .from('attendance_sessions')
    .select(`
      *,
      volunteers ( id, first_name, last_name, phone )
    `)
    .eq('day_key', 'vie 11')
    .order('started_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total sessions on vie 11: ${sessions.length}`);
  
  // Find sessions where start was in evening (> 6 PM) but volunteer had early shifts assigned
  for (const s of sessions) {
    const volName = s.volunteers ? `${s.volunteers.first_name} ${s.volunteers.last_name}` : 'Unknown';
    const startD = new Date(s.started_at);
    const startGuat = startD.toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour12: true });
    const endGuat = s.ended_at ? new Date(s.ended_at).toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour12: true }) : 'Abierta';
    
    const startHourFloat = startD.getUTCHours() - 6 + (startD.getUTCMinutes() / 60);
    const normalizedHour = (startHourFloat + 24) % 24;

    const durMin = s.ended_at ? Math.round((new Date(s.ended_at) - startD) / 60000) : null;

    if (normalizedHour >= 18 || (durMin !== null && durMin < 30)) {
      console.log(`[Candidate late/short] ${volName} | Start: ${startGuat} | End: ${endGuat} | Dur: ${durMin}m | Status: ${s.status}`);
    }
  }
}

checkFridaySessions().catch(console.error);
