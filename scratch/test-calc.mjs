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

// We can test inferShiftsForSession by importing it through a small script or mimicking its exact logic:
function getGuatemalaHourFloat(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  const guatemalaString = d.toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaDate = new Date(guatemalaString);
  return guatemalaDate.getHours() + guatemalaDate.getMinutes() / 60 + guatemalaDate.getSeconds() / 3600;
}

const SHIFTS = {
  T1: { start: 7.0, end: 12.0, dur: 300 },
  T2: { start: 11.0, end: 15.0, dur: 240 },
  T3: { start: 14.0, end: 18.0, dur: 240 },
  T4: { start: 17.0, end: 21.0, dur: 240 },
};

function testLuderAndAllison() {
  console.log('=== LUDER TEST ===');
  const luderStart = '2026-09-11T13:52:52.771+00:00'; // 7:52:52 AM
  const luderEnd = '2026-09-12T01:58:55.008+00:00';   // 7:58:55 PM
  const lStartHour = getGuatemalaHourFloat(luderStart);
  const lEndHour = getGuatemalaHourFloat(luderEnd);
  console.log(`Luder start hour: ${lStartHour.toFixed(2)} | end hour: ${lEndHour.toFixed(2)}`);
  
  for (const [key, s] of Object.entries(SHIFTS)) {
    if (!['T1', 'T2', 'T3'].includes(key)) continue;
    const overlapStart = Math.max(lStartHour, s.start);
    const overlapEnd = Math.min(lEndHour, s.end);
    const durMins = Math.max(0, overlapEnd - overlapStart) * 60;
    const reqMins = Math.max(60, s.dur * 0.5);
    console.log(`  ${key}: overlap ${durMins.toFixed(0)} min / required ${reqMins} min -> ${durMins >= reqMins ? 'COMPLETED' : 'NOT COMPLETED'}`);
  }

  console.log('\n=== ALLISON TEST (Target: 8:00 AM -> 9:00 PM) ===');
  const allisonStart = '2026-09-11T14:00:00.000Z'; // 8:00 AM local
  const allisonEnd = '2026-09-12T03:00:00.000Z';   // 9:00 PM local
  const aStartHour = getGuatemalaHourFloat(allisonStart);
  const aEndHour = getGuatemalaHourFloat(allisonEnd);
  console.log(`Allison start hour: ${aStartHour.toFixed(2)} | end hour: ${aEndHour.toFixed(2)}`);

  for (const [key, s] of Object.entries(SHIFTS)) {
    const overlapStart = Math.max(aStartHour, s.start);
    const overlapEnd = Math.min(aEndHour, s.end);
    const durMins = Math.max(0, overlapEnd - overlapStart) * 60;
    const reqMins = Math.max(60, s.dur * 0.5);
    console.log(`  ${key}: overlap ${durMins.toFixed(0)} min / required ${reqMins} min -> ${durMins >= reqMins ? 'COMPLETED' : 'NOT COMPLETED'}`);
  }
}

testLuderAndAllison();
