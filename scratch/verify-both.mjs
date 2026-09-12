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

function getGuatemalaHourFloat(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  const guatemalaString = d.toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaDate = new Date(guatemalaString);
  return guatemalaDate.getHours() + guatemalaDate.getMinutes() / 60 + guatemalaDate.getSeconds() / 3600;
}

const SHIFT_SPECS = {
  T1: { name: 'Turno 1', start: 7.0, end: 12.0, dur: 300, label: '7:00 AM - 12:00 PM' },
  T2: { name: 'Turno 2', start: 11.0, end: 15.0, dur: 240, label: '11:00 AM - 3:00 PM' },
  T3: { name: 'Turno 3', start: 14.0, end: 18.0, dur: 240, label: '2:00 PM - 6:00 PM' },
  T4: { name: 'Turno 4', start: 17.0, end: 21.0, dur: 240, label: '5:00 PM - 9:00 PM' },
};

async function verifyAll() {
  console.log('=== VERIFYING ALLISON ===');
  const aId = '4799dfcd-04b0-4edc-9401-98d7949a3956';
  const { data: aSession } = await supabase.from('attendance_sessions').select('*').eq('id', '63a064f8-2c00-4f70-b2cc-3e8693f82d01').single();
  console.log('Allison session ID:', aSession.id);
  console.log('Start (Local GT):', new Date(aSession.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('End   (Local GT):', new Date(aSession.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('Status:', aSession.status);
  
  const aStartHour = getGuatemalaHourFloat(aSession.started_at);
  const aEndHour = getGuatemalaHourFloat(aSession.ended_at);
  const durM = Math.round((new Date(aSession.ended_at) - new Date(aSession.started_at)) / 60000);
  console.log(`Duration: ${Math.floor(durM / 60)}h ${durM % 60}m (${durM} min)`);
  
  const aCompletedShifts = [];
  for (const [key, s] of Object.entries(SHIFT_SPECS)) {
    const overlapStart = Math.max(aStartHour, s.start);
    const overlapEnd = Math.min(aEndHour, s.end);
    const overlapM = Math.max(0, overlapEnd - overlapStart) * 60;
    if (overlapM >= s.dur * 0.5) {
      aCompletedShifts.push(`${key} (${s.name}: ${s.label})`);
    }
  }
  console.log('Completed shifts for Allison:', aCompletedShifts);

  console.log('\n=== VERIFYING LUDER ===');
  const lId = 'bc108c8c-496b-479a-9f3a-173c86f146e0';
  const { data: lSession } = await supabase.from('attendance_sessions').select('*').eq('id', '084352ea-5576-4728-9b1f-616e845b6088').single();
  console.log('Luder session ID:', lSession.id);
  console.log('Start (Local GT):', new Date(lSession.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('End   (Local GT):', new Date(lSession.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('Status:', lSession.status);

  const lStartHour = getGuatemalaHourFloat(lSession.started_at);
  const lEndHour = getGuatemalaHourFloat(lSession.ended_at);
  const lDurM = Math.round((new Date(lSession.ended_at) - new Date(lSession.started_at)) / 60000);
  console.log(`Duration: ${Math.floor(lDurM / 60)}h ${lDurM % 60}m (${lDurM} min)`);

  const lCompletedShifts = [];
  for (const [key, s] of Object.entries(SHIFT_SPECS)) {
    if (!['T1', 'T2', 'T3'].includes(key)) continue;
    const overlapStart = Math.max(lStartHour, s.start);
    const overlapEnd = Math.min(lEndHour, s.end);
    const overlapM = Math.max(0, overlapEnd - overlapStart) * 60;
    if (overlapM >= s.dur * 0.5) {
      lCompletedShifts.push(`${key} (${s.name}: ${s.label})`);
    }
  }
  console.log('Completed shifts for Luder:', lCompletedShifts);
}

verifyAll().catch(console.error);
