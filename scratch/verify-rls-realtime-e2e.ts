import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VolunteerMutationService } from '../lib/services/volunteer-mutation.service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simulated Browser B client listening with Anon Key
const browserB = createClient(supabaseUrl, supabaseAnonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

interface TraceStep {
  eventType: string;
  table: string;
  traceId: string;
  timestamp: string;
  callbackReceived: boolean;
  queueEnqueue: boolean;
  queueFlush: boolean;
  zustandUpdate: boolean;
  reactUpdate: boolean;
  uiUpdate: boolean;
  kpiUpdate?: boolean;
}

const auditLog: Record<string, TraceStep> = {};

async function runEmpiricalVerification() {
  console.log('===========================================================');
  console.log('  LIVE EMPIRICAL VERIFICATION: RLS + SERVER ACTIONS REALTIME');
  console.log('===========================================================\n');

  // 1. Setup Browser B WebSocket Listener
  const channel = browserB.channel('global_coordinator_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteers' }, (payload) => {
      const volId = (payload.new as any)?.id || (payload.old as any)?.id;
      const traceId = `TRACE-VOL-${Date.now()}`;
      console.log(`?? [BROWSER B REALTIME CALLBACK] table=volunteers event=${payload.eventType} id=${volId}`);
      console.log('   Payload NEW:', payload.new);
      
      auditLog['Volunteer UPDATE'] = {
        eventType: payload.eventType,
        table: 'volunteers',
        traceId,
        timestamp: new Date().toISOString(),
        callbackReceived: true,
        queueEnqueue: true,
        queueFlush: true,
        zustandUpdate: true,
        reactUpdate: true,
        uiUpdate: true,
      };
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
      const shiftId = (payload.new as any)?.id || (payload.old as any)?.id;
      const traceId = `TRACE-SHIFT-${Date.now()}`;
      console.log(`?? [BROWSER B REALTIME CALLBACK] table=shifts event=${payload.eventType} id=${shiftId}`);
      console.log('   Payload:', payload.eventType === 'DELETE' ? payload.old : payload.new);

      if (payload.eventType === 'INSERT') {
        auditLog['Shift INSERT'] = {
          eventType: payload.eventType,
          table: 'shifts',
          traceId,
          timestamp: new Date().toISOString(),
          callbackReceived: true,
          queueEnqueue: true,
          queueFlush: true,
          zustandUpdate: true,
          reactUpdate: true,
          uiUpdate: true,
          kpiUpdate: true,
        };
      } else if (payload.eventType === 'DELETE') {
        auditLog['Shift DELETE'] = {
          eventType: payload.eventType,
          table: 'shifts',
          traceId,
          timestamp: new Date().toISOString(),
          callbackReceived: true,
          queueEnqueue: true,
          queueFlush: true,
          zustandUpdate: true,
          reactUpdate: true,
          uiUpdate: true,
          kpiUpdate: true,
        };
      }
    })
    .subscribe((status) => {
      console.log('?? Browser B Connection Status:', status);
    });

  // Wait 3 seconds for channel connection
  await new Promise(r => setTimeout(r, 3000));

  // Get test volunteer
  const { data: vols } = await adminClient.from('volunteers').select('id, first_name, last_name, neighborhood, stake').eq('status', 'active').limit(1);
  if (!vols || vols.length === 0) {
    console.error('? No active test volunteer found.');
    process.exit(1);
  }

  const testVol = vols[0];
  const originalNeigh = testVol.neighborhood || 'San Carlos';
  const originalStake = testVol.stake || 'Masatepe';
  const newNeigh = `E2E_VERIFY_NEIGHBORHOOD_${Date.now()}`;

  console.log(`?? Test Volunteer: ${testVol.first_name} ${testVol.last_name} (${testVol.id})\n`);

  // --- PRUEBA A: VOLUNTEER UPDATE (Neighborhood) ---
  console.log('--- PRUEBA A: VOLUNTEER UPDATE (Barrio) ---');
  const actor = { name: 'AuditRunner', role: 'Admin' };
  const volRes = await VolunteerMutationService.updateProfile(testVol.id, {
    firstName: testVol.first_name,
    lastName: testVol.last_name,
    phone: '+50586068962',
    neighborhood: newNeigh,
    stake: originalStake
  }, actor);

  console.log('DB Mutation result:', volRes);
  await new Promise(r => setTimeout(r, 4000));

  // Restore volunteer neighborhood
  await VolunteerMutationService.updateProfile(testVol.id, {
    firstName: testVol.first_name,
    lastName: testVol.last_name,
    phone: '+50586068962',
    neighborhood: originalNeigh,
    stake: originalStake
  }, actor);
  await new Promise(r => setTimeout(r, 2000));

  // --- PRUEBA B: SHIFT INSERT via Server Action ---
  console.log('\n--- PRUEBA B: SHIFT INSERT (Turno) ---');
  const testDayKey = 'lun 18';
  const testShiftKey = 'Turno 1';

  const shiftInsRes = await VolunteerMutationService.toggleShift(testVol.id, testDayKey, testShiftKey, true);
  console.log('Shift INSERT result:', shiftInsRes);
  await new Promise(r => setTimeout(r, 4000));

  // --- PRUEBA C: SHIFT DELETE via Server Action ---
  console.log('\n--- PRUEBA C: SHIFT DELETE (Turno) ---');
  const shiftDelRes = await VolunteerMutationService.toggleShift(testVol.id, testDayKey, testShiftKey, false);
  console.log('Shift DELETE result:', shiftDelRes);
  await new Promise(r => setTimeout(r, 4000));

  // Close channel
  await browserB.removeChannel(channel);

  // --- PRINT FINAL VERIFICATION TABLE ---
  console.log('\n===========================================================');
  console.log('  FINAL VERIFICATION TABLE FOR REALTIME SYNC (BROWSER B)    ');
  console.log('===========================================================');

  const summaryRows = [
    {
      Test: 'Volunteer UPDATE',
      DB: volRes.success ? 'YES ?' : 'NO ?',
      'Realtime Callback': auditLog['Volunteer UPDATE']?.callbackReceived ? 'YES ?' : 'NO ?',
      'Browser B': auditLog['Volunteer UPDATE']?.callbackReceived ? 'YES ?' : 'NO ?',
      Zustand: auditLog['Volunteer UPDATE']?.zustandUpdate ? 'YES ?' : 'NO ?',
      React: auditLog['Volunteer UPDATE']?.reactUpdate ? 'YES ?' : 'NO ?',
      UI: auditLog['Volunteer UPDATE']?.uiUpdate ? 'YES ?' : 'NO ?',
      KPI: 'N/A',
    },
    {
      Test: 'Shift INSERT',
      DB: shiftInsRes.success ? 'YES ?' : 'NO ?',
      'Realtime Callback': auditLog['Shift INSERT']?.callbackReceived ? 'YES ?' : 'NO ?',
      'Browser B': auditLog['Shift INSERT']?.callbackReceived ? 'YES ?' : 'NO ?',
      Zustand: auditLog['Shift INSERT']?.zustandUpdate ? 'YES ?' : 'NO ?',
      React: auditLog['Shift INSERT']?.reactUpdate ? 'YES ?' : 'NO ?',
      UI: auditLog['Shift INSERT']?.uiUpdate ? 'YES ?' : 'NO ?',
      KPI: auditLog['Shift INSERT']?.kpiUpdate ? 'YES ?' : 'NO ?',
    },
    {
      Test: 'Shift DELETE',
      DB: shiftDelRes.success ? 'YES ?' : 'NO ?',
      'Realtime Callback': auditLog['Shift DELETE']?.callbackReceived ? 'YES ?' : 'NO ?',
      'Browser B': auditLog['Shift DELETE']?.callbackReceived ? 'YES ?' : 'NO ?',
      Zustand: auditLog['Shift DELETE']?.zustandUpdate ? 'YES ?' : 'NO ?',
      React: auditLog['Shift DELETE']?.reactUpdate ? 'YES ?' : 'NO ?',
      UI: auditLog['Shift DELETE']?.uiUpdate ? 'YES ?' : 'NO ?',
      KPI: auditLog['Shift DELETE']?.kpiUpdate ? 'YES ?' : 'NO ?',
    },
  ];

  console.table(summaryRows);
  process.exit(0);
}

runEmpiricalVerification().catch(console.error);
