import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { inferShiftsForSession, getGuatemalaHourFloat } from '../lib/session-utils.js';

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

async function verify() {
  const volunteerId = '6e83adbf-786b-4644-b348-b3cdc6289e90';
  const { data: session } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('volunteer_id', volunteerId)
    .eq('day_key', 'jue 10')
    .single();

  console.log('--- VERIFIED SESSION IN DATABASE ---');
  console.log('ID:', session.id);
  console.log('Day:', session.day_key);
  console.log('Started At (UTC):', session.started_at);
  console.log('Started At (Local America/Guatemala):', new Date(session.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('Ended At (UTC):', session.ended_at);
  console.log('Ended At (Local America/Guatemala):', new Date(session.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('Status:', session.status);

  const matched = inferShiftsForSession(session.day_key, session.started_at, session.ended_at, ['T3']);
  console.log('Matched Shift:', matched.map(m => `${m.name} (${m.timeLabel})`));

  const durMinutes = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000);
  console.log(`Total worked duration: ${Math.floor(durMinutes / 60)}h ${durMinutes % 60}m (${durMinutes} minutes)`);
}

verify().catch(console.error);
