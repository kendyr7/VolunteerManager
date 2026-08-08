import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDrevelGroup() {
  console.log('--- INSPECTING DREVEL / JAQUELINE GROUP IN SUPABASE ---');
  const { data: vols, error } = await supabase
    .from('volunteers')
    .select('id, first_name, last_name, phone, status, phone_normalized, is_shared_phone, shared_phone_owner_id')
    .or('first_name.ilike.%Drevel%,last_name.ilike.%Drevel%,first_name.ilike.%Jaqueline%,last_name.ilike.%Jaqueline%,first_name.ilike.%Jaquline%');

  if (error) {
    console.error('Error fetching Drevel/Jaqueline:', error.message);
    return;
  }

  console.log(`Found ${vols.length} volunteers:`);
  vols.forEach(v => {
    console.log(`- ID: ${v.id} | Name: ${v.first_name} ${v.last_name} | Phone: ${v.phone} | Status: ${v.status} | PhoneNorm: ${v.phone_normalized} | Shared: ${v.is_shared_phone} | Owner: ${v.shared_phone_owner_id}`);
  });
}

inspectDrevelGroup().catch(console.error);
