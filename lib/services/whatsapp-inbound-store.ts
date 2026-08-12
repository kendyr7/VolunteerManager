import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 5 * 60 * 1000;

type InboundEventRow = {
  id: string;
  wamid: string;
  status: 'queued' | 'processing' | 'processed' | 'failed' | 'exhausted';
  attempt_count: number;
  processing_started_at: string | null;
  next_retry_at: string;
};

export class WhatsAppInboxTableMissingError extends Error {
  constructor() {
    super('The whatsapp_inbound_events table has not been migrated yet.');
    this.name = 'WhatsAppInboxTableMissingError';
  }
}

export type ClaimInboundEventResult =
  | { state: 'claimed'; eventId: string; attemptCount: number }
  | { state: 'processed'; eventId: string }
  | { state: 'busy'; eventId: string }
  | { state: 'retry_later'; eventId: string }
  | { state: 'exhausted'; eventId: string };

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(15 * (2 ** Math.max(attemptCount - 1, 0)), 15 * 60);
}

function isMissingInboxTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || Boolean(
      error.message?.includes('whatsapp_inbound_events')
      && /schema cache|does not exist|could not find/i.test(error.message),
    );
}

async function fetchEvent(supabase: SupabaseClient, wamid: string): Promise<InboundEventRow> {
  const { data, error } = await supabase
    .from('whatsapp_inbound_events')
    .select('id, wamid, status, attempt_count, processing_started_at, next_retry_at')
    .eq('wamid', wamid)
    .single();

  if (error || !data) {
    if (error && isMissingInboxTable(error)) throw new WhatsAppInboxTableMissingError();
    throw new Error(`Unable to read WhatsApp inbox event: ${error?.message || 'not found'}`);
  }
  return data as InboundEventRow;
}

export async function claimInboundEvent(
  supabase: SupabaseClient,
  input: {
    wamid: string;
    senderPhone: string;
    messageType: string;
    payload: unknown;
  }
): Promise<ClaimInboundEventResult> {
  const now = new Date();
  const { data: inserted, error: insertError } = await supabase
    .from('whatsapp_inbound_events')
    .insert({
      wamid: input.wamid,
      sender_phone: input.senderPhone,
      message_type: input.messageType,
      payload: input.payload,
      status: 'queued',
      next_retry_at: now.toISOString(),
    })
    .select('id, wamid, status, attempt_count, processing_started_at, next_retry_at')
    .maybeSingle();

  if (insertError && insertError.code !== '23505') {
    if (isMissingInboxTable(insertError)) throw new WhatsAppInboxTableMissingError();
    throw new Error(`Unable to persist WhatsApp inbox event: ${insertError.message}`);
  }

  let event = inserted as InboundEventRow | null;
  if (!event) event = await fetchEvent(supabase, input.wamid);

  if (event.status === 'processed') return { state: 'processed', eventId: event.id };
  if (event.status === 'exhausted' || event.attempt_count >= MAX_ATTEMPTS) {
    if (event.status !== 'exhausted') {
      await supabase
        .from('whatsapp_inbound_events')
        .update({ status: 'exhausted', updated_at: now.toISOString() })
        .eq('id', event.id);
    }
    return { state: 'exhausted', eventId: event.id };
  }

  if (event.status === 'processing') {
    const startedAt = event.processing_started_at
      ? new Date(event.processing_started_at).getTime()
      : 0;
    const isStale = startedAt === 0 || now.getTime() - startedAt >= STALE_PROCESSING_MS;
    if (!isStale) return { state: 'busy', eventId: event.id };

    const { data: released } = await supabase
      .from('whatsapp_inbound_events')
      .update({
        status: 'failed',
        last_error: 'Recovered stale processing lease',
        next_retry_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', event.id)
      .eq('status', 'processing')
      .eq('attempt_count', event.attempt_count)
      .select('id')
      .maybeSingle();

    if (!released) return { state: 'busy', eventId: event.id };
    event = { ...event, status: 'failed', next_retry_at: now.toISOString() };
  }

  if (event.status === 'failed' && new Date(event.next_retry_at).getTime() > now.getTime()) {
    return { state: 'retry_later', eventId: event.id };
  }

  const nextAttempt = event.attempt_count + 1;
  const { data: claimed, error: claimError } = await supabase
    .from('whatsapp_inbound_events')
    .update({
      status: 'processing',
      attempt_count: nextAttempt,
      processing_started_at: now.toISOString(),
      last_error: null,
      updated_at: now.toISOString(),
    })
    .eq('id', event.id)
    .in('status', ['queued', 'failed'])
    .eq('attempt_count', event.attempt_count)
    .select('id')
    .maybeSingle();

  if (claimError) throw new Error(`Unable to claim WhatsApp inbox event: ${claimError.message}`);
  if (!claimed) return { state: 'busy', eventId: event.id };

  return { state: 'claimed', eventId: event.id, attemptCount: nextAttempt };
}

export async function markInboundEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  responseStatus: number
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('whatsapp_inbound_events')
    .update({
      status: 'processed',
      processed_at: now,
      processing_started_at: null,
      response_status: responseStatus,
      last_error: null,
      updated_at: now,
    })
    .eq('id', eventId)
    .eq('status', 'processing');

  if (error) throw new Error(`Unable to complete WhatsApp inbox event: ${error.message}`);
}

export async function markInboundEventFailed(
  supabase: SupabaseClient,
  eventId: string,
  attemptCount: number,
  errorMessage: string,
  responseStatus?: number
): Promise<void> {
  const now = new Date();
  const exhausted = attemptCount >= MAX_ATTEMPTS;
  const nextRetry = new Date(now.getTime() + retryDelaySeconds(attemptCount) * 1000);
  const { error } = await supabase
    .from('whatsapp_inbound_events')
    .update({
      status: exhausted ? 'exhausted' : 'failed',
      processing_started_at: null,
      next_retry_at: nextRetry.toISOString(),
      last_error: errorMessage.slice(0, 2000),
      response_status: responseStatus || null,
      updated_at: now.toISOString(),
    })
    .eq('id', eventId)
    .eq('status', 'processing');

  if (error) throw new Error(`Unable to fail WhatsApp inbox event: ${error.message}`);
}
