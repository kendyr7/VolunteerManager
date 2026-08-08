import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function listRpcs() {
  console.log('Testing RPC calls...');
  const { data, error } = await supabase.rpc('get_schema_version' as any);
  console.log('get_schema_version:', { data, error });
}

listRpcs().catch(console.error);
