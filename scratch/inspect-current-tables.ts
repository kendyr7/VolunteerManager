import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectCurrentTables() {
  console.log('--- INSPECTING CURRENT TABLES IN SUPABASE ---');

  const { data: revs, error: rErr } = await supabase.from('phone_cleanup_reviews').select('*').limit(5);
  console.log('phone_cleanup_reviews sample:', revs, rErr?.message);

  const { data: items, error: iErr } = await supabase.from('phone_cleanup_review_items').select('*').limit(5);
  console.log('phone_cleanup_review_items sample:', items, iErr?.message);
}

inspectCurrentTables().catch(console.error);
