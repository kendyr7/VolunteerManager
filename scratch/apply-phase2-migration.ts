import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function applyPhase2Migration() {
  console.log('===========================================================');
  console.log('  APPLYING FASE 2: PHONE IDENTITY MODEL MIGRATION          ');
  console.log('===========================================================\n');

  const sqlPath = path.join(process.cwd(), 'supabase/migrations/20261001000000_phase2_phone_identity_model.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

  // Try RPC exec_sql first
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql: sqlContent });
  
  if (rpcError) {
    console.log('⚠️ RPC exec_sql failed or not available:', rpcError.message);
    console.log('Executing via REST SQL endpoint...');

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ sql: sqlContent }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('❌ REST exec_sql endpoint error:', res.status, errText);
    } else {
      console.log('✅ REST exec_sql migration executed successfully!');
    }
  } else {
    console.log('✅ RPC exec_sql migration executed successfully!');
  }

  // Verify resulting schema columns in volunteers table
  console.log('\n--- VERIFYING PHASE 2 COLUMNS IN VOLUNTEERS TABLE ---');
  const { data: sample, error: sampleErr } = await supabase
    .from('volunteers')
    .select('id, phone_normalized, is_shared_phone, shared_phone_owner_id, shared_phone_reason, shared_phone_authorized_by, shared_phone_authorized_at')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Column verification failed:', sampleErr.message);
  } else {
    console.log('✅ All Phase 2 columns verified in Supabase volunteers table!');
  }
}

applyPhase2Migration().catch(console.error);
