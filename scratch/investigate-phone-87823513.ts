import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigatePhone() {
  const { data: vols } = await supabase
    .from('volunteers')
    .select('*')
    .or('phone_normalized.ilike.%87823513%,phone.ilike.%87823513%');

  console.log('Volunteers with 87823513:', vols);

  const { data: items } = await supabase
    .from('phone_cleanup_review_items')
    .select('*, volunteers!volunteer_id(first_name, last_name, phone)')
    .or('original_phone.ilike.%87823513%,corrected_phone.ilike.%87823513%');

  console.log('Review items with 87823513:', items);
}

investigatePhone().catch(console.error);
