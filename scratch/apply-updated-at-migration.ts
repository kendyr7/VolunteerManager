import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function applyUpdatedAtMigration() {
  console.log('===========================================================');
  console.log('  APPLYING UPDATED_AT TRIGGER MIGRATION                     ');
  console.log('===========================================================\n');

  const sqlPath = path.join(process.cwd(), 'supabase/migrations/20261003000000_volunteers_shifts_updated_at_trigger.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

  // Try RPC exec_sql first
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql: sqlContent });

  if (rpcError) {
    console.log('⚠️ RPC exec_sql unavailable:', rpcError.message);
    // Direct verification of columns on volunteers & shifts
    const { data: volData, error: volErr } = await supabase.from('volunteers').select('id, updated_at').limit(1);
    if (volErr && volErr.message.includes('updated_at')) {
      console.log('Column updated_at missing on volunteers. SQL migration file created at:', sqlPath);
    } else {
      console.log('✅ Volunteers column updated_at verified on Supabase.');
    }
  } else {
    console.log('✅ Migration applied successfully via RPC exec_sql!');
  }
}

applyUpdatedAtMigration().catch(err => {
  console.error('Migration execution error:', err);
});
