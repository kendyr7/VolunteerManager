import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDbReviews() {
  console.log('--- CHECKING PHONE CLEANUP REVIEWS IN DB ---');
  const { data: reviews, error: err1 } = await supabase.from('phone_cleanup_reviews').select('*');
  console.log('phone_cleanup_reviews count:', reviews?.length, 'error:', err1?.message);
  if (reviews && reviews.length > 0) {
    console.log('Sample review:', reviews[0]);
  }

  const { data: items, error: err2 } = await supabase.from('phone_cleanup_review_items').select('*');
  console.log('phone_cleanup_review_items count:', items?.length, 'error:', err2?.message);
  if (items && items.length > 0) {
    console.log('Sample item:', items[0]);
  }
}

checkDbReviews().catch(console.error);
