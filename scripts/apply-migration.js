#!/usr/bin/env node
// Run: node scripts/apply-migration.js
// Applies the committee_shift_requirements migration to Supabase

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS public.committee_shift_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  shift_key    text NOT NULL CHECK (shift_key IN ('T1','T2','T3','T4')),
  required     integer NOT NULL DEFAULT 4 CHECK (required >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committee_shift_requirements_unique UNIQUE (committee_id, shift_key)
);

CREATE INDEX IF NOT EXISTS idx_csr_committee_id
  ON public.committee_shift_requirements (committee_id);

ALTER TABLE public.committee_shift_requirements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'committee_shift_requirements' AND policyname = 'Requirements readable by all'
  ) THEN
    CREATE POLICY "Requirements readable by all"
      ON public.committee_shift_requirements FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'committee_shift_requirements' AND policyname = 'Requirements writable by all'
  ) THEN
    CREATE POLICY "Requirements writable by all"
      ON public.committee_shift_requirements FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function run() {
  console.log('🔧 Applying migration: committee_shift_requirements...');
  
  // Use the REST admin endpoint to execute raw SQL
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  
  // Execute via Supabase's pg SQL proxy (requires service role)
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
    // Fallback: test by inserting a dummy record - if table doesn't exist this will fail
    console.log('⚠️  exec_sql RPC not available. Testing if table already exists...');
    const { data, error } = await supabase.from('committee_shift_requirements').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.error('❌ Table does not exist and cannot create it via REST API.');
      console.log('');
      console.log('📋 Please run the following SQL in your Supabase SQL Editor:');
      console.log('   https://supabase.com/dashboard/project/tjcrgohdkntkixirhilo/sql');
      console.log('');
      console.log(SQL);
    } else if (!error) {
      console.log('✅ Table committee_shift_requirements already exists!');
    } else {
      console.error('❌ Unexpected error:', error);
    }
  } else {
    console.log('✅ Migration applied successfully!');
  }
}

run().catch(console.error);
