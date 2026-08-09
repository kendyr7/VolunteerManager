import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'volunteers' 
      AND policyname = 'Lectura pública de volunteers'
  ) THEN
    CREATE POLICY "Lectura pública de volunteers"
    ON public.volunteers
    FOR SELECT
    USING (true);
  END IF;
END $$;
`;

async function applyMigration() {
  console.log('?? Applying migration 20261006000000_volunteers_select_policy.sql...');

  // Try RPC exec_sql first
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (res.ok) {
    console.log('? Migration applied successfully via exec_sql RPC!');
  } else {
    const text = await res.text();
    console.log('exec_sql RPC response:', res.status, text);
    
    // Check if policy exists by querying pg_policies if accessible
    const { data: policies, error } = await supabase
      .from('pg_policies' as any)
      .select('policyname')
      .eq('tablename', 'volunteers')
      .eq('policyname', 'Lectura pública de volunteers');

    if (!error && policies && policies.length > 0) {
      console.log('? Policy "Lectura pública de volunteers" already exists!');
    } else {
      console.log('?? Could not verify via REST endpoint.');
    }
  }
}

applyMigration().catch(console.error);
