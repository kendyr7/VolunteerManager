import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getGuatemalaHourFloat, inferShiftsForSession } from '../lib/session-utils.js';

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

async function testSimulation() {
  const newStartIso = '2026-09-10T21:00:00.000Z'; // 15:00:00 UTC-6 (3:00 PM)
  const currentEndIso = '2026-09-10T23:57:18.345Z'; // 17:57:18 UTC-6 (5:57 PM)

  console.log('--- Testing Time Conversions ---');
  console.log('New Start ISO:', newStartIso);
  const startD = new Date(newStartIso);
  console.log('Start formatted in America/Guatemala:', startD.toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('Start hour float:', getGuatemalaHourFloat(newStartIso)); // Expect 15.0

  console.log('\nCurrent End ISO:', currentEndIso);
  const endD = new Date(currentEndIso);
  console.log('End formatted in America/Guatemala:', endD.toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true }));
  console.log('End hour float:', getGuatemalaHourFloat(currentEndIso)); // Expect ~17.955

  console.log('\n--- Testing inferShiftsForSession ---');
  const matched = inferShiftsForSession('jue 10', newStartIso, currentEndIso, ['T3']);
  console.log('Matched shifts for Dagoberto with 3:00 PM start:', matched);

  // Compare with before
  const oldStartIso = '2026-09-10T23:57:02.044Z';
  const oldMatched = inferShiftsForSession('jue 10', oldStartIso, currentEndIso, ['T3']);
  console.log('Old matched shifts with 5:57 PM start:', oldMatched);
}

testSimulation().catch(console.error);
