-- Expiring application-level WhatsApp conversations.
-- Meta's customer-service window remains independent; this table only controls
-- whether an inbound interaction may continue the existing automated flow.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_sessions (
  sender_phone       text PRIMARY KEY,
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed')),
  opened_at          timestamptz NOT NULL DEFAULT now(),
  last_activity_at   timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  closed_at          timestamptz,
  closure_reason     text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversation_sender_phone_not_blank
    CHECK (length(btrim(sender_phone)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_sessions_expiry
  ON public.whatsapp_conversation_sessions (expires_at)
  WHERE status = 'open';

ALTER TABLE public.whatsapp_conversation_sessions ENABLE ROW LEVEL SECURITY;

-- This state is internal to the verified Meta webhook and must never be
-- available to browser clients.
REVOKE ALL ON TABLE public.whatsapp_conversation_sessions
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_conversation_sessions TO service_role;

COMMENT ON TABLE public.whatsapp_conversation_sessions IS
  'Server-only WhatsApp flow sessions that expire after 30 minutes of inbound inactivity.';
