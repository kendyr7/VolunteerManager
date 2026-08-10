import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function inspectEnv() {
  console.log('--- SUPABASE ENVIRONMENT AUDIT ---');
  console.log('URL:', supabaseUrl);
  console.log('Project Ref:', supabaseUrl.replace('https://', '').replace('.supabase.co', ''));

  // Query volunteers count
  const { count: volCount, error: volErr } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  console.log('Volunteers Count in DB:', volCount, 'Error:', volErr?.message);

  // Query shifts count
  const { count: shiftCount, error: shiftErr } = await supabase
    .from('shifts')
    .select('*', { count: 'exact', head: true });

  console.log('Shifts Count in DB:', shiftCount, 'Error:', shiftErr?.message);

  // Query attendance_sessions
  const { data: sessData, error: sessErr } = await supabase
    .from('attendance_sessions')
    .select('*')
    .limit(1);

  console.log('attendance_sessions table status:', sessErr ? `MISSING (${sessErr.message})` : `EXISTS (Count sample: ${sessData?.length})`);
}

inspectEnv().catch(console.error);
