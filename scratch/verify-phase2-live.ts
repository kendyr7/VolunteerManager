import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getLocal8Digits } from '../lib/whatsapp';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhase2Live() {
  console.log('===========================================================');
  console.log('  VERIFYING FASE 2 LIVE SUPABASE DATABASE SCHEMA           ');
  console.log('===========================================================\n');

  // 1. Columns & Data types check via sample query
  const { data: sampleRow, error: sampleErr } = await supabase
    .from('volunteers')
    .select('id, phone_normalized, is_shared_phone, shared_phone_owner_id, shared_phone_reason, shared_phone_authorized_by, shared_phone_authorized_at')
    .limit(1);

  if (sampleErr) {
    console.error('❌ Schema inspection failed:', sampleErr.message);
    return;
  }

  console.log('✅ Columns verified in volunteers table!');

  // 2. Existing data count queries (Read-Only)
  const { count: totalVolunteers } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  const { count: countPhoneNorm } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).not('phone_normalized', 'is', null);
  const { count: countSharedTrue } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', true);
  const { count: countSharedFalse } = await supabase.from('volunteers').select('*', { count: 'exact', head: true }).eq('is_shared_phone', false);

  console.log('\n--- EXISTING DATA METRICS ---');
  console.log(`Total Volunteers in DB: ${totalVolunteers}`);
  console.log(`phone_normalized IS NOT NULL: ${countPhoneNorm || 0}`);
  console.log(`is_shared_phone = true: ${countSharedTrue || 0}`);
  console.log(`is_shared_phone = false: ${countSharedFalse || 0}`);

  // 3. Diagnostic of current duplicate groups in phone field (Read-Only)
  console.log('\n--- DIAGNOSTIC OF EXISTING PHONE DUPLICATES ---');
  const { data: allVols } = await supabase.from('volunteers').select('id, first_name, last_name, phone, status');
  
  const phoneGroups = new Map<string, Array<any>>();
  (allVols || []).forEach(v => {
    if (!v.phone) return;
    const local8 = getLocal8Digits(v.phone);
    if (local8.length !== 8) return;
    const list = phoneGroups.get(local8) || [];
    list.push(v);
    phoneGroups.set(local8, list);
  });

  let duplicateGroupsCount = 0;
  let activeActiveGroupsCount = 0;

  phoneGroups.forEach((vols, local8) => {
    if (vols.length > 1) {
      duplicateGroupsCount++;
      const activeVols = vols.filter(v => v.status === 'active');
      if (activeVols.length > 1) {
        activeActiveGroupsCount++;
      }
    }
  });

  console.log(`Total Normalized Phone Duplicate Groups: ${duplicateGroupsCount}`);
  console.log(`Active + Active Duplicate Groups (Pending Phase 3): ${activeActiveGroupsCount}`);
}

verifyPhase2Live().catch(console.error);
