import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function applyDdl() {
  console.log('===========================================================');
  console.log('  EXECUTING DDL MIGRATION ON SUPABASE PROJECT tjcrgohdkntkixirhilo');
  console.log('===========================================================\n');

  const sqlPath = path.join(process.cwd(), 'supabase/migrations/20261010000000_attendance_sessions.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

  // Attempt RPC exec_sql or query execution
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('exec_sql', { sql: sqlContent });

  if (rpcErr) {
    console.log('RPC exec_sql result:', rpcErr.message);
  } else {
    console.log('RPC exec_sql succeeded:', rpcRes);
  }

  // Verify if table now exists
  const { data: tableData, error: tableErr } = await supabase
    .from('attendance_sessions')
    .select('id')
    .limit(1);

  if (!tableErr) {
    console.log('✅ TABLE public.attendance_sessions IS LIVE AND ACCESSIBLE VIA SERVICE ROLE!');
  } else {
    console.log('Table check error:', tableErr.message);
  }
}

applyDdl().catch(console.error);
