-- Durable inbox for WhatsApp webhook messages.
-- A unique wamid makes inbound processing idempotent across Meta retries.

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid                 text NOT NULL UNIQUE,
  sender_phone          text NOT NULL,
  message_type          text NOT NULL,
  payload               jsonb NOT NULL,
  status                text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'processing', 'processed', 'failed', 'exhausted')),
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  received_at           timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processed_at          timestamptz,
  next_retry_at         timestamptz NOT NULL DEFAULT now(),
  last_error            text,
  response_status       integer,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_events_retry
  ON public.whatsapp_inbound_events (status, next_retry_at)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_events_received_at
  ON public.whatsapp_inbound_events (received_at DESC);

ALTER TABLE public.whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;

-- Webhook access is server-only through SUPABASE_SERVICE_ROLE_KEY.
REVOKE ALL ON TABLE public.whatsapp_inbound_events FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_inbound_events TO service_role;

COMMENT ON TABLE public.whatsapp_inbound_events IS
  'Durable, idempotent inbox for inbound WhatsApp message webhooks.';

