const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
ALTER TABLE public.committees ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
UPDATE public.committees SET status = 'active' WHERE status IS NULL;
`;

async function run() {
  console.log('🔧 Adding status column to committees table...');
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!res.ok) {
    console.log('Testing column addition via select...');
    const { data, error } = await supabase.from('committees').select('id, name, status').limit(1);
    if (error) {
      console.log('Status column is missing. Please run in Supabase SQL Editor:');
      console.log(SQL);
    } else {
      console.log('Status column already exists!');
    }
  } else {
    console.log('Successfully added status column to committees table!');
  }
}

run().catch(console.error);
