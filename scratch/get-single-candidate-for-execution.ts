import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getCandidateForExecution() {
  const { data: items } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .not('volunteer_id', 'is', null)
    .order('created_at', { ascending: false });

  if (items) {
    for (const item of items) {
      const { data: vol } = await supabase.from('volunteers').select('first_name, last_name, phone').eq('id', item.volunteer_id).maybeSingle();
      if (vol) {
        console.log(JSON.stringify({
          itemId: item.id,
          volunteerId: item.volunteer_id,
          volunteerName: `${vol.first_name || ''} ${vol.last_name || ''}`.trim(),
          phoneActual: vol.phone || 'N/A',
          decision: item.decision || 'PHONE_OWNER',
          correctedPhone: item.corrected_phone,
          sharedPhoneOwnerId: item.shared_phone_owner_id,
        }, null, 2));
        return;
      }
    }
  }
}

getCandidateForExecution().catch(console.error);
