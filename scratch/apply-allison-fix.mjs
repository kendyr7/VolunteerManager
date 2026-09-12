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

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const sessionId = '63a064f8-2c00-4f70-b2cc-3e8693f82d01';
  const volunteerId = '4799dfcd-04b0-4edc-9401-98d7949a3956';
  
  // 8:00 AM local (UTC-6) -> 14:00:00 UTC on Sept 11, 2026
  const newStartedAt = '2026-09-11T14:00:00.000+00:00';
  // 9:00 PM local (UTC-6) -> 03:00:00 UTC on Sept 12, 2026
  const newEndedAt = '2026-09-12T03:00:00.000+00:00';

  console.log('=== 1. FETCHING CURRENT SESSION ===');
  const { data: currentSession, error: fetchErr } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !currentSession) {
    console.error('Error fetching session:', fetchErr);
    process.exit(1);
  }

  console.log('Current session in DB:', currentSession);
  const previousStartedAt = currentSession.started_at;
  const previousEndedAt = currentSession.ended_at;

  console.log('\n=== 2. UPDATING SESSION IN DATABASE ===');
  const { data: updatedSession, error: updateErr } = await supabase
    .from('attendance_sessions')
    .update({
      started_at: newStartedAt,
      ended_at: newEndedAt,
      status: 'completed',
      auto_closed: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('Error updating session:', updateErr);
    process.exit(1);
  }

  console.log('Updated session in DB:', updatedSession);
  console.log(`Local start: ${new Date(updatedSession.started_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })}`);
  console.log(`Local end:   ${new Date(updatedSession.ended_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala', hour12: true })}`);

  console.log('\n=== 3. INSERTING AUDIT LOG ===');
  const { data: logData, error: logErr } = await supabase
    .from('activity_logs')
    .insert({
      user_name: 'Administrador',
      user_role: 'Administrador',
      action_type: 'Corrección Horario Asistencia',
      description: 'Corrigió horario de Allison Jazmín Salinas Reyes (vie 11): Entrada 8:00 AM, Salida 9:00 PM (4 turnos completados)',
      details: JSON.stringify({
        sessionId,
        volunteerId,
        previousStartedAt,
        newStartedAt,
        previousEndedAt,
        newEndedAt,
        reason: 'Corrección de entrada tardía de 7:40 PM a 8:00 AM y salida a las 9:00 PM cubriendo los 4 turnos (T1, T2, T3, T4)',
        correctionType: 'manual_adjustment'
      }),
      target_id: volunteerId
    })
    .select('*')
    .single();

  if (logErr) {
    console.warn('Warning: Log insertion error:', logErr);
  } else {
    console.log('Audit log inserted:', logData.id);
  }

  console.log('\n=== 4. BROADCASTING REALTIME UPDATE ===');
  try {
    const channel = supabase.channel('global_coordinator_realtime');
    await channel.send({
      type: 'broadcast',
      event: 'session_sync',
      payload: {
        eventType: 'UPDATE',
        table: 'attendance_sessions',
        record: updatedSession
      }
    });
    console.log('Broadcast sent successfully.');
  } catch (e) {
    console.warn('Broadcast error (non-fatal):', e);
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
