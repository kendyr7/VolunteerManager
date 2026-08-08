import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhaseAAudit() {
  console.log('===========================================================');
  console.log('  FASE A: AUDITORÍA DE LECTURA DE CÓDIGO Y SUPABASE DB    ');
  console.log('===========================================================\n');

  // 1. Total volunteers count
  const { count: volCount, error: volErr } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true });

  if (volErr) {
    console.error('❌ Error querying volunteers count:', volErr.message);
  } else {
    console.log(`1. Count in public.volunteers: ${volCount} (Esperado: 668)`);
  }

  // 2. Check phone_normalized values
  const { count: normCount } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true })
    .not('phone_normalized', 'is', null);

  console.log(`2. Volunteers with phone_normalized NOT NULL: ${normCount} (Esperado: 0)`);

  // 3. Check is_shared_phone values
  const { count: sharedCount } = await supabase
    .from('volunteers')
    .select('*', { count: 'exact', head: true })
    .eq('is_shared_phone', true);

  console.log(`3. Volunteers with is_shared_phone = true: ${sharedCount} (Esperado: 0)`);

  // 4. Check if phone_cleanup_reviews table exists
  const { data: revData, error: revErr } = await supabase
    .from('phone_cleanup_reviews')
    .select('*')
    .limit(1);

  if (revErr) {
    console.log('4. Tabla public.phone_cleanup_reviews: NO EXISTE en Supabase (Error:', revErr.message, ')');
  } else {
    console.log('4. Tabla public.phone_cleanup_reviews: EXISTE en Supabase (Filas:', revData.length, ')');
  }

  // 5. Check if phone_cleanup_review_items table exists
  const { data: itemData, error: itemErr } = await supabase
    .from('phone_cleanup_review_items')
    .select('*')
    .limit(1);

  if (itemErr) {
    console.log('5. Tabla public.phone_cleanup_review_items: NO EXISTE en Supabase (Error:', itemErr.message, ')');
  } else {
    console.log('5. Tabla public.phone_cleanup_review_items: EXISTE en Supabase (Filas:', itemData.length, ')');
  }

  // 6. Check activity_logs table
  const { count: actCount, error: actErr } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true });

  if (actErr) {
    console.log('6. Tabla public.activity_logs: Error (', actErr.message, ')');
  } else {
    console.log(`6. Tabla public.activity_logs: EXISTE en Supabase (${actCount} registros)`);
  }

  console.log('\n===========================================================');
  console.log('  FIN DE AUDITORÍA FASE A. CERO MODIFICACIONES REALIZADAS.');
  console.log('===========================================================');
}

runPhaseAAudit().catch(console.error);
