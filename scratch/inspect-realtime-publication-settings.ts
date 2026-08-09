import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('--- INSPECTION SCRIPT ---');
  const { data } = await supabase.from('volunteers').select('id').limit(1);
  console.log('Volunteers sample:', data);
  process.exit(0);
}

main().catch(console.error);
