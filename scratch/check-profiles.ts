import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, status')
    .eq('status', 'archived');
  console.log('Archived profiles in DB:', profiles);
}
main();
