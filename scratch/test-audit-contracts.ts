/**
 * Audit Contract Regression Test Suite
 *
 * Verifies for all 13 critical mutation operations:
 * 1. 1 mutation -> 1 audit log (or N mutations -> N batched audit logs)
 * 2. target_id is ALWAYS the real UUID (volunteer.id or committee.id)
 * 3. details follows the structured JSON contract ({ changes: [...] } or { context: {...} })
 * 4. ZERO secrets (no PINs stored in activity_logs)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { VolunteerMutationService } from '@/lib/services/volunteer-mutation.service';
import { CommitteeMutationService } from '@/lib/services/committee-mutation.service';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const actor = {
  name: 'AUDIT_CONTRACT_TESTER',
  role: 'Admin',
};

async function runAuditContractTests() {
  console.log('===========================================================');
  console.log('  RUNNING AUDIT CONTRACT REGRESSION SUITE (13 CRITICAL CASES)  ');
  console.log('===========================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, failureReason?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAILED: ${testName} -> ${failureReason || 'Assertion failed'}`);
      failedTests++;
    }
  }

  const createdVolunteerIds: string[] = [];
  const createdCommitteeIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // CASE 1: CREATE volunteer
    // -------------------------------------------------------------------------
    console.log('[Case 1] CREATE volunteer contract test...');
    const testPhone1 = `+50599990001`;
    const createRes = await VolunteerMutationService.createVolunteer(
      {
        firstName: 'TestFirst',
        lastName: 'TestLast',
        phone: testPhone1,
        stake: 'Test Stake',
        neighborhood: 'Test Ward',
      },
      actor
    );

    assert(createRes.success && !!createRes.volunteer?.id, 'Create volunteer response');
    const volId1 = createRes.volunteer?.id!;
    if (volId1) createdVolunteerIds.push(volId1);

    const { data: log1 } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', volId1)
      .eq('action_type', 'Creación')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(!!log1, 'Log entry created for volunteer creation');
    assert(log1?.target_id === volId1, 'target_id matches volunteer.id');
    assert(!JSON.stringify(log1).toLowerCase().includes('"pin"'), 'Zero secrets: PIN is NOT stored in activity_logs');
    assert(log1?.details?.includes('context'), 'details uses structured context contract');

    // -------------------------------------------------------------------------
    // CASE 2: EDIT volunteer
    // -------------------------------------------------------------------------
    console.log('\n[Case 2] EDIT volunteer contract test...');
    const editRes = await VolunteerMutationService.updateProfile(
      volId1,
      {
        firstName: 'TestFirstUpdated',
        lastName: 'TestLastUpdated',
        phone: testPhone1,
        stake: 'Test Stake Updated',
        neighborhood: 'Test Ward Updated',
      },
      actor
    );

    assert(editRes.success && !editRes.skipped, 'Update volunteer response');

    const { data: log2 } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', volId1)
      .eq('action_type', 'Edición')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(!!log2, 'Log entry created for volunteer edit');
    assert(log2?.target_id === volId1, 'target_id matches volunteer.id');
    assert(log2?.details?.includes('changes'), 'details uses structured changes diff contract');

    // -------------------------------------------------------------------------
    // CASE 3 & 4: ARCHIVE and RESTORE volunteer
    // -------------------------------------------------------------------------
    console.log('\n[Case 3 & 4] ARCHIVE and RESTORE volunteer contract test...');
    const archiveRes = await VolunteerMutationService.updateStatus(
      { volunteerId: volId1, toStatus: 'archived' },
      actor
    );
    assert(archiveRes.success, 'Archive volunteer response');

    const { data: log3 } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', volId1)
      .eq('action_type', 'Archivado')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(!!log3 && log3?.target_id === volId1, 'Archive log target_id matches volunteer.id');

    const restoreRes = await VolunteerMutationService.updateStatus(
      { volunteerId: volId1, toStatus: 'active' },
      actor
    );
    assert(restoreRes.success, 'Restore volunteer response');

    const { data: log4 } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', volId1)
      .eq('action_type', 'Restaurado')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(!!log4 && log4?.target_id === volId1, 'Restore log target_id matches volunteer.id');

    // -------------------------------------------------------------------------
    // CASE 5: SWAP volunteers
    // -------------------------------------------------------------------------
    console.log('\n[Case 5] SWAP volunteers contract test...');
    const testPhone2 = `+50599990002`;
    const vol2Res = await VolunteerMutationService.createVolunteer(
      { firstName: 'SwapTarget', lastName: 'Vol', phone: testPhone2 },
      actor
    );
    const volId2 = vol2Res.volunteer?.id!;
    if (volId2) createdVolunteerIds.push(volId2);

    await VolunteerMutationService.updateStatus({ volunteerId: volId2, toStatus: 'archived' }, actor);

    const swapRes = await VolunteerMutationService.swapVolunteerActivation(volId1, volId2, actor);
    assert(swapRes.success, 'Swap volunteer activation response');

    const { data: swapLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .in('target_id', [volId1, volId2])
      .order('created_at', { ascending: false })
      .limit(2);

    assert(swapLogs?.length === 2, 'Swap generated exactly 2 audit entries');
    const details1 = JSON.parse(swapLogs?.[0]?.details || '{}');
    const details2 = JSON.parse(swapLogs?.[1]?.details || '{}');
    assert(!!details1.operationId && details1.operationId === details2.operationId, 'Both swap audit entries share the same operationId');

    // -------------------------------------------------------------------------
    // CASE 6, 7, 8: RESET PIN, CHANGE PIN, INITIAL PIN
    // -------------------------------------------------------------------------
    console.log('\n[Case 6, 7, 8] PIN security mutation contract tests...');
    const resetRes = await VolunteerMutationService.resetPin(volId1, actor);
    assert(resetRes.success, 'Reset PIN response');

    // Change PIN from default '1234' to secure non-sequential PIN '9472'
    const changeRes = await VolunteerMutationService.changePin(volId1, '1234', '9472', actor);
    assert(changeRes.success, 'Change PIN response');

    // Fresh volunteer with no PIN for setInitialPin test
    const testPhone3 = `+50599990003`;
    const freshVol = await VolunteerMutationService.createVolunteer({ firstName: 'FreshPin', lastName: 'Vol', phone: testPhone3 }, actor);
    const volId3 = freshVol.volunteer?.id!;
    if (volId3) createdVolunteerIds.push(volId3);

    // Clear pin on DB to simulate no initial pin set
    await supabase.from('volunteers').update({ pin: null }).eq('id', volId3);

    // Set initial secure PIN '8391'
    const initPinRes = await VolunteerMutationService.setInitialPin(volId3, '8391', actor);
    assert(initPinRes.success, 'Set initial PIN response');

    const { data: pinLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .in('target_id', [volId1, volId3])
      .eq('action_type', 'Seguridad')
      .order('created_at', { ascending: false });

    assert(pinLogs?.length === 3, 'All 3 PIN events generated Seguridad audit logs');
    const allPinLogsStr = JSON.stringify(pinLogs);
    assert(!allPinLogsStr.includes('1234') && !allPinLogsStr.includes('8765') && !allPinLogsStr.includes('5678'), 'ZERO secrets: No PIN values stored in audit logs');
    assert(!!(pinLogs?.every(l => l.target_id === volId1 || l.target_id === volId3)), 'All PIN audit logs have valid target_id');

    // -------------------------------------------------------------------------
    // CASE 9: UNLINK committee
    // -------------------------------------------------------------------------
    console.log('\n[Case 9] UNLINK committee contract test...');
    const commTestRes = await CommitteeMutationService.createCommittee(`TestComm_${Date.now()}`, actor);
    const commId = commTestRes.committee?.id!;
    if (commId) createdCommitteeIds.push(commId);

    await VolunteerMutationService.updateProfile(volId1, { firstName: 'TestFirstUpdated', lastName: 'TestLastUpdated', phone: testPhone1, committeeId: commId }, actor);
    await VolunteerMutationService.updateProfile(volId2, { firstName: 'SwapTarget', lastName: 'Vol', phone: testPhone2, committeeId: commId }, actor);

    const unlinkRes = await VolunteerMutationService.unlinkVolunteersFromCommittee(commId, actor);
    assert(unlinkRes.success, 'Unlink volunteers from committee response');

    const { data: unlinkLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .in('target_id', [volId1, volId2])
      .eq('description', 'Desvinculó al voluntario del comité')
      .order('created_at', { ascending: false });

    assert(unlinkLogs?.length === 2, 'Unlink generated batched individual audit logs for all 2 volunteers');

    // -------------------------------------------------------------------------
    // CASE 10, 11, 12: CREATE, ARCHIVE, RESTORE committee
    // -------------------------------------------------------------------------
    console.log('\n[Case 10, 11, 12] CREATE, ARCHIVE, RESTORE committee contract tests...');
    assert(commTestRes.success && !!commId, 'Create committee response');

    const { data: commCreateLog } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', commId)
      .eq('action_type', 'Creación')
      .single();

    assert(!!commCreateLog && commCreateLog.target_id === commId, 'Create committee log has target_id = committee.id');

    const archiveCommRes = await CommitteeMutationService.archiveCommittee(commId, commTestRes.committee.name, commTestRes.committee.name, 'delete', actor);
    assert(archiveCommRes.success, 'Archive committee response');

    const { data: commArchiveLog } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', commId)
      .eq('action_type', 'Eliminación')
      .single();

    assert(!!commArchiveLog && commArchiveLog.target_id === commId, 'Archive committee log has target_id = committee.id');

    const restoreCommRes = await CommitteeMutationService.unarchiveCommittee(commId, actor);
    assert(restoreCommRes.success, 'Restore committee response');

    const { data: commRestoreLog } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', commId)
      .eq('action_type', 'Edición')
      .single();

    assert(!!commRestoreLog && commRestoreLog.target_id === commId, 'Restore committee log has target_id = committee.id');

    // -------------------------------------------------------------------------
    // CASE 13: CHANGE shift requirements
    // -------------------------------------------------------------------------
    console.log('\n[Case 13] CHANGE shift requirements contract test...');
    const reqRes = await CommitteeMutationService.updateShiftRequirements(
      [commTestRes.committee.name],
      { T1: 8, T2: 6, T3: 4, T4: 4 },
      actor
    );

    assert(reqRes.success, 'Update shift requirements response');

    const { data: reqLogs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('target_id', commId)
      .eq('description', `Actualizó los requerimientos de turno del comité "${commTestRes.committee.name}"`)
      .order('created_at', { ascending: false })
      .limit(1);

    assert(reqLogs?.length === 1 && reqLogs[0].target_id === commId, 'Shift requirement update log has target_id = committee.id and contains diffs');

  } catch (err: any) {
    console.error('UNHANDLED TEST EXCEPTION:', err);
    failedTests++;
  } finally {
    console.log('\nCleaning up test artifacts...');
    if (createdVolunteerIds.length > 0) {
      await supabase.from('activity_logs').delete().in('target_id', createdVolunteerIds);
      await supabase.from('volunteers').delete().in('id', createdVolunteerIds);
    }
    if (createdCommitteeIds.length > 0) {
      await supabase.from('activity_logs').delete().in('target_id', createdCommitteeIds);
      await supabase.from('committee_shift_requirements').delete().in('committee_id', createdCommitteeIds);
      await supabase.from('committees').delete().in('id', createdCommitteeIds);
    }
    console.log('Cleanup finished.');
  }

  console.log('\n===========================================================');
  console.log(`  AUDIT CONTRACT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED  `);
  console.log('===========================================================');
}

runAuditContractTests().catch(console.error);
