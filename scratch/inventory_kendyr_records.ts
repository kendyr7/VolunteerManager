import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient(supabaseUrl, serviceKey);

async function runInventory() {
  console.log('===========================================================');
  console.log('  READ-ONLY INVENTORY FOR VOLUNTEER: KENDYR GABRIEL QUINTANILLA ESTRADA  ');
  console.log('===========================================================\n');

  const kendyrId = '731746a6-9a42-4ca9-9be8-30d6cc7489dc';

  // 1. Volunteer Lookup
  console.log('--- 1. CONFIRMANDO REGISTRO DEL VOLUNTARIO ---');
  const { data: volunteer, error: volErr } = await adminClient
    .from('volunteers')
    .select('id, first_name, last_name, phone, committee_id, created_at')
    .eq('id', kendyrId)
    .single();

  if (volErr) {
    console.error('❌ Error buscando voluntario:', volErr.message);
    return;
  }

  console.log('Voluntario Confirmado:', JSON.stringify(volunteer, null, 2));

  // 2. Shifts Inventory
  console.log(`\n--- 2. INVENTARIO DE SHIFTS EN BD (ID: ${kendyrId}) ---`);
  const { data: shifts, error: shiftsErr } = await adminClient
    .from('shifts')
    .select('id, day_key, shift_key, checked_in, checked_in_at, checked_in_by, checked_out, checked_out_at, created_at, updated_at')
    .eq('volunteer_id', kendyrId)
    .order('day_key', { ascending: true })
    .order('shift_key', { ascending: true });

  if (shiftsErr) {
    console.error('❌ Error buscando shifts:', shiftsErr.message);
  } else {
    console.log(`Total de turnos asignados en shifts: ${shifts?.length || 0}`);
    console.log(JSON.stringify(shifts, null, 2));

    const assignedOnly = (shifts || []).filter(s => !s.checked_in && !s.checked_out);
    const checkedInOnly = (shifts || []).filter(s => s.checked_in && !s.checked_out);
    const completed = (shifts || []).filter(s => s.checked_in && s.checked_out);
    const inconsistent = (shifts || []).filter(s => (!s.checked_in && s.checked_out) || (s.checked_in && !s.checked_in_at));

    console.log('\n--- Clasificación de Turnos ---');
    console.log(`A. Solo Asignados (Sin check-in ni check-out): ${assignedOnly.length}`);
    console.log(`B. Marcados Check-In Activo: ${checkedInOnly.length}`);
    console.log(`C. Marcados Completados / Check-Out: ${completed.length}`);
    console.log(`D. Estados Inconsistentes / Extraños: ${inconsistent.length}`);
  }

  // 3. Attendance Sessions Inventory
  console.log(`\n--- 3. ATTENDANCE_SESSIONS EN BD PARA VOLUNTARIO ---`);
  const { data: sessions, error: sessErr } = await adminClient
    .from('attendance_sessions')
    .select('*')
    .eq('volunteer_id', kendyrId);

  if (sessErr) {
    console.log('Notice attendance_sessions query:', sessErr.message);
  } else {
    console.log(`Total attendance_sessions encontradas: ${sessions?.length || 0}`);
    console.log(JSON.stringify(sessions, null, 2));
  }

  // 4. Activity Logs Inventory
  console.log(`\n--- 4. ACTIVITY_LOGS RELACIONADOS ---`);
  const { data: logs } = await adminClient
    .from('activity_logs')
    .select('*')
    .or(`target_id.eq.${kendyrId},description.ilike.%Kendyr%,details.ilike.%${kendyrId}%`)
    .order('created_at', { ascending: false });

  console.log(`Total activity_logs encontrados: ${logs?.length || 0}`);
  console.log(JSON.stringify(logs, null, 2));

  // 5. Committee lookup
  const { data: comm } = await adminClient.from('committees').select('id, name, slug').eq('id', volunteer.committee_id).maybeSingle();
  console.log('\n--- 5. COMITÉ ASIGNADO ---', comm);
}

runInventory().catch(console.error);
