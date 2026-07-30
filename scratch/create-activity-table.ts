import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log("=== CREATING ACTIVITY_LOGS TABLE VIA SQL EXEC ===");
  const sql = `
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name   text NOT NULL DEFAULT 'Sistema',
  user_role   text NOT NULL DEFAULT 'Admin',
  action_type text NOT NULL,
  description text NOT NULL,
  details     text,
  target_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity logs readable by all authenticated users" ON public.activity_logs;
CREATE POLICY "Activity logs readable by all authenticated users" ON public.activity_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Activity logs writable by all authenticated users" ON public.activity_logs;
CREATE POLICY "Activity logs writable by all authenticated users" ON public.activity_logs FOR INSERT WITH CHECK (true);
  `;

  // Try calling rpc execute_sql or query
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log("RPC exec_sql result:", { data, error });
}

main();
