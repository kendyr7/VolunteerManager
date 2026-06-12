import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
async function run() {
  const { data } = await supabase.from('volunteers').select('*').limit(1);
  console.log("COLUMNS: ", Object.keys(data?.[0] || {}));
}
run();
