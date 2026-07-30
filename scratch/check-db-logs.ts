import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log("=== CHECKING SHIFT CHANGE REQUESTS ===");
  const { data: requests, error: reqErr } = await supabase
    .from('shift_change_requests')
    .select('*');

  console.log("Requests count:", requests?.length, "Error:", reqErr);
  console.log("Requests data:", JSON.stringify(requests, null, 2));

  console.log("\n=== CHECKING ACTIVITY LOGS ===");
  const { data: logs, error: logErr } = await supabase
    .from('activity_logs')
    .select('*');

  console.log("Activity logs count:", logs?.length, "Error:", logErr);
  console.log("Activity logs data:", JSON.stringify(logs, null, 2));
}

main();
