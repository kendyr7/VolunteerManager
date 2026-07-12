const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  // Try to update one shift row to see the exact database error
  const { data, error } = await supabase
    .from('shifts')
    .update({ checked_in: true })
    .eq('id', 'fcd1924b-9703-4cc2-af16-9d4c1f5c3b3f')
    .select();
    
  console.log("UPDATE ATTEMPT RESULT:", { data, error });
}

check();
