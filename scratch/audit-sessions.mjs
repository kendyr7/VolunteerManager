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

async function main() {
  console.log('Fetching attendance sessions...');
  const { data: sessions, error: sessErr } = await supabase
    .from('attendance_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (sessErr) {
    console.error('Error fetching sessions:', sessErr);
    return;
  }

  console.log(`Total attendance_sessions: ${sessions.length}`);

  // Fetch volunteers map
  const { data: volunteers } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, committee_id, status');
  const volMap = new Map((volunteers || []).map(v => [v.id, v]));

  // Fetch shifts for these sessions
  const { data: shifts } = await supabase
    .from('shifts')
    .select('*');
  
  console.log(`Total shifts: ${shifts?.length || 0}`);

  // Inspect each session: start time, end time, duration in minutes
  const sessionAnalysis = [];

  for (const s of sessions) {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : null;
    const durMin = end ? (end.getTime() - start.getTime()) / 60000 : null;

    const startGt = start.toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true });
    const endGt = end ? end.toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true }) : 'En curso';
    const startDateGt = start.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' });

    const vol = volMap.get(s.volunteer_id);
    const volShifts = (shifts || []).filter(sh => sh.volunteer_id === s.volunteer_id && (sh.day_key?.toLowerCase() === s.day_key?.toLowerCase()));

    sessionAnalysis.push({
      id: s.id,
      volunteer_id: s.volunteer_id,
      volunteer_name: vol ? `${vol.first_name} ${vol.last_name || ''}`.trim() : 'Desconocido',
      phone: vol?.phone,
      day_key: s.day_key,
      status: s.status,
      started_at: s.started_at,
      ended_at: s.ended_at,
      start_gt: startGt,
      end_gt: endGt,
      date_gt: startDateGt,
      dur_minutes: durMin ? Math.round(durMin * 10) / 10 : null,
      auto_closed: s.auto_closed,
      shifts: volShifts.map(sh => ({
        shift_key: sh.shift_key,
        checked_in: sh.checked_in,
        checked_out: sh.checked_out,
        status: sh.status,
        check_in_time: sh.check_in_time,
        check_out_time: sh.check_out_time
      }))
    });
  }

  // Find exact match or near match for 11:47 / 11:51
  console.log('\n--- SESSIONS WITH 11:47 OR 11:51 ---');
  const exactMatches = sessionAnalysis.filter(s => s.start_gt.includes('11:47') || s.end_gt.includes('11:51'));
  console.log(JSON.stringify(exactMatches, null, 2));

  // Find all short sessions (< 30 mins, < 60 mins)
  console.log('\n--- SHORT SESSIONS (< 30 min) ---');
  const shortSessions = sessionAnalysis.filter(s => s.dur_minutes !== null && s.dur_minutes < 30);
  console.log(`Found ${shortSessions.length} short sessions (< 30 min):`);
  shortSessions.forEach(s => {
    console.log(`- [${s.date_gt} ${s.day_key}] ${s.volunteer_name} (${s.phone}): ${s.start_gt} -> ${s.end_gt} (${s.dur_minutes} min) | Turnos asignados: ${s.shifts.map(x => `${x.shift_key}(in:${x.checked_in},out:${x.checked_out})`).join(', ')}`);
  });

  // Find all sessions where start is around 11:00 AM - 12:00 PM (the T1/T2 overlap window)
  console.log('\n--- SESSIONS BETWEEN 11:00 AM AND 12:00 PM ---');
  const overlapWindowSessions = sessionAnalysis.filter(s => {
    const d = new Date(s.started_at);
    const hourFloat = d.getUTCHours() - 6 + d.getUTCMinutes() / 60; // Approx GT is UTC-6
    return hourFloat >= 10.9 && hourFloat <= 12.1;
  });
  console.log(`Found ${overlapWindowSessions.length} sessions started between 11:00 AM and 12:00 PM:`);
  overlapWindowSessions.forEach(s => {
    console.log(`- [${s.date_gt} ${s.day_key}] ${s.volunteer_name} (${s.phone}): ${s.start_gt} -> ${s.end_gt} (${s.dur_minutes} min) | Turnos: ${s.shifts.map(x => `${x.shift_key}(in:${x.checked_in},out:${x.checked_out})`).join(', ')}`);
  });
}

main().catch(console.error);
