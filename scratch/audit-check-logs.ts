import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAuditLogs() {
  console.log('--- READ-ONLY AUDIT OF ACTIVITY LOGS ---');
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching activity logs:', error.message);
    return;
  }

  console.log(`Found ${data.length} activity log entries.`);
  data.forEach((l, i) => {
    console.log(`${i + 1}. [${l.created_at}] Action: ${l.action_type} | User: ${l.user_name} | Desc: ${l.description}`);
  });
}

checkAuditLogs().catch(console.error);
