import type { SupabaseClient } from '@supabase/supabase-js';

export const WHATSAPP_CONVERSATION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

type ConversationRow = {
  sender_phone: string;
  status: 'open' | 'closed';
  opened_at: string;
  expires_at: string;
};

export type WhatsAppConversationTouchState = 'started' | 'continued' | 'restarted';

function normalizeSenderPhone(senderPhone: string): string {
  return senderPhone.replace(/\D/g, '');
}

export async function touchWhatsAppConversation(
  supabase: SupabaseClient,
  senderPhone: string,
  now = new Date(),
): Promise<WhatsAppConversationTouchState> {
  const normalizedPhone = normalizeSenderPhone(senderPhone);
  if (!normalizedPhone) throw new Error('WhatsApp sender phone is empty.');

  const { data: existing, error: lookupError } = await supabase
    .from('whatsapp_conversation_sessions')
    .select('sender_phone, status, opened_at, expires_at')
    .eq('sender_phone', normalizedPhone)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Unable to read WhatsApp conversation state: ${lookupError.message}`);
  }

  const row = existing as ConversationRow | null;
  const shouldRestart = Boolean(
    row && (row.status === 'closed' || new Date(row.expires_at).getTime() <= now.getTime()),
  );
  const nextExpiry = new Date(now.getTime() + WHATSAPP_CONVERSATION_IDLE_TIMEOUT_MS).toISOString();
  const nextValues = {
    status: 'open' as const,
    last_activity_at: now.toISOString(),
    expires_at: nextExpiry,
    closed_at: null,
    closure_reason: null,
    updated_at: now.toISOString(),
  };

  if (!row) {
    const { error } = await supabase.from('whatsapp_conversation_sessions').insert({
      sender_phone: normalizedPhone,
      opened_at: now.toISOString(),
      ...nextValues,
    });
    if (error) throw new Error(`Unable to start WhatsApp conversation: ${error.message}`);
    return 'started';
  }

  const { error } = await supabase
    .from('whatsapp_conversation_sessions')
    .update({
      ...nextValues,
      opened_at: shouldRestart ? now.toISOString() : row.opened_at,
    })
    .eq('sender_phone', normalizedPhone);

  if (error) throw new Error(`Unable to update WhatsApp conversation: ${error.message}`);
  return shouldRestart ? 'restarted' : 'continued';
}

export async function closeWhatsAppConversation(
  supabase: SupabaseClient,
  senderPhone: string,
  reason: 'user_requested' | 'closing_phrase',
  now = new Date(),
): Promise<void> {
  const normalizedPhone = normalizeSenderPhone(senderPhone);
  if (!normalizedPhone) throw new Error('WhatsApp sender phone is empty.');

  const timestamp = now.toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('whatsapp_conversation_sessions')
    .update({
      status: 'closed',
      last_activity_at: timestamp,
      expires_at: timestamp,
      closed_at: timestamp,
      closure_reason: reason,
      updated_at: timestamp,
    })
    .eq('sender_phone', normalizedPhone)
    .select('sender_phone')
    .maybeSingle();

  if (updateError) {
    throw new Error(`Unable to close WhatsApp conversation: ${updateError.message}`);
  }
  if (updated) return;

  const { error: insertError } = await supabase.from('whatsapp_conversation_sessions').insert({
    sender_phone: normalizedPhone,
    status: 'closed',
    opened_at: timestamp,
    last_activity_at: timestamp,
    expires_at: timestamp,
    closed_at: timestamp,
    closure_reason: reason,
    updated_at: timestamp,
  });

  if (insertError) throw new Error(`Unable to persist closed WhatsApp conversation: ${insertError.message}`);
}
