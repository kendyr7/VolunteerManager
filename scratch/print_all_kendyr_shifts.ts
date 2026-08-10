import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceKey);

async function printShifts() {
  const kendyrId = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';
  const { data: shifts } = await adminClient
    .from('shifts')
    .select('id, day_key, shift_key, checked_in, checked_in_at, checked_in_by, checked_out, checked_out_at, created_at, updated_at')
    .eq('volunteer_id', kendyrId);

  console.log('--- TODOS LOS 26 SHIFTS DE KENDYR ---');
  (shifts || []).forEach((s, idx) => {
    let category = 'A. Solo Asignado';
    if (s.checked_in && s.checked_out) category = 'C. Completado';
    else if (s.checked_in && !s.checked_out) category = 'B. Check-in Activo';
    else if (!s.checked_in && s.checked_out) category = 'D. Inconsistente (checked_out sin checked_in)';
    else if (s.checked_in && !s.checked_in_at) category = 'D. Inconsistente (checked_in sin timestamp)';

    console.log(`${idx + 1}. [${s.day_key} ${s.shift_key}] ID: ${s.id} | Cat: ${category} | In: ${s.checked_in} (${s.checked_in_at || 'null'}) | Out: ${s.checked_out} (${s.checked_out_at || 'null'})`);
  });
}

printShifts().catch(console.error);
