import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function applyAttendanceSessionsMigration() {
  console.log('===========================================================');
  console.log('  APPLYING MIGRATION: 20261010000000_attendance_sessions   ');
  console.log('===========================================================\n');

  const sqlPath = path.join(process.cwd(), 'supabase/migrations/20261010000000_attendance_sessions.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

  // Try RPC exec_sql first
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql: sqlContent });
  
  if (rpcError) {
    console.log('⚠️ RPC exec_sql failed or not available:', rpcError.message);
    console.log('Trying with parameter query...');

    const { error: queryErr } = await supabase.rpc('exec_sql', { query: sqlContent });
    if (queryErr) {
      console.log('⚠️ RPC exec_sql with query parameter failed:', queryErr.message);
    } else {
      console.log('✅ RPC exec_sql migration executed successfully!');
    }
  } else {
    console.log('✅ RPC exec_sql migration executed successfully!');
  }

  // Verify attendance_sessions table access
  console.log('\n--- VERIFYING ATTENDANCE_SESSIONS TABLE ---');
  const { data: sample, error: sampleErr } = await supabase
    .from('attendance_sessions')
    .select('id, volunteer_id, day_key, started_at, ended_at, status, auto_closed')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Table verification error:', sampleErr.message);
  } else {
    console.log('✅ attendance_sessions table accessible in Supabase!', sample);
  }
}

applyAttendanceSessionsMigration().catch(console.error);
