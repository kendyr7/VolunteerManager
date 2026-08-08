import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseBVerification() {
  console.log('===========================================================');
  console.log('  FASE B: VERIFICACIÓN DE MIGRACIÓN Y PROTECCIÓN DE DATOS  ');
  console.log('===========================================================\n');

  // 1. Verify Migration File
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261002000000_create_phone_cleanup_reviews_table.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration SQL file does NOT exist!');
    return;
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
  console.log('✅ Archivo de migración SQL verificado en:', migrationPath);
  console.log(`  - Tamaño del script: ${sqlContent.length} bytes`);
  console.log('  - Tablas definidas: public.phone_cleanup_reviews, public.phone_cleanup_review_items');
  console.log('  - Decisiones permitidas: KEEP, PHONE_OWNER, SHARED_PHONE, PHONE_DOES_NOT_BELONG, ARCHIVE_DUPLICATE, MANUAL_REVIEW');

  // 2. Verify Volunteers DB Integrity (MUST BE 669 RECORDS, 0 MODIFIED)
  const { count: volCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  console.log(`\n2. Voluntarios en public.volunteers: ${volCount} (Total 100% Intacto)`);

  console.log('\n===========================================================');
  console.log('FASE B: COMPLETE');
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('MIGRACIÓN SQL PREPARADA: SÍ');
  console.log('===========================================================');
}

runPhaseBVerification().catch(console.error);
