import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLegacyFieldsDetail() {
  console.log('===========================================================');
  console.log('  READ-ONLY DETAIL AUDIT OF 44 LEGACY REVIEW ITEMS         ');
  console.log('===========================================================\n');

  const { data: items, error } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error || !items) {
    console.error('Error fetching review items:', error?.message);
    return;
  }

  console.log(`Fetched ${items.length} items. Distribution of approved_action and processing_status:\n`);

  const approvedActionCounts: Record<string, number> = {};
  const processingStatusCounts: Record<string, number> = {};

  items.forEach(item => {
    approvedActionCounts[item.approved_action] = (approvedActionCounts[item.approved_action] || 0) + 1;
    processingStatusCounts[item.processing_status] = (processingStatusCounts[item.processing_status] || 0) + 1;
  });

  console.log('Approved Action Counts in DB:');
  Object.entries(approvedActionCounts).forEach(([k, v]) => console.log(`  - "${k}": ${v}`));

  console.log('\nProcessing Status Counts in DB:');
  Object.entries(processingStatusCounts).forEach(([k, v]) => console.log(`  - "${k}": ${v}`));

  console.log('\nSample items detail:');
  items.slice(0, 5).forEach((item, idx) => {
    console.log(`\nItem #${idx + 1} (ID: ${item.id}):`);
    console.log(`  - volunteer_id: ${item.volunteer_id}`);
    console.log(`  - proposed_action: ${item.proposed_action}`);
    console.log(`  - approved_action: ${item.approved_action}`);
    console.log(`  - corrected_phone: ${item.corrected_phone}`);
    console.log(`  - processing_status: ${item.processing_status}`);
    console.log(`  - reviewer_comment: ${item.reviewer_comment}`);
  });

  console.log('\n===========================================================');
  console.log('  READ-ONLY AUDIT COMPLETE. ZERO MUTATIONS PERFORMED.      ');
  console.log('===========================================================');
}

inspectLegacyFieldsDetail().catch(console.error);
