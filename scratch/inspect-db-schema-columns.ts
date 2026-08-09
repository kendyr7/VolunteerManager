import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('--- DB SCHEMA & COLUMNS INSPECTION ---');

  // Query one row from volunteers
  const { data: vRow, error: vErr } = await supabase.from('volunteers').select('*').limit(1);
  if (vRow && vRow.length > 0) {
    console.log('\n[volunteers] Columns:', Object.keys(vRow[0]));
    console.log('[volunteers] Sample record:', vRow[0]);
  } else {
    console.log('[volunteers] Error or empty:', vErr);
  }

  // Query one row from shifts
  const { data: sRow, error: sErr } = await supabase.from('shifts').select('*').limit(1);
  if (sRow && sRow.length > 0) {
    console.log('\n[shifts] Columns:', Object.keys(sRow[0]));
    console.log('[shifts] Sample record:', sRow[0]);
  } else {
    console.log('[shifts] Error or empty:', sErr);
  }

  process.exit(0);
}

main().catch(console.error);
