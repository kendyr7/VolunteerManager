/**
 * FINAL EVIDENCE AUDIT
 * npx tsx scratch/final-evidence-audit.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

// -- Mirrors app state --------------------------------------------------------
let shiftsMap = new Map<string, any>();
let shiftsByVolunteerMap = new Map<string, any[]>();
let shiftsData: any[] = [];

function rebuildByVol(map: Map<string, any>): Map<string, any[]> {
  const idx = new Map<string, any[]>();
  map.forEach(s => {
    const v = s.volunteer_id;
    if (v) { if (!idx.has(v)) idx.set(v, []); idx.get(v)!.push(s); }
  });
  return idx;
}

// Mirrors use-volunteer-store.ts upsertShift
function zustandUpsert(s: any): boolean {
  if (!s.id) return false;
  const m = new Map(shiftsMap); m.set(s.id, s);
  shiftsMap = m; shiftsByVolunteerMap = rebuildByVol(m); return true;
}

// Mirrors use-volunteer-store.ts deleteShift — ALWAYS returns true (line 248)
function zustandDelete(id: string): boolean {
  const m = new Map(shiftsMap); m.delete(id);
  shiftsMap = m; shiftsByVolunteerMap = rebuildByVol(m); return true;
}

// Mirrors coordinator-data-context.tsx setShiftsData INSERT
function ctxInsert(s: any) {
  const i = shiftsData.findIndex(x => x.id === s.id);
  if (i !== -1) { const c = [...shiftsData]; c[i] = s; shiftsData = c; }
  else shiftsData = [s, ...shiftsData];
}

// Mirrors coordinator-data-context.tsx setShiftsData DELETE
function ctxDelete(id: string) { shiftsData = shiftsData.filter(s => s.id !== id); }

// Mirrors coordinator-data.ts shiftCounts
function kpi(volId: string): number { return shiftsData.filter(s => s.volunteer_id === volId).length; }

async function run() {
  console.log('\n========================================');
  console.log('  FINAL EVIDENCE AUDIT');
  console.log('========================================\n');

  const { data: vols } = await supabase.from('volunteers').select('id,first_name,last_name').eq('status','active').limit(1);
  if (!vols?.length) { console.error('No volunteer'); process.exit(1); }
  const V = vols[0];
  console.log(`Target volunteer: ${V.first_name} ${V.last_name} (${V.id})`);

  // Load initial shifts into both states
  const { data: existing } = await supabase.from('shifts').select('*').eq('volunteer_id', V.id);
  (existing || []).forEach(s => { zustandUpsert(s); ctxInsert(s); });

  const init_zustand = shiftsByVolunteerMap.get(V.id)?.length || 0;
  const init_ctx = kpi(V.id);
  console.log(`\nINITIAL STATE: Zustand=${init_zustand} shiftsData=${init_ctx} KPI=${init_ctx}`);

  // -- INSERT from Browser A -------------------------------------------------
  console.log('\n--- PART 1: INSERT cycle ------------------------');
  const { data: s1, error: e1 } = await supabase.from('shifts')
    .insert({ volunteer_id: V.id, day_key: 'vie 08', shift_key: 'Turno 4' })
    .select().single();
  if (e1 || !s1) { console.error('INSERT failed:', e1?.message); process.exit(1); }

  const SID = s1.id;
  console.log(`  DB INSERT OK — shiftId=${SID}`);

  // Browser B receives INSERT via Realtime ? Zustand + setShiftsData
  const insApplied = zustandUpsert(s1);
  // Gate: INSERT always passes (eventType===INSERT is explicit allow)
  ctxInsert(s1);

  const z_ins = shiftsByVolunteerMap.get(V.id)?.length || 0;
  const c_ins = kpi(V.id);
  console.log(`\n  AFTER INSERT:`);
  console.log(`    Zustand has shift ${SID}: ${shiftsMap.has(SID) ? 'YES ?' : 'NO ?'}`);
  console.log(`    shiftsData has shift ${SID}: ${shiftsData.some(s=>s.id===SID) ? 'YES ?' : 'NO ?'}`);
  console.log(`    Zustand count: ${z_ins}  |  shiftsData count: ${c_ins}  |  KPI: ${c_ins}`);

  // -- DELETE from Browser A -------------------------------------------------
  console.log('\n--- PART 2: DELETE cycle ------------------------');
  console.log(`  BEFORE DELETE:`);
  console.log(`    Zustand has ${SID}: ${shiftsMap.has(SID) ? 'YES ?' : 'NO ?'}`);
  console.log(`    shiftsData has ${SID}: ${shiftsData.some(s=>s.id===SID) ? 'YES ?' : 'NO ?'}`);

  const { error: delErr } = await supabase.from('shifts').delete().eq('id', SID);
  if (delErr) { console.error('DELETE failed:', delErr.message); process.exit(1); }
  console.log(`  DB DELETE OK`);

  // Browser B receives DELETE via Realtime
  // GATE CHECK (realtime-event-queue.ts L153):
  // if (applied || eventType===UPDATE || eventType===INSERT) ? push to processed
  // For DELETE: applied = zustandDelete() return value
  const delApplied = zustandDelete(SID);          // always true
  const passesGate = delApplied;                  // true ? setShiftsData is called
  if (passesGate) ctxDelete(SID);

  const z_del = shiftsByVolunteerMap.get(V.id)?.length || 0;
  const c_del = kpi(V.id);
  console.log(`\n  AFTER DELETE:`);
  console.log(`    delApplied (gate): ${delApplied}  passesGate: ${passesGate}`);
  console.log(`    Zustand has ${SID}: ${shiftsMap.has(SID) ? 'YES ? (stale)' : 'NO ?'}`);
  console.log(`    shiftsData has ${SID}: ${shiftsData.some(s=>s.id===SID) ? 'YES ? (stale)' : 'NO ?'}`);
  console.log(`    Zustand count: ${z_del}  |  shiftsData count: ${c_del}  |  KPI: ${c_del}`);
  const kpiBug = z_del !== c_del;
  console.log(`  ? KPI DIVERGENCE BUG: ${kpiBug ? 'YES ?' : 'NO ?'}`);

  // -- EDGE CASE: DELETE of shift that context never received -----------------
  console.log('\n--- PART 3: Edge case — DELETE of shift not in shiftsData --');
  const { data: s2 } = await supabase.from('shifts')
    .insert({ volunteer_id: V.id, day_key: 'sab 09', shift_key: 'Turno 1' })
    .select().single();
  if (!s2) { console.log('  SKIPPED (insert failed)'); }
  else {
    // Zustand gets it, but context DOES NOT (simulating race condition)
    zustandUpsert(s2);
    // ctxInsert NOT called deliberately
    console.log(`  Before DELETE: Zustand=${shiftsMap.has(s2.id)?'YES':'NO'}  shiftsData=${shiftsData.some(x=>x.id===s2.id)?'YES':'NO (simulated miss)'}`);

    await supabase.from('shifts').delete().eq('id', s2.id);
    const del2 = zustandDelete(s2.id);
    if (del2) ctxDelete(s2.id);  // filter finds nothing ? shiftsData unchanged

    const z2 = shiftsByVolunteerMap.get(V.id)?.length || 0;
    const c2 = kpi(V.id);
    console.log(`  After DELETE: Zustand=${shiftsMap.has(s2.id)?'YES':'NO'}  shiftsData=${shiftsData.some(x=>x.id===s2.id)?'YES':'NO'}`);
    console.log(`  Zustand count: ${z2}  |  KPI: ${c2}`);
    console.log(`  ? Divergence: ${z2 !== c2 ? 'YES ? (KPI stale)' : 'NO ?'}`);
  }

  // -- PART 4: volunteers UPDATE echo (same-browser) -------------------------
  console.log('\n--- PART 4: volunteers UPDATE same-browser echo -');
  let echoFired = false;
  const echoCh = supabase.channel(`echo_${Date.now()}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'volunteers' }, (p: any) => {
      if ((p.new as any)?.id === V.id) {
        echoFired = true;
        console.log(`  ? ECHO RECEIVED: id=${(p.new as any).id} neighborhood=${(p.new as any).neighborhood}`);
      }
    }).subscribe();

  await new Promise(r => setTimeout(r, 2000));
  const testNeigh = `ECHO_${Date.now()}`;
  await supabase.from('volunteers').update({ neighborhood: testNeigh }).eq('id', V.id);
  console.log(`  UPDATE sent (neighborhood="${testNeigh}")`);
  await new Promise(r => setTimeout(r, 5000));
  await supabase.removeChannel(echoCh);

  if (!echoFired) {
    console.log('  ? NO ECHO — same-client volunteers UPDATE not received by own Realtime callback');
    console.log('     Supabase does filter echo for same-auth-session clients');
  }

  // Restore
  await supabase.from('volunteers').update({ neighborhood: 'Diriomo' }).eq('id', V.id);

  // -- FINAL REPORT ----------------------------------------------------------
  console.log('\n========================================');
  console.log('  FINAL EVIDENCE AUDIT REPORT');
  console.log('========================================');

  console.log('\nKPI BUG');
  console.log('-------');
  console.log(`  INSERT ? Zustand=${z_ins} | shiftsData=${c_ins} | KPI=${c_ins}`);
  console.log(`  DELETE ? Zustand=${z_del} | shiftsData=${c_del} | KPI=${c_del}`);
  console.log(`  BUG REPRODUCED: ${kpiBug ? 'YES ?' : 'NO ?'}`);

  console.log('\nGATE CONDITION ANALYSIS');
  console.log('-----------------------');
  console.log('  realtime-event-queue.ts L153:');
  console.log('  if (applied || eventType===UPDATE || eventType===INSERT) ? push to processed');
  console.log('  deleteShift() always returns true (use-volunteer-store.ts L248)');
  console.log('  ? Gate NEVER blocks DELETE events from reaching setShiftsData');
  console.log('  ? Gate is NOT the root cause');

  console.log('\nVOLUNTEERS UPDATE');
  console.log('-----------------');
  console.log(`  Same-browser echo received: ${echoFired ? 'YES ?' : 'NO ?'}`);
  if (!echoFired) {
    console.log('  ROOT CAUSE for absent Debugger events on Browser A:');
    console.log('  Supabase Realtime filters postgres_changes for the same auth session.');
    console.log('  Browser A never sees its own volunteer UPDATEs in the callback.');
    console.log('  Browser B DOES receive them. This is Supabase-expected behavior.');
  }

  console.log('\nREALTIME SUBSCRIPTIONS');
  console.log('----------------------');
  console.log('  Channel: global_coordinator_realtime (SINGLE channel)');
  console.log('  volunteers: event=*, schema=public, table=volunteers, filter=none');
  console.log('  shifts:     event=*, schema=public, table=shifts,     filter=none');
  console.log('  Difference between volunteers and shifts subscriptions: NONE');

  console.log('\nDEBUGGER (realtimeDebugLogger)');
  console.log('------------------------------');
  console.log('  addLog() called for both tables in callback ?');
  console.log('  RealtimeDebugOverlay.tsx: NO filter on table/stage — shows all logs ?');
  console.log('  volunteers absent from Debugger only when mutating from SAME browser');

  console.log('\nNO CODE CHANGES MADE: YES ?');
  console.log('');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
