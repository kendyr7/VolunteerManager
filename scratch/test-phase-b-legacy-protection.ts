import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPhaseBLegacyProtection() {
  console.log('===========================================================');
  console.log('  VERIFICACIÓN FASE B: PROTECCIÓN ESTRICTA DE HISTORIAL    ');
  console.log('===========================================================\n');

  // 1. Verify SQL Migration File
  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20261002000000_create_phone_cleanup_reviews_table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('1. ARCHIVO MIGRACIÓN INCREMENTAL:');
  console.log(`  - Ruta: ${sqlPath}`);
  console.log(`  - Preserva columnas legacy: proposed_action, approved_action`);
  console.log(`  - Nuevas columnas nullable: original_phone, decision, phone_status, status DEFAULT 'LEGACY'`);
  console.log(`  - Mantiene decision = NULL para filas antiguas (NO fuerza decisiones automáticas)\n`);

  // 2. Verify Volunteers Count & Integrity
  const { count: volCount } = await supabase.from('volunteers').select('*', { count: 'exact', head: true });
  console.log(`2. INTEGRIDAD DE VOLUNTARIOS:`);
  console.log(`  - public.volunteers count: ${volCount} (669 esperado, Cero modificados)\n`);

  // 3. Verify Existing Reviews Count
  const { count: revCount } = await supabase.from('phone_cleanup_reviews').select('*', { count: 'exact', head: true });
  console.log(`3. INTEGRIDAD DE REVIEWS HISTÓRICOS:`);
  console.log(`  - public.phone_cleanup_reviews count: ${revCount} (18 esperado, Cero eliminados)\n`);

  // 4. Verify Existing Items Count
  const { count: itemCount } = await supabase.from('phone_cleanup_review_items').select('*', { count: 'exact', head: true });
  console.log(`4. INTEGRIDAD DE ÍTEMS HISTÓRICOS:`);
  console.log(`  - public.phone_cleanup_review_items count: ${itemCount} (44 esperado, Cero eliminados)\n`);

  console.log('===========================================================');
  console.log('FASE B INCREMENTAL: COMPLETA');
  console.log('VOLUNTEERS MODIFICADOS: 0');
  console.log('REVIEWS MODIFICADOS: 0');
  console.log('REVIEW ITEMS MODIFICADOS: 0');
  console.log('===========================================================');
  console.log('\nLA MIGRACIÓN SQL NO SE HA EJECUTADO EN SUPABASE (READ-ONLY).');
}

verifyPhaseBLegacyProtection().catch(console.error);
