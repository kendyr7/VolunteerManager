import type { SupabaseClient } from '@supabase/supabase-js';

const SUPPORTED_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

export type MetaWhatsAppStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{
    code?: number | string;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
  conversation?: unknown;
  pricing?: unknown;
  [key: string]: unknown;
};

export type PersistWhatsAppStatusResult =
  | { state: 'updated'; wamid: string; status: string }
  | { state: 'unmatched'; wamid: string; status: string }
  | { state: 'ignored' };

function statusTimestamp(value?: string): string {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

export async function persistWhatsAppMessageStatus(
  supabase: SupabaseClient,
  event: MetaWhatsAppStatus,
): Promise<PersistWhatsAppStatusResult> {
  const wamid = typeof event.id === 'string' ? event.id : '';
  const status = typeof event.status === 'string' ? event.status : '';
  if (!wamid || !SUPPORTED_STATUSES.has(status)) return { state: 'ignored' };

  const eventTimestamp = statusTimestamp(event.timestamp);
  const error = event.errors?.[0];
  const { error: insertError } = await supabase
    .from('whatsapp_message_status_events')
    .upsert({
      wamid,
      status,
      status_timestamp: eventTimestamp,
      recipient_id: event.recipient_id || null,
      error_code: error?.code != null ? String(error.code) : null,
      error_title: error?.title || null,
      error_message: error?.message || null,
      error_details: error?.error_data?.details || null,
      conversation: event.conversation || null,
      pricing: event.pricing || null,
      payload: event,
    }, {
      onConflict: 'wamid,status,status_timestamp',
      ignoreDuplicates: true,
    });

  if (insertError) {
    throw new Error(`Unable to persist WhatsApp message status: ${insertError.message}`);
  }

  const { data: statusEvents, error: latestError } = await supabase
    .from('whatsapp_message_status_events')
    .select('status, status_timestamp, error_code, error_title, error_message, error_details')
    .eq('wamid', wamid)
    .order('status_timestamp', { ascending: false })
    .order('received_at', { ascending: false });

  const latest = statusEvents?.[0];

  if (latestError || !latest) {
    throw new Error(`Unable to resolve latest WhatsApp message status: ${latestError?.message || 'not found'}`);
  }

  const update: Record<string, unknown> = {
    delivery_status: latest.status,
    delivery_updated_at: latest.status_timestamp,
  };
  const deliveredEvent = statusEvents.find(item => item.status === 'delivered');
  const readEvent = statusEvents.find(item => item.status === 'read');

  const { data: matchingReminders, error: matchingError } = await supabase
    .from('reminder_logs')
    .select('id, delivered_at')
    .eq('whatsapp_message_id', wamid);

  if (matchingError) {
    throw new Error(`Unable to find the WhatsApp reminder: ${matchingError.message}`);
  }

  if (!matchingReminders?.length) {
    return { state: 'unmatched', wamid, status: latest.status };
  }

  if (deliveredEvent) {
    update.delivered_at = deliveredEvent.status_timestamp;
  } else if (readEvent) {
    update.delivered_at = matchingReminders[0].delivered_at || readEvent.status_timestamp;
  }
  if (readEvent) update.read_at = readEvent.status_timestamp;

  if (latest.status === 'failed') {
    update.failed_at = latest.status_timestamp;
    update.delivery_error_code = latest.error_code;
    update.delivery_error_title = latest.error_title;
    update.delivery_error_message = latest.error_message;
    update.delivery_error_details = latest.error_details;
  }

  if (latest.status !== 'failed') {
    update.failed_at = null;
    update.delivery_error_code = null;
    update.delivery_error_title = null;
    update.delivery_error_message = null;
    update.delivery_error_details = null;
  }

  const { error: reminderError } = await supabase
    .from('reminder_logs')
    .update(update)
    .eq('whatsapp_message_id', wamid);

  if (reminderError) {
    throw new Error(`Unable to update WhatsApp reminder delivery status: ${reminderError.message}`);
  }

  return { state: 'updated', wamid, status: latest.status };
}
