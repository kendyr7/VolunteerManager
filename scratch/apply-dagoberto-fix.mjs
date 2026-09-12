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
  const sessionId = 'b8a27a24-d306-49c2-aa5e-96fbf4df19c7';
  const volunteerId = '6e83adbf-786b-4644-b348-b3cdc6289e90';
  const newStartedAt = '2026-09-10T21:00:00.000+00:00'; // 3:00 PM local (UTC-6)
  
  console.log('=== 1. VERIFYING CURRENT SESSION ===');
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
  const endedAt = currentSession.ended_at; // Unchanged: '2026-09-10T23:57:18.345+00:00'

  console.log('=== 2. UPDATING SESSION STARTED_AT ===');
  const updatedRecord = {
    ...currentSession,
    started_at: newStartedAt,
    updated_at: new Date().toISOString()
  };

  const { data: updatedSession, error: updateErr } = await supabase
    .from('attendance_sessions')
    .update({
      started_at: newStartedAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('Error updating session:', updateErr);
    process.exit(1);
  }

  console.log('Successfully updated session:', updatedSession);

  console.log('=== 3. INSERTING AUDIT LOG ===');
  const { data: logData, error: logErr } = await supabase
    .from('activity_logs')
    .insert({
      user_name: 'Administrador',
      user_role: 'Administrador',
      action_type: 'Corrección Entrada Olvidada',
      description: 'Corrigió hora de entrada de Dagoberto Santos Navarrete Mairena (jue 10): de 5:57 PM a 3:00 PM',
      details: JSON.stringify({
        sessionId,
        volunteerId,
        previousStartedAt,
        newStartedAt,
        previousEndedAt: endedAt,
        newEndedAt: endedAt,
        reason: 'Ajuste de hora de entrada a las 3:00 PM según solicitud (hora de salida correcta a las 5:57 PM)',
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

  console.log('=== 4. BROADCASTING REALTIME UPDATE ===');
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

  console.log('=== ALL STEPS COMPLETED SUCCESSFULLY ===');
}

main().catch(console.error);
