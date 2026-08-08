import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('--- APPLYING SQL MIGRATION FOR PHONE CLEANUP REVIEWS ---');
  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20261002000000_create_phone_cleanup_reviews_table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Test executing SQL statements via RPC or pg query if available
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (!error) {
      console.log('✅ Migration applied successfully via exec_sql!');
      return;
    }
    console.log('exec_sql RPC not found or failed:', error.message);
  } catch (e: any) {
    console.log('exec_sql RPC exception:', e.message);
  }
}

applyMigration().catch(console.error);
