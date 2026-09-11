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

function getOfficialShiftTime(dayKey, shiftKey) {
  const normKey = (shiftKey || 'T1').toUpperCase().trim();
  if (normKey === 'T1') {
    return { shiftKey: 'T1', startHour: 7.0, endHour: 12.0, startTime: '7:00 AM', endTime: '12:00 PM' };
  }
  if (normKey === 'T2') {
    return { shiftKey: 'T2', startHour: 11.0, endHour: 15.0, startTime: '11:00 AM', endTime: '3:00 PM' };
  }
  if (normKey === 'T3') {
    return { shiftKey: 'T3', startHour: 14.0, endHour: 18.0, startTime: '2:00 PM', endTime: '6:00 PM' };
  }
  if (normKey === 'T4') {
    return { shiftKey: 'T4', startHour: 17.0, endHour: 21.0, startTime: '5:00 PM', endTime: '9:00 PM' };
  }
  return { shiftKey: normKey, startHour: 7.0, endHour: 12.0, startTime: '7:00 AM', endTime: '12:00 PM' };
}

function getGuatemalaHourFloat(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;
  const guatemalaString = d.toLocaleString("en-US", { timeZone: "America/Guatemala" });
  const guatemalaDate = new Date(guatemalaString);
  return guatemalaDate.getHours() + guatemalaDate.getMinutes() / 60 + guatemalaDate.getSeconds() / 3600;
}

function getContinuousScheduledBlocks(dayKey, assignedShiftKeys = []) {
  if (!dayKey || !assignedShiftKeys || assignedShiftKeys.length === 0) return [];
  const sortedShifts = assignedShiftKeys
    .map(key => getOfficialShiftTime(dayKey, key))
    .sort((a, b) => a.startHour - b.startHour);
  if (sortedShifts.length === 0) return [];

  const blocks = [];
  let currentShifts = [sortedShifts[0]];
  let currentEndHour = sortedShifts[0].endHour;

  for (let i = 1; i < sortedShifts.length; i++) {
    const s = sortedShifts[i];
    if (s.startHour <= currentEndHour) {
      currentShifts.push(s);
      currentEndHour = Math.max(currentEndHour, s.endHour);
    } else {
      blocks.push({
        shiftKeys: currentShifts.map(x => x.shiftKey),
        startHour: currentShifts[0].startHour,
        endHour: currentEndHour,
        matchedShifts: currentShifts
      });
      currentShifts = [s];
      currentEndHour = s.endHour;
    }
  }
  if (currentShifts.length > 0) {
    blocks.push({
      shiftKeys: currentShifts.map(x => x.shiftKey),
      startHour: currentShifts[0].startHour,
      endHour: currentEndHour,
      matchedShifts: currentShifts
    });
  }
  return blocks;
}

function getContinuousScheduledBlockForSession(dayKey, startedAt, assignedShiftKeys = []) {
  if (!startedAt || !dayKey || !assignedShiftKeys || assignedShiftKeys.length === 0) return null;
  const blocks = getContinuousScheduledBlocks(dayKey, assignedShiftKeys);
  if (blocks.length === 0) return null;
  const sessionStartHour = getGuatemalaHourFloat(startedAt);
  const matchedBlock = blocks.find(b => sessionStartHour >= b.startHour && sessionStartHour < b.endHour)
    || blocks.find(b => sessionStartHour < b.startHour)
    || blocks.find(b => sessionStartHour === b.endHour);
  if (!matchedBlock) return null;
  return {
    matchedShifts: matchedBlock.shiftKeys.map(k => getOfficialShiftTime(dayKey, k)),
    startShiftKey: matchedBlock.shiftKeys[0],
    endShiftKey: matchedBlock.shiftKeys[matchedBlock.shiftKeys.length - 1],
  };
}

