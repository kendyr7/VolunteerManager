import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSchemaCompatibilityAudit() {
  console.log('===========================================================');
  console.log('  READ-ONLY AUDIT OF EXISTING PHONE CLEANUP SCHEMAS IN DB ');
  console.log('===========================================================\n');

  // 1 & 4. Table existence & counts
  const { data: revs, error: rErr, count: rCount } = await supabase
    .from('phone_cleanup_reviews')
    .select('*', { count: 'exact' });

  const { data: items, error: iErr, count: iCount } = await supabase
    .from('phone_cleanup_review_items')
    .select('*', { count: 'exact' });

  console.log('1. EXISTENCIA DE TABLAS:');
  console.log(`  - public.phone_cleanup_reviews: ${rErr ? 'NO EXISTE (' + rErr.message + ')' : 'EXISTE'}`);
  console.log(`  - public.phone_cleanup_review_items: ${iErr ? 'NO EXISTE (' + iErr.message + ')' : 'EXISTE'}\n`);

  console.log('4. CANTIDAD DE REGISTROS ALMACENADOS:');
  console.log(`  - public.phone_cleanup_reviews: ${rCount ?? 0} filas`);
  console.log(`  - public.phone_cleanup_review_items: ${iCount ?? 0} filas\n`);

  // 2. Sample columns inspection from existing records
  console.log('2. COLUMNAS PRESENTES EN TABLAS EXISTENTES:');
  if (revs && revs.length > 0) {
    console.log('  - Columnas en public.phone_cleanup_reviews:');
    Object.keys(revs[0]).forEach(col => console.log(`      * ${col} (ejemplo: ${JSON.stringify(revs[0][col])})`));
  }
  if (items && items.length > 0) {
    console.log('\n  - Columnas en public.phone_cleanup_review_items:');
    Object.keys(items[0]).forEach(col => console.log(`      * ${col} (ejemplo: ${JSON.stringify(items[0][col])})`));
  }

  // 5 & 6. Compatibility check with proposed FASE B migration
  console.log('\n5 & 6. ANÁLISIS DE COMPATIBILIDAD Y RIESGO DE MIGRACIÓN:');
  const proposedItemCols = ['original_phone', 'decision', 'phone_status', 'normalized_phone', 'duplicate_primary_volunteer_id', 'status'];
  const existingItemCols = items && items.length > 0 ? Object.keys(items[0]) : [];

  const missingColsInExistingDB = proposedItemCols.filter(col => !existingItemCols.includes(col));
  console.log(`  - Columnas requeridas por FASE B que NO existen en la BD actual:`, missingColsInExistingDB);

  if (existingItemCols.includes('approved_action') && !existingItemCols.includes('decision')) {
    console.log('  - La BD actual usa "approved_action" y "proposed_action", mientras que FASE B usa "decision".');
  }

  console.log('\n===========================================================');
  console.log('  AUDITORÍA FINALIZADA. CERO ALTERACIONES REALIZADAS.');
  console.log('===========================================================');
}

runSchemaCompatibilityAudit().catch(console.error);
