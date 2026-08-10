import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceKey);

async function testLiveConstraints() {
  console.log('===========================================================');
  console.log('  TESTING LIVE POSTGRES CONSTRAINTS (EXPECTED REJECTIONS)  ');
  console.log('===========================================================\n');

  // Test 1: Invalid status constraint
  const { error: err1 } = await adminClient
    .from('attendance_sessions')
    .insert({
      volunteer_id: '00000000-0000-0000-0000-000000000000',
      day_key: 'jue 10',
      status: 'invalid_status'
    });
  console.log('Test 1 (invalid status):', err1?.message.includes('chk_attendance_session_status') ? '✅ REJECTED BY chk_attendance_session_status' : err1?.message);

  // Test 2: Completed status without ended_at
  const { error: err2 } = await adminClient
    .from('attendance_sessions')
    .insert({
      volunteer_id: '00000000-0000-0000-0000-000000000000',
      day_key: 'jue 10',
      status: 'completed',
      ended_at: null
    });
  console.log('Test 2 (completed without ended_at):', err2?.message.includes('chk_attendance_session_open_ended') ? '✅ REJECTED BY chk_attendance_session_open_ended' : err2?.message);

  // Test 3: ended_at < started_at
  const { error: err3 } = await adminClient
    .from('attendance_sessions')
    .insert({
      volunteer_id: '00000000-0000-0000-0000-000000000000',
      day_key: 'jue 10',
      started_at: '2026-09-11T18:00:00Z',
      ended_at: '2026-09-11T10:00:00Z',
      status: 'completed'
    });
  console.log('Test 3 (ended_at < started_at):', err3?.message.includes('chk_attendance_session_chronology') ? '✅ REJECTED BY chk_attendance_session_chronology' : err3?.message);

  // Test 4: Foreign Key constraint to volunteers
  const { error: err4 } = await adminClient
    .from('attendance_sessions')
    .insert({
      volunteer_id: '00000000-0000-0000-0000-000000000000',
      day_key: 'jue 10',
      started_at: '2026-09-11T10:00:00Z',
      ended_at: null,
      status: 'open'
    });
  console.log('Test 4 (FK to volunteers):', err4?.message.includes('foreign key constraint') || err4?.message.includes('volunteers') ? '✅ REJECTED BY FOREIGN KEY TO volunteers' : err4?.message);

  // Final count check to ensure 0 rows remain
  const { count } = await adminClient.from('attendance_sessions').select('*', { count: 'exact', head: true });
  console.log(`\nFinal row count in attendance_sessions: ${count} (0 expected)`);
}

testLiveConstraints().catch(console.error);
