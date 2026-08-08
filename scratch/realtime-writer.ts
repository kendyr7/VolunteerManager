import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function runWriter() {
  console.log('===========================================================');
  console.log('  REALTIME WRITER (SEPARATE ISOLATED PROCESS)              ');
  console.log('===========================================================\n');
  console.log('URL:', supabaseUrl);

  const { data: vol } = await supabase.from('volunteers').select('*').limit(1).single();
  if (!vol) {
    console.error('No volunteer found');
    return;
  }

  const newName = `${vol.first_name}_REALTIME_${Date.now().toString().slice(-4)}`;
  console.log(`Writing UPDATE to volunteer ${vol.id}: first_name -> "${newName}"...`);

  const { data, error } = await supabase
    .from('volunteers')
    .update({ first_name: newName })
    .eq('id', vol.id)
    .select('id, first_name, updated_at')
    .single();

  if (error) {
    console.error('❌ Writer error:', error.message);
  } else {
    console.log('✅ WRITER UPDATE SUCCESSFUL:', data);
  }

  // Wait 1 sec and revert
  await new Promise(r => setTimeout(r, 1500));
  await supabase.from('volunteers').update({ first_name: vol.first_name }).eq('id', vol.id);
  console.log('✅ Reverted test name to:', vol.first_name);
}

runWriter().catch(err => console.error(err));
