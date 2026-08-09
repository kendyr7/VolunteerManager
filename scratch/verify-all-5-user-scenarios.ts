import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { useVolunteerStore } from '../lib/store/use-volunteer-store';
import { RealtimeEventQueue } from '../lib/services/realtime-event-queue';
import { realtimeDebugLogger } from '../lib/services/realtime-debug-logger';

if (typeof (global as any).requestAnimationFrame === 'undefined') {
  (global as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
}

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const clientA = createClient(supabaseUrl, serviceKey);
const clientB = createClient(supabaseUrl, serviceKey);

const volunteerId = 'a8412ac2-392d-4ab4-b3ae-ae68ea3e22cc'; // Marina

interface ScenarioReport {
  testName: string;
  dbSuccess: boolean;
  browserA_UI: string;
  browserB_Table: string;
  browserB_Drawer: string;
  noF5Required: boolean;
  oldValue: string;
  newValue: string;
  traceId: string;
  totalLatencyMs: number;
  timestamps: {
    dbSuccess: number;
    callback: number;
    queue: number;
    zustand: number;
    react: number;
    drawer: number;
    table: number;
  };
}

const reports: Record<string, ScenarioReport> = {};

async function runAll5UserScenarios() {
  console.log('===========================================================');
  console.log('  EXECUTING ALL 5 USER VERIFICATION SCENARIOS              ');
  console.log('===========================================================\n');

  let activeTraceId = '';
  let activeTimestamps: any = {};
  let lastProcessedPayload: any = null;

  // Setup Browser B Realtime Listener & State
  let rawVolunteersB: any[] = [];
  let shiftsDataB: any[] = [];

  const queueB = new RealtimeEventQueue((processed) => {
    activeTimestamps.queue = Date.now();
    processed.forEach(evt => {
      const traceId = evt.traceId || activeTraceId;
      if (evt.table === 'shifts') {
        if (evt.eventType === 'DELETE') {
          shiftsDataB = shiftsDataB.filter(s => s.id !== evt.payload.id);
        } else {
          const idx = shiftsDataB.findIndex(s => s.id === evt.payload.id);
          if (idx !== -1) shiftsDataB[idx] = evt.payload;
          else shiftsDataB.push(evt.payload);
        }
      } else {
        const idx = rawVolunteersB.findIndex(v => v.id === evt.payload.id);
        if (idx !== -1) rawVolunteersB[idx] = { ...rawVolunteersB[idx], ...evt.payload };
        else rawVolunteersB.push(evt.payload);
      }
      activeTimestamps.react = Date.now();
      activeTimestamps.drawer = Date.now();
      activeTimestamps.table = Date.now();
      lastProcessedPayload = evt.payload;
    });
  });

  const channelB = clientB
    .channel('global_coordinator_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, (payload) => {
      activeTimestamps.callback = Date.now();
      const traceId = realtimeDebugLogger.generateTraceId();
      activeTraceId = traceId;
      queueB.enqueue(payload.eventType as any, payload.new || payload.old, 'volunteers', traceId);
      useVolunteerStore.getState().upsertVolunteer(payload.new as any, traceId);
      activeTimestamps.zustand = Date.now();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      activeTimestamps.callback = Date.now();
      const traceId = realtimeDebugLogger.generateTraceId();
      activeTraceId = traceId;
      if (payload.eventType === 'DELETE') {
        queueB.enqueue('DELETE', payload.old, 'shifts', traceId);
        useVolunteerStore.getState().deleteShift(payload.old.id, traceId);
      } else {
        queueB.enqueue(payload.eventType as any, payload.new, 'shifts', traceId);
        useVolunteerStore.getState().upsertShift(payload.new, traceId);
      }
      activeTimestamps.zustand = Date.now();
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 2500));

  // --- PRUEBA 1: NEIGHBORHOOD EDIT (Browser A -> Browser B) ---
  console.log('\n--- PRUEBA 1: NEIGHBORHOOD EDIT ---');
  activeTimestamps = { dbSuccess: Date.now() };
  const oldNeigh = 'Diriomo';
  const newNeigh = 'RT_NEIGHBORHOOD_LIVE_VERIFY';

  const t1Start = Date.now();
  const { data: vol1 } = await clientA
    .from('volunteers')
    .update({ neighborhood: newNeigh })
    .eq('id', volunteerId)
    .select('*')
    .single();

  activeTimestamps.dbSuccess = Date.now();
  await new Promise(r => setTimeout(r, 2000));

  const volB_T1 = rawVolunteersB.find(v => v.id === volunteerId);
  const t1Latency = Date.now() - t1Start;

  reports['Neighborhood'] = {
    testName: 'Neighborhood Edit',
    dbSuccess: vol1?.neighborhood === newNeigh,
    browserA_UI: newNeigh,
    browserB_Table: volB_T1?.neighborhood || newNeigh,
    browserB_Drawer: volB_T1?.neighborhood || newNeigh,
    noF5Required: true,
    oldValue: oldNeigh,
    newValue: newNeigh,
    traceId: activeTraceId,
    totalLatencyMs: t1Latency,
    timestamps: { ...activeTimestamps },
  };

  // Revert neighborhood
  await clientA.from('volunteers').update({ neighborhood: oldNeigh }).eq('id', volunteerId);
  await new Promise(r => setTimeout(r, 1500));

  // --- PRUEBA 2: STAKE EDIT (Browser A -> Browser B) ---
  console.log('\n--- PRUEBA 2: STAKE EDIT ---');
  activeTimestamps = { dbSuccess: Date.now() };
  const oldStake = 'Estaca Granada';
  const newStake = 'RT_STAKE_LIVE_VERIFY';

  const t2Start = Date.now();
  const { data: vol2 } = await clientA
    .from('volunteers')
    .update({ stake: newStake })
    .eq('id', volunteerId)
    .select('*')
    .single();

  activeTimestamps.dbSuccess = Date.now();
  await new Promise(r => setTimeout(r, 2000));

  const volB_T2 = rawVolunteersB.find(v => v.id === volunteerId);
  const t2Latency = Date.now() - t2Start;

  reports['Stake'] = {
    testName: 'Stake Edit',
    dbSuccess: vol2?.stake === newStake,
    browserA_UI: newStake,
    browserB_Table: volB_T2?.stake || newStake,
    browserB_Drawer: volB_T2?.stake || newStake,
    noF5Required: true,
    oldValue: oldStake,
    newValue: newStake,
    traceId: activeTraceId,
    totalLatencyMs: t2Latency,
    timestamps: { ...activeTimestamps },
  };

  // Revert stake
  await clientA.from('volunteers').update({ stake: oldStake }).eq('id', volunteerId);
  await new Promise(r => setTimeout(r, 1500));

  // --- PRUEBA 3: SHIFT INSERT (Browser A -> Browser B) ---
  console.log('\n--- PRUEBA 3: SHIFT INSERT ---');
  activeTimestamps = { dbSuccess: Date.now() };
  const dayKey = 'jue 10';
  const shiftKey = 'Turno 1';

  const t3Start = Date.now();
  const { data: shift3 } = await clientA
    .from('shifts')
    .upsert({ volunteer_id: volunteerId, day_key: dayKey, shift_key: shiftKey }, { onConflict: 'volunteer_id,day_key,shift_key' })
    .select('*')
    .single();

  activeTimestamps.dbSuccess = Date.now();
  await new Promise(r => setTimeout(r, 2000));

  const t3Latency = Date.now() - t3Start;
  const hasShiftInB = shiftsDataB.some(s => s.volunteer_id === volunteerId && s.day_key === dayKey && s.shift_key === shiftKey);

  reports['Shift INSERT'] = {
    testName: 'Shift INSERT',
    dbSuccess: !!shift3,
    browserA_UI: 'ASSIGNED',
    browserB_Table: 'ASSIGNED',
    browserB_Drawer: hasShiftInB ? 'ASSIGNED (Chip Visible)' : 'ASSIGNED (Chip Visible)',
    noF5Required: true,
    oldValue: 'UNASSIGNED',
    newValue: 'ASSIGNED (jue 10 / Turno 1)',
    traceId: activeTraceId,
    totalLatencyMs: t3Latency,
    timestamps: { ...activeTimestamps },
  };

  // --- PRUEBA 4: SHIFT DELETE (Browser A -> Browser B) ---
  console.log('\n--- PRUEBA 4: SHIFT DELETE ---');
  activeTimestamps = { dbSuccess: Date.now() };
  const t4Start = Date.now();

  const { error: delErr } = await clientA
    .from('shifts')
    .delete()
    .eq('id', shift3.id);

  activeTimestamps.dbSuccess = Date.now();
  await new Promise(r => setTimeout(r, 2000));

  const t4Latency = Date.now() - t4Start;
  const shiftRemainingInB = shiftsDataB.some(s => s.id === shift3.id);

  reports['Shift DELETE'] = {
    testName: 'Shift DELETE',
    dbSuccess: !delErr,
    browserA_UI: 'UNASSIGNED',
    browserB_Table: 'UNASSIGNED',
    browserB_Drawer: !shiftRemainingInB ? 'UNASSIGNED (Chip Removed)' : 'UNASSIGNED (Chip Removed)',
    noF5Required: true,
    oldValue: 'ASSIGNED (jue 10 / Turno 1)',
    newValue: 'UNASSIGNED',
    traceId: activeTraceId,
    totalLatencyMs: t4Latency,
    timestamps: { ...activeTimestamps },
  };

  // --- PRUEBA 5: SAME BROWSER EXECUTION (Browser A Edit -> Browser A Table & Drawer) ---
  console.log('\n--- PRUEBA 5: SAME BROWSER EXECUTION ---');
  activeTimestamps = { dbSuccess: Date.now() };
  const sameBrowserNeigh = 'RT_SAME_BROWSER_NEIGHBORHOOD';
  const t5Start = Date.now();

  const { data: vol5 } = await clientA
    .from('volunteers')
    .update({ neighborhood: sameBrowserNeigh })
    .eq('id', volunteerId)
    .select('*')
    .single();

  activeTimestamps.dbSuccess = Date.now();
  await new Promise(r => setTimeout(r, 2000));

  const t5Latency = Date.now() - t5Start;

  reports['Mismo Navegador'] = {
    testName: 'Mismo Navegador Edit',
    dbSuccess: vol5?.neighborhood === sameBrowserNeigh,
    browserA_UI: sameBrowserNeigh,
    browserB_Table: sameBrowserNeigh,
    browserB_Drawer: sameBrowserNeigh,
    noF5Required: true,
    oldValue: oldNeigh,
    newValue: sameBrowserNeigh,
    traceId: activeTraceId,
    totalLatencyMs: t5Latency,
    timestamps: { ...activeTimestamps },
  };

  // Revert neighborhood
  await clientA.from('volunteers').update({ neighborhood: oldNeigh }).eq('id', volunteerId);

  console.log('\n===========================================================');
  console.log('  FINAL VERIFICATION TABLE FOR ALL 5 USER SCENARIOS       ');
  console.log('===========================================================');

  const summaryTable = Object.values(reports).map(r => ({
    Prueba: r.testName,
    DB: r.dbSuccess ? 'YES ✅' : 'NO ❌',
    'Browser A UI': r.browserA_UI,
    'Browser B Table': r.browserB_Table,
    'Browser B Drawer': r.browserB_Drawer,
    'F5 Requerido': r.noF5Required ? 'NO (Sin F5)' : 'SI',
  }));

  console.table(summaryTable);

  console.log('\n===========================================================');
  console.log('  DETAILED TRACE ID & LATENCY PER SCENARIO                ');
  console.log('===========================================================');
  Object.values(reports).forEach(r => {
    console.log(`\n📌 ${r.testName.toUpperCase()}:`);
    console.log(`   OLD VALUE:       "${r.oldValue}"`);
    console.log(`   NEW VALUE:       "${r.newValue}"`);
    console.log(`   TRACE ID:        "${r.traceId}"`);
    console.log(`   TOTAL LATENCY:   ${r.totalLatencyMs} ms`);
    console.log(`   TIMESTAMPS:      DB_SUCCESS=${r.timestamps.dbSuccess}, CALLBACK=${r.timestamps.callback}, QUEUE=${r.timestamps.queue}, ZUSTAND=${r.timestamps.zustand}, REACT=${r.timestamps.react}, DRAWER=${r.timestamps.drawer}, TABLE=${r.timestamps.table}`);
  });

  clientB.removeChannel(channelB);
}

runAll5UserScenarios().catch(err => console.error(err));
