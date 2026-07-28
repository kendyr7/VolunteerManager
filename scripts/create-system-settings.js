const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SQL = `
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'System settings readable by all'
  ) THEN
    CREATE POLICY "System settings readable by all"
      ON public.system_settings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'System settings writable by all'
  ) THEN
    CREATE POLICY "System settings writable by all"
      ON public.system_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.system_settings (key, value)
VALUES ('allow_coordinator_shift_edit', 'false')
ON CONFLICT (key) DO NOTHING;
`;

async function run() {
  console.log('🔧 Checking/creating system_settings table in Supabase...');

  // First check if table already exists
  const { data, error } = await supabase.from('system_settings').select('key').limit(1);

  if (!error) {
    console.log('✅ Table public.system_settings already exists and is readable!');
    return;
  }

  console.log('Table missing or inaccessible. Attempting to execute SQL via REST or rpc...');

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!res.ok) {
    console.log('\n------------------------------------------------------------');
    console.log('⚠️ Could not run exec_sql automatically.');
    console.log('Please copy and execute the following SQL in your Supabase Dashboard SQL Editor:');
    console.log('------------------------------------------------------------');
    console.log(SQL);
    console.log('------------------------------------------------------------\n');
  } else {
    console.log('🎉 Successfully created public.system_settings table in Supabase!');
  }
}

run().catch(console.error);
