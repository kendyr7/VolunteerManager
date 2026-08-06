import { validateShiftInvariants, assertShiftConsistency } from '../lib/utils/shift-invariants';
import { mergeRealtimeRecord } from '../lib/utils/realtime-merge';
import { getVolunteerProfileMetrics } from '../lib/services/volunteer-profile.service';

console.log('====================================================');
console.log('   RUNNING DOMAIN INVARIANTS & SCENARIO RUNNER TEST ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assertTest(name: string, condition: boolean, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } else {
    console.error(`❌ FAIL: ${name} ${details ? `(${details})` : ''}`);
  }
}

// 1. Test Invariants Validation
const invalidShift1 = {
  id: 'shift-1',
  day_key: 'sáb 12',
  shift_key: 'T3',
  checked_out: false,
  checked_out_at: '2026-08-05T20:00:00Z',
};

const result1 = validateShiftInvariants(invalidShift1);
assertTest(
  'Invariant 1: checked_out_at automatically normalizes checked_out to true',
  result1.sanitizedShift.checked_out === true
);

const invalidShift2 = {
  id: 'shift-2',
  day_key: 'vie 11',
  shift_key: 'T4',
  checked_out: true,
  status: 'scheduled',
};

const result2 = validateShiftInvariants(invalidShift2);
assertTest(
  'Invariant 3: checked_out=true automatically normalizes status to completed',
  result2.sanitizedShift.status === 'completed'
);

// 2. Test Smart Merge Non-Destructive Behavior
const existingRecord = {
  id: 'shift-100',
  volunteer_id: 'vol-abc',
  day_key: 'vie 11',
  shift_key: 'T4',
  checked_in: true,
  checked_in_at: '2026-08-05T10:00:00Z',
  checked_out: true,
  checked_out_at: '2026-08-05T11:00:00Z',
  status: 'completed',
};

const partialPayload = {
  id: 'shift-100',
  updated_at: '2026-08-06T10:00:00Z',
  notes: 'Audit edit',
};

const merged = mergeRealtimeRecord(existingRecord, partialPayload);
assertTest(
  'Smart Merge: Partial payload retains checked_in flag',
  merged.checked_in === true
);
assertTest(
  'Smart Merge: Partial payload retains checked_out flag',
  merged.checked_out === true
);
assertTest(
  'Smart Merge: Partial payload retains checked_out_at timestamp',
  merged.checked_out_at === '2026-08-05T11:00:00Z'
);

// 3. Scenario Runner Simulation: Check-In -> Check-Out -> Reopen -> Reassign -> Check-In -> Check-Out
console.log('\n--- Running Rapid Sequence Scenario Runner ---');

let shiftState: any = {
  id: 'shift-scenario-1',
  volunteer_id: 'vol-test-runner',
  day_key: 'vie 11',
  shift_key: 'T4',
  checked_in: false,
  checked_out: false,
  status: 'scheduled',
};

// Event 1: Check-in
shiftState = mergeRealtimeRecord(shiftState, {
  checked_in: true,
  checked_in_at: new Date().toISOString(),
  status: 'confirmed',
});
assertTest('Scenario Step 1 (Check-In): status is confirmed', shiftState.checked_in === true);

// Event 2: Check-out
shiftState = mergeRealtimeRecord(shiftState, {
  checked_out: true,
  checked_out_at: new Date().toISOString(),
  status: 'completed',
});
assertTest('Scenario Step 2 (Check-Out): checked_out is true', shiftState.checked_out === true);

// Event 3: Admin Reopen
shiftState = mergeRealtimeRecord(shiftState, {
  checked_out: false,
  checked_out_at: null,
  status: 'confirmed',
});
assertTest('Scenario Step 3 (Reopen): checked_out is false & checked_out_at is null', shiftState.checked_out === false && shiftState.checked_out_at === null);

// Event 4: Reassign to sáb 12 T3 via Atomic Update
shiftState = mergeRealtimeRecord(shiftState, {
  day_key: 'sáb 12',
  shift_key: 'T3',
  checked_in: false,
  checked_in_at: null,
  checked_out: false,
  checked_out_at: null,
  status: 'scheduled',
});
assertTest('Scenario Step 4 (Reassign): day_key updated to sáb 12 T3', shiftState.day_key === 'sáb 12' && shiftState.shift_key === 'T3');

// Event 5: Check-in on new shift
shiftState = mergeRealtimeRecord(shiftState, {
  checked_in: true,
  checked_in_at: new Date().toISOString(),
  status: 'confirmed',
});

// Event 6: Final Check-out on new shift
shiftState = mergeRealtimeRecord(shiftState, {
  checked_out: true,
  checked_out_at: new Date().toISOString(),
  status: 'completed',
});
assertTest('Scenario Step 6 (Final Check-Out): final shift is completed', shiftState.checked_out === true && shiftState.status === 'completed');

// Verify Profile Metrics on final shift state
const finalMetrics = getVolunteerProfileMetrics('vol-test-runner', [shiftState]);
assertTest('Profile Metrics: Calculates completed shifts count as 1', finalMetrics.completedShiftsCount === 1);
assertTest('Profile Metrics: Worked minutes is greater than 0', finalMetrics.totalWorkedMinutes > 0);

console.log(`\n====================================================`);
console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
console.log(`====================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
