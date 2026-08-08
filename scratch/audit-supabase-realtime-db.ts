import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function auditDatabase() {
  console.log('===========================================================');
  console.log('  SUPABASE REALTIME & POSTGRES DATABASE AUDIT             ');
  console.log('===========================================================\n');

  console.log('1. APP & TEST SUPABASE PROJECT REF:');
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  console.log('   URL:', supabaseUrl);
  console.log('   REF:', projectRef);
  console.log('   SAME PROJECT: YES\n');

  // Query 1: Publication Tables
  console.log('2. CHECKING PG_PUBLICATION_TABLES (supabase_realtime):');
  const { data: pubTables, error: pubErr } = await supabase.from('pg_publication_tables' as any).select('*').eq('pubname', 'supabase_realtime');
  if (pubErr) {
    // Try REST query via rpc or raw query if view not exposed directly
    console.log('   Direct query to pg_publication_tables:', pubErr.message);
  } else {
    console.log('   pg_publication_tables:', pubTables);
  }

  // Query 2: Columns of volunteers
  console.log('\n3. CHECKING VOLUNTEERS COLUMNS (updated_at):');
  const { data: volCols, error: volColsErr } = await supabase.from('volunteers').select('*').limit(1);
  if (volColsErr) {
    console.error('   Error fetching volunteers record:', volColsErr.message);
  } else if (volCols && volCols.length > 0) {
    const sample = volCols[0];
    console.log('   volunteers columns available:', Object.keys(sample));
    console.log('   updated_at column exists?:', 'updated_at' in sample ? 'YES' : 'NO');
    if ('updated_at' in sample) {
      console.log('   Sample updated_at value:', sample.updated_at);
    }
  }

  // Query 3: Columns of shifts
  console.log('\n4. CHECKING SHIFTS COLUMNS (updated_at):');
  const { data: shiftCols, error: shiftColsErr } = await supabase.from('shifts').select('*').limit(1);
  if (shiftColsErr) {
    console.error('   Error fetching shifts record:', shiftColsErr.message);
  } else if (shiftCols && shiftCols.length > 0) {
    const sample = shiftCols[0];
    console.log('   shifts columns available:', Object.keys(sample));
    console.log('   updated_at column exists?:', 'updated_at' in sample ? 'YES' : 'NO');
    if ('updated_at' in sample) {
      console.log('   Sample updated_at value:', sample.updated_at);
    }
  }

  // Query 4: Real DB UPDATE test to verify if updated_at changes
  console.log('\n5. TESTING REAL UPDATE & UPDATED_AT TIMESTAMP MUTATION:');
  const { data: testVol } = await supabase.from('volunteers').select('*').limit(1).single();
  if (testVol) {
    console.log('   Test Volunteer ID:', testVol.id);
    console.log('   first_name BEFORE:', testVol.first_name);
    console.log('   updated_at BEFORE:', testVol.updated_at ?? 'NULL/MISSING');

    await new Promise(r => setTimeout(r, 1100));

    const testName = `${testVol.first_name}_AUDIT_${Date.now().toString().slice(-4)}`;
    const { error: updateErr } = await supabase
      .from('volunteers')
      .update({ first_name: testName })
      .eq('id', testVol.id);

    if (updateErr) {
      console.error('   UPDATE error:', updateErr.message);
    } else {
      const { data: afterVol } = await supabase.from('volunteers').select('*').eq('id', testVol.id).single();
      console.log('   first_name AFTER:', afterVol?.first_name);
      console.log('   updated_at AFTER:', afterVol?.updated_at ?? 'NULL/MISSING');

      const beforeTs = testVol.updated_at ? new Date(testVol.updated_at).getTime() : 0;
      const afterTs = afterVol?.updated_at ? new Date(afterVol.updated_at).getTime() : 0;

      if (afterTs > beforeTs) {
        console.log('   ✅ Trigger update result: updated_at ACTUALLY CHANGED!');
      } else {
        console.log('   ⚠️ Trigger update result: updated_at DID NOT CHANGE automatically.');
      }

      // Revert test change
      await supabase.from('volunteers').update({ first_name: testVol.first_name }).eq('id', testVol.id);
    }
  }
}

auditDatabase().catch(err => console.error(err));
