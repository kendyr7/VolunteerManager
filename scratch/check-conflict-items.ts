import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConflictItems() {
  const { data: items } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .not('processing_error', 'is', null);

  console.log('Items with processing_error:', items);

  const { data: items2 } = await supabase
    .from('phone_cleanup_review_items')
    .select('status, processing_status, count')
    .select('*');

  const statusSummary: Record<string, number> = {};
  items2?.forEach(i => {
    const k = `${i.status} | ${i.processing_status}`;
    statusSummary[k] = (statusSummary[k] || 0) + 1;
  });
  console.log('Status Summary:', statusSummary);
}

checkConflictItems().catch(console.error);