function inferShiftsForSession(dayKey, sessionStart, sessionEnd, assignedShifts = ['T1', 'T2', 'T3', 'T4']) {
  if (!sessionStart) return [];
  const sessionStartHour = getGuatemalaHourFloat(sessionStart);
  const block = getContinuousScheduledBlockForSession(dayKey, sessionStart, assignedShifts);
  const sessionShiftKeys = block ? block.matchedShifts.map(s => s.shiftKey) : assignedShifts;
  let sessionEndHour = sessionEnd ? getGuatemalaHourFloat(sessionEnd) : sessionStartHour + 1/3600;
  if (sessionEndHour < sessionStartHour && sessionEnd) sessionEndHour += 24;

  const matched = [];
  for (const shiftKey of sessionShiftKeys) {
    const official = getOfficialShiftTime(dayKey, shiftKey);
    const shiftStartHour = official.startHour;
    const shiftEndHour = official.endHour;
    const overlapStart = Math.max(sessionStartHour, shiftStartHour);
    const overlapEnd = Math.min(sessionEndHour, shiftEndHour);
    const earlyArrival = block?.startShiftKey === shiftKey && sessionStartHour < shiftStartHour;
    if (overlapStart < overlapEnd || earlyArrival) {
      matched.push(official);
    }
  }
  return matched;
}

async function runAudit() {
  console.log('--- STARTING COMPREHENSIVE AUDIT ---');

  // 1. Fetch all volunteers
  let allVolunteers = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('volunteers').select('id, first_name, last_name, phone, status, committee_id').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allVolunteers = allVolunteers.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  const volMap = new Map(allVolunteers.map(v => [v.id, v]));

  // 2. Fetch all shifts
  let allShifts = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('shifts').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allShifts = allShifts.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  // Map assigned shifts: volunteer_id|day_key -> shift_key[]
  const assignedMap = new Map();
  allShifts.forEach(s => {
    if (!s.volunteer_id || !s.day_key || !s.shift_key) return;
    const k = `${s.volunteer_id}|${s.day_key.toLowerCase().trim()}`;
    const list = assignedMap.get(k) || [];
    if (!list.includes(s.shift_key)) list.push(s.shift_key);
    assignedMap.set(k, list);
  });

  // 3. Fetch all attendance_sessions
  let allSessions = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('attendance_sessions').select('*').order('created_at', { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allSessions = allSessions.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  const anomalies = [];
  const multipleShiftsMarked = [];
  const veryShortSessions = [];

  for (const sess of allSessions) {
    const vId = sess.volunteer_id;
    const vol = volMap.get(vId);
    const dayKey = (sess.day_key || '').trim();
    const start = new Date(sess.started_at);
    const end = sess.ended_at ? new Date(sess.ended_at) : null;
    const durMins = end ? Math.round((end.getTime() - start.getTime()) / 60000 * 10) / 10 : null;

    const startGt = start.toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true });
    const endGt = end ? end.toLocaleTimeString('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: true }) : 'En curso';
    const dateGt = start.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' });

    const assigned = assignedMap.get(`${vId}|${dayKey.toLowerCase()}`) || [];
    const targetKeys = assigned.length > 0 ? assigned : ['T1', 'T2', 'T3', 'T4'];
    const inferred = inferShiftsForSession(dayKey, sess.started_at, sess.ended_at, targetKeys);
    const inferredKeys = inferred.map(s => s.shiftKey);

    const record = {
      sessionId: sess.id,
      volunteerId: vId,
      name: vol ? `${vol.first_name} ${vol.last_name || ''}`.trim() : 'Desconocido',
      phone: vol?.phone || 'Sin teléfono',
      dayKey,
      dateGt,
      startGt,
      endGt,
      durMins,
      status: sess.status,
      assignedShifts: assigned,
      inferredCompletedShifts: inferredKeys,
      multiShiftCount: inferredKeys.length
    };

    if (durMins !== null && durMins < 30) {
      veryShortSessions.push(record);
    }

    if (sess.status === 'completed' && inferredKeys.length >= 2) {
      multipleShiftsMarked.push(record);
    }

    if (sess.status === 'completed' && inferredKeys.length >= 2 && durMins !== null && durMins < 120) {
      anomalies.push(record);
    }
  }

  const results = {
    anomaliesShortMultiShift: anomalies,
    veryShortSessions,
    multipleShiftsMarked
  };

  fs.writeFileSync('scratch/audit-results.json', JSON.stringify(results, null, 2));
  console.log(`Saved results to scratch/audit-results.json`);
  console.log(`Anomalies (<120min + multi-shift): ${anomalies.length}`);
  console.log(`Very short (<30min): ${veryShortSessions.length}`);
  console.log(`Multiple shifts completed: ${multipleShiftsMarked.length}`);
}

runAudit().catch(console.error);
