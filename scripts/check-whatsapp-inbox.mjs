import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

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
  throw new Error('Faltan variables de Supabase para comprobar la bandeja de WhatsApp.');
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const testWamid = `wamid.codex.inbox-check.${Date.now()}`;

try {
  const { data: inserted, error: insertError } = await admin
    .from('whatsapp_inbound_events')
    .insert({
      wamid: testWamid,
      sender_phone: '00000000000',
      message_type: 'test',
      payload: { test: true },
    })
    .select('id, status, attempt_count')
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo insertar el evento temporal: ${insertError?.message || 'sin datos'}`);
  }

  const { error: duplicateError } = await admin.from('whatsapp_inbound_events').insert({
    wamid: testWamid,
    sender_phone: '00000000000',
    message_type: 'test',
    payload: { duplicate: true },
  });
  if (duplicateError?.code !== '23505') {
    throw new Error('La restricción única de wamid no rechazó el evento duplicado.');
  }

  const startedAt = new Date().toISOString();
  const { error: processingError } = await admin
    .from('whatsapp_inbound_events')
    .update({ status: 'processing', attempt_count: 1, processing_started_at: startedAt })
    .eq('id', inserted.id);
  if (processingError) throw new Error(`No se pudo reclamar el evento: ${processingError.message}`);

  const { data: completed, error: completedError } = await admin
    .from('whatsapp_inbound_events')
    .update({
      status: 'processed',
      processing_started_at: null,
      processed_at: new Date().toISOString(),
      response_status: 200,
    })
    .eq('id', inserted.id)
    .select('status, attempt_count, response_status')
    .single();
  if (completedError || completed?.status !== 'processed' || completed.attempt_count !== 1) {
    throw new Error(`El ciclo de procesamiento no terminó correctamente: ${completedError?.message || 'estado inválido'}`);
  }

  const { data: anonymousRows, error: anonymousError } = await anonymous
    .from('whatsapp_inbound_events')
    .select('id')
    .limit(1);
  if (!anonymousError || anonymousRows?.length) {
    throw new Error('La tabla permite lectura anónima y debe permanecer privada.');
  }

  console.log('Bandeja de WhatsApp verificada: esquema, wamid único, estados y acceso privado correctos.');
} finally {
  const { error: cleanupError } = await admin
    .from('whatsapp_inbound_events')
    .delete()
    .eq('wamid', testWamid);
  if (cleanupError) {
    console.error(`No se pudo eliminar el evento temporal ${testWamid}: ${cleanupError.message}`);
    process.exitCode = 1;
  }
}
