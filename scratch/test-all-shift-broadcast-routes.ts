import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  checkInVolunteer,
  checkOutVolunteer,
  adjustCheckoutTimeAction,
  reassignVolunteerShift
} from '../app/actions/attendance';
import { approveShiftChangeRequestAction } from '../app/actions/shift-change-actions';
import {
  undoVolunteerCheckInAction,
  reopenCompletedShiftAction,
  rollbackReassignmentAction
} from '../app/actions/audit-actions';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, supabaseServiceKey);
const realtimeClient = createClient(supabaseUrl, supabaseAnonKey);

async function runAllShiftBroadcastTests() {
  console.log('===========================================================');
  console.log('  TESTING ALL 8 SHIFT MUTATION BROADCAST ROUTES (A -> H)   ');
  console.log('===========================================================\n');

  // 1. Setup Realtime Listener
  const receivedBroadcasts: any[] = [];
  const channel = realtimeClient.channel('global_coordinator_realtime');

  channel.on('broadcast', { event: 'shift_sync' }, (payload) => {
    console.log(`🎯 [REALTIME RECEIVED] Event=${payload.payload?.eventType}, Table=${payload.payload?.table}, Record ID=${payload.payload?.record?.id}`);
    receivedBroadcasts.push(payload.payload);
  });

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      console.log('[TEST CLIENT] Realtime Channel Status:', status);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  // Fetch test volunteer
  const { data: vol } = await adminClient.from('volunteers').select('id, first_name, last_name').limit(1).single();
  if (!vol) throw new Error('No test volunteer found');
  const volunteerId = vol.id;
  console.log(`Using Test Volunteer: ${vol.first_name} ${vol.last_name} (${volunteerId})\n`);

  // Clean slate & create initial test shift row
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);
  const { data: initialShift } = await adminClient.from('shifts').insert({
    volunteer_id: volunteerId,
    day_key: '2026-08-28',
    shift_key: 'T1',
    checked_in: false,
    checked_out: false
  }).select('*').single();
  if (!initialShift) throw new Error('Could not create initial test shift');
  const shiftId = initialShift.id;
  console.log(`Initial Test Shift Created: ID=${shiftId}\n`);

  await new Promise((r) => setTimeout(r, 1500));

  // TEST A: Check-in -> UPDATE broadcast
  console.log('--- TEST A: checkInVolunteer (Manual Check-in) ---');
  const countA = receivedBroadcasts.length;
  await checkInVolunteer('', 'admin-test-id', shiftId);
  await new Promise((r) => setTimeout(r, 2000));
  const sliceA = receivedBroadcasts.slice(countA);
  const testA_passed = sliceA.some(b => b.eventType === 'UPDATE' && b.record?.id === shiftId);
  console.log(`Test A Passed? ${testA_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST B: Check-out -> UPDATE broadcast
  console.log('--- TEST B: checkOutVolunteer (Check-out) ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countB = receivedBroadcasts.length;
  await checkOutVolunteer(shiftId);
  await new Promise((r) => setTimeout(r, 2000));
  const sliceB = receivedBroadcasts.slice(countB);
  const testB_passed = sliceB.some(b => b.eventType === 'UPDATE' && b.record?.id === shiftId);
  console.log(`Test B Passed? ${testB_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST C: Adjust checkout time -> UPDATE broadcast
  console.log('--- TEST C: adjustCheckoutTimeAction ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countC = receivedBroadcasts.length;
  const resC = await adjustCheckoutTimeAction({ shiftId, newCheckOutIso: new Date().toISOString(), reason: 'Test adjustment' });
  console.log('Test C Action Result:', resC);
  await new Promise((r) => setTimeout(r, 2000));
  const sliceC = receivedBroadcasts.slice(countC);
  const testC_passed = sliceC.some(b => b.eventType === 'UPDATE' && b.record?.id === shiftId);
  console.log(`Test C Passed? ${testC_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST F: Undo Check-in -> UPDATE broadcast
  console.log('--- TEST F: undoVolunteerCheckInAction ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countF = receivedBroadcasts.length;
  await undoVolunteerCheckInAction({ volunteerId, dayKey: '2026-08-28', shiftKey: 'T1', actorName: 'Tester' });
  await new Promise((r) => setTimeout(r, 2000));
  const sliceF = receivedBroadcasts.slice(countF);
  const testF_passed = sliceF.some(b => b.eventType === 'UPDATE' && b.record?.volunteer_id === volunteerId);
  console.log(`Test F Passed? ${testF_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST G: Reopen completed shift -> UPDATE broadcast
  console.log('--- TEST G: reopenCompletedShiftAction ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countG = receivedBroadcasts.length;
  await reopenCompletedShiftAction({ volunteerId, dayKey: '2026-08-28', shiftKey: 'T1', actorName: 'Tester' });
  await new Promise((r) => setTimeout(r, 2000));
  const sliceG = receivedBroadcasts.slice(countG);
  const testG_passed = sliceG.some(b => b.eventType === 'UPDATE' && b.record?.volunteer_id === volunteerId);
  console.log(`Test G Passed? ${testG_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST D: Reassign shift -> UPDATE broadcast
  console.log('--- TEST D: reassignVolunteerShift ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countD = receivedBroadcasts.length;
  await reassignVolunteerShift(shiftId, '2026-08-29', 'T2');
  await new Promise((r) => setTimeout(r, 2000));
  const sliceD = receivedBroadcasts.slice(countD);
  const testD_passed = sliceD.some(b => b.eventType === 'UPDATE' && b.record?.id === shiftId);
  console.log(`Test D Passed? ${testD_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST H: Rollback reassignment -> UPDATE broadcast
  console.log('--- TEST H: rollbackReassignmentAction ---');
  await new Promise((r) => setTimeout(r, 1000));
  const countH = receivedBroadcasts.length;
  await rollbackReassignmentAction({ volunteerId, previousDayKey: '2026-08-28', previousShiftKey: 'T1', currentDayKey: '2026-08-29', currentShiftKey: 'T2', actorName: 'Tester' });
  await new Promise((r) => setTimeout(r, 2000));
  const sliceH = receivedBroadcasts.slice(countH);
  const testH_passed = sliceH.some(b => b.eventType === 'UPDATE' && b.record?.volunteer_id === volunteerId);
  console.log(`Test H Passed? ${testH_passed ? '✅ YES' : '❌ NO'}\n`);

  // TEST E: Approve shift change request -> DELETE (old) + INSERT (new) broadcast
  console.log('--- TEST E: approveShiftChangeRequestAction ---');
  await new Promise((r) => setTimeout(r, 1000));
  const { data: req } = await adminClient.from('shift_change_requests').insert({
    volunteer_id: volunteerId,
    current_day_key: '2026-08-28',
    current_shift_key: 'T1',
    requested_day_key: '2026-08-30',
    requested_shift_key: 'T4',
    status: 'pending'
  }).select('id').single();

  const countE = receivedBroadcasts.length;
  if (req) {
    const resE = await approveShiftChangeRequestAction(req.id);
    console.log('Test E Action Result:', resE);
  }
  await new Promise((r) => setTimeout(r, 3000));
  const sliceE = receivedBroadcasts.slice(countE);
  const hasDeleteE = sliceE.some(b => b.eventType === 'DELETE' && b.record?.volunteer_id === volunteerId);
  const hasInsertE = sliceE.some(b => b.eventType === 'INSERT' && b.record?.volunteer_id === volunteerId);
  const testE_passed = hasDeleteE && hasInsertE;
  console.log(`Test E Passed? ${testE_passed ? '✅ YES' : '❌ NO'} (Received DELETE: ${hasDeleteE}, INSERT: ${hasInsertE})\n`);

  // Cleanup
  await adminClient.from('shifts').delete().eq('volunteer_id', volunteerId);
  await adminClient.from('shift_change_requests').delete().eq('volunteer_id', volunteerId);
  await channel.unsubscribe();

  console.log('===========================================================');
  console.log('  SUMMARY OF BROADCAST ROUTE VERIFICATIONS:');
  console.log(`  Test A (Check-in):           ${testA_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test B (Check-out):          ${testB_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test C (Adjust Checkout):    ${testC_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test D (Reassign Shift):     ${testD_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test E (Approve Shift Req):  ${testE_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test F (Undo Check-in):      ${testF_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test G (Reopen Shift):       ${testG_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Test H (Rollback Reassign):  ${testH_passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('===========================================================');

  if (testA_passed && testB_passed && testC_passed && testD_passed && testE_passed && testF_passed && testG_passed && testH_passed) {
    console.log('\n✨ ALL 8 BROADCAST MUTATION ROUTES COMPLETED AND VERIFIED 100% SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runAllShiftBroadcastTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
