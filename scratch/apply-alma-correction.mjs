import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function correctAlmaSession() {
  const sessionId = '49816226-b787-4085-9329-06ec0e0d913e';
  const volunteerId = '0ca862e2-c950-42e0-b48d-efc54402a514';

  console.log('--- FETCHING CURRENT SESSION ---');
  const { data: session, error: sErr } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sErr || !session) {
    console.error('Error fetching session:', sErr);
    return;
  }
  console.log('Current session:', session);

  const previousStartedAt = session.started_at;
  // 6:30 AM Guatemala time on Sept 10, 2026 -> 12:30 UTC
  const newStartedAt = '2026-09-10T12:30:00.000Z';

  console.log(`\nUpdating started_at from ${previousStartedAt} to ${newStartedAt}...`);
  const { data: updated, error: uErr } = await supabase
    .from('attendance_sessions')
    .update({
      started_at: newStartedAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (uErr) {
    console.error('Error updating session:', uErr);
    return;
  }
  console.log('Updated session successfully:', updated);

  // Insert activity log
  const { error: logErr } = await supabase.from('activity_logs').insert({
    user_name: 'Kendyr Gabriel Quintanilla  Estrada',
    user_role: 'Administrador',
    action_type: 'Corrección Entrada Olvidada',
    description: 'Corrigió horario de sesión de asistencia (forgotten_entry_late_scan)',
    details: JSON.stringify({
      sessionId: updated.id,
      volunteerId: updated.volunteer_id,
      previousStartedAt,
      newStartedAt: updated.started_at,
      previousEndedAt: updated.ended_at,
      newEndedAt: updated.ended_at,
      originalLateScanAt: previousStartedAt,
      reason: 'Corrección autorizada: la voluntaria ingresó a las 6:30 AM',
      correctionType: 'forgotten_entry_late_scan',
      adminName: 'Kendyr Gabriel Quintanilla  Estrada'
    }),
    target_id: volunteerId
  });

  if (logErr) {
    console.error('Error writing activity log:', logErr);
  } else {
    console.log('Activity log inserted successfully.');
  }
}

correctAlmaSession().catch(console.error);
