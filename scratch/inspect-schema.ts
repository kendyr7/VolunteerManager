import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  console.log('--- INSPECTING VOLUNTEERS TABLE SCHEMA AND COLUMNS ---');
  
  // 1. Fetch sample row to check columns
  const { data: sampleRow, error: sampleErr } = await supabase
    .from('volunteers')
    .select('*')
    .limit(1)
    .single();

  if (sampleErr) {
    console.error('Error querying sample row:', sampleErr);
  } else {
    console.log('Existing columns in volunteers table:', Object.keys(sampleRow || {}));
  }

  // 2. Check if Phase 2 columns exist
  const phase2Cols = [
    'phone_normalized',
    'is_shared_phone',
    'shared_phone_owner_id',
    'shared_phone_reason',
    'shared_phone_authorized_by',
    'shared_phone_authorized_at'
  ];

  const existingPhase2Cols = phase2Cols.filter(col => sampleRow && col in sampleRow);
  console.log('Phase 2 columns already present:', existingPhase2Cols);
}

inspectSchema().catch(console.error);
