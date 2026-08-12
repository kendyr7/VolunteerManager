import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const statusStoreModule = '../lib/services/whatsapp-status-store' + '.ts';
const { persistWhatsAppMessageStatus } = await import(statusStoreModule);

function loadLocalEnvironment() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !anonKey) {
  throw new Error('Faltan variables de Supabase para comprobar los estados de WhatsApp.');
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const testWamid = `wamid.codex.delivery-check.${Date.now()}`;
const baseTimestamp = Math.floor(Date.now() / 1000) - 60;
let reminderId: string | null = null;

try {
  const { data: volunteer, error: volunteerError } = await admin
    .from('volunteers')
    .select('id')
    .or('status.is.null,status.neq.archived')
    .limit(1)
    .single();
  if (volunteerError || !volunteer) {
    throw new Error(`No se encontró un voluntario para la prueba: ${volunteerError?.message || 'sin datos'}`);
  }

  const earlyStatus = await persistWhatsAppMessageStatus(admin, {
    id: testWamid,
    status: 'sent',
    timestamp: String(baseTimestamp),
    recipient_id: '00000000000',
  });
  if (earlyStatus.state !== 'unmatched') {
    throw new Error('El estado temprano no quedó preservado como evento sin recordatorio.');
  }

  const { data: reminder, error: reminderError } = await admin
    .from('reminder_logs')
    .insert({
      volunteer_id: volunteer.id,
      shift_key: 'T1',
      day_key: 'Prueba Codex',
      whatsapp_message_id: testWamid,
      status: 'contactado',
      delivery_status: 'pending',
    })
    .select('id, delivery_status')
    .single();
  if (reminderError || !reminder) {
    throw new Error(`No se pudo crear el recordatorio temporal: ${reminderError?.message || 'sin datos'}`);
  }
  reminderId = reminder.id;
  if (reminder.delivery_status !== 'sent') {
    throw new Error('El trigger no aplicó el estado que llegó antes del recordatorio.');
  }

  await persistWhatsAppMessageStatus(admin, {
    id: testWamid,
    status: 'read',
    timestamp: String(baseTimestamp + 20),
    recipient_id: '00000000000',
  });
  await persistWhatsAppMessageStatus(admin, {
    id: testWamid,
    status: 'delivered',
    timestamp: String(baseTimestamp + 10),
    recipient_id: '00000000000',
  });
  await persistWhatsAppMessageStatus(admin, {
    id: testWamid,
    status: 'read',
    timestamp: String(baseTimestamp + 20),
    recipient_id: '00000000000',
  });

  const [{ data: finalReminder, error: finalError }, { count: eventCount, error: countError }] = await Promise.all([
    admin
      .from('reminder_logs')
      .select('delivery_status, delivered_at, read_at')
      .eq('id', reminderId)
      .single(),
    admin
      .from('whatsapp_message_status_events')
      .select('id', { count: 'exact', head: true })
      .eq('wamid', testWamid),
  ]);

  if (finalError || !finalReminder || countError) {
    throw new Error(`No se pudo verificar el resultado: ${finalError?.message || countError?.message || 'sin datos'}`);
  }
  if (finalReminder.delivery_status !== 'read') {
    throw new Error('Un evento entregado tardío hizo retroceder el estado leído.');
  }
  if (!finalReminder.delivered_at || !finalReminder.read_at) {
    throw new Error('No se conservaron las marcas de entrega y lectura.');
  }
  if (eventCount !== 3) {
    throw new Error(`La deduplicación de estados esperaba 3 eventos y encontró ${eventCount}.`);
  }

  const { data: anonymousRows, error: anonymousError } = await anonymous
    .from('whatsapp_message_status_events')
    .select('id')
    .limit(1);
  if (!anonymousError || Boolean((anonymousRows as unknown[] | null)?.length)) {
    throw new Error('Los eventos de estado permiten lectura anónima y deben permanecer privados.');
  }

  const { data: anonymousReminderRows, error: anonymousReminderError } = await anonymous
    .from('reminder_logs')
    .select('id')
    .limit(1);
  if (!anonymousReminderError || Boolean((anonymousReminderRows as unknown[] | null)?.length)) {
    throw new Error('Los diagnósticos de recordatorios permiten lectura anónima y deben permanecer privados.');
  }

  console.log('Estados de WhatsApp verificados: evento temprano, orden por timestamp, deduplicación y diagnósticos privados correctos.');
} finally {
  if (reminderId) {
    const { error } = await admin.from('reminder_logs').delete().eq('id', reminderId);
    if (error) console.error(`No se pudo eliminar el recordatorio temporal: ${error.message}`);
  }
  const { error } = await admin.from('whatsapp_message_status_events').delete().eq('wamid', testWamid);
  if (error) {
    console.error(`No se pudieron eliminar los estados temporales: ${error.message}`);
    process.exitCode = 1;
  }
}
