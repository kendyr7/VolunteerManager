-- WhatsApp outbound delivery diagnostics.
-- Meta can deliver sent/delivered/read/failed callbacks out of order, so each
-- event is retained and the latest status is selected by Meta's timestamp.

ALTER TABLE public.reminder_logs
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error_code text,
  ADD COLUMN IF NOT EXISTS delivery_error_title text,
  ADD COLUMN IF NOT EXISTS delivery_error_message text,
  ADD COLUMN IF NOT EXISTS delivery_error_details text;

ALTER TABLE public.reminder_logs
  DROP CONSTRAINT IF EXISTS reminder_logs_delivery_status_check;

ALTER TABLE public.reminder_logs
  ADD CONSTRAINT reminder_logs_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

UPDATE public.reminder_logs
SET
  delivery_status = CASE
    WHEN status = 'error' THEN 'failed'
    WHEN whatsapp_message_id IS NOT NULL THEN 'sent'
    ELSE NULL
  END,
  delivery_updated_at = COALESCE(delivery_updated_at, sent_at)
WHERE delivery_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_logs_delivery_status
  ON public.reminder_logs (delivery_status, delivery_updated_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_status_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid                 text NOT NULL,
  status                text NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  status_timestamp      timestamptz NOT NULL,
  recipient_id          text,
  error_code            text,
  error_title           text,
  error_message         text,
  error_details         text,
  conversation          jsonb,
  pricing               jsonb,
  payload               jsonb NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_status_events_unique
    UNIQUE (wamid, status, status_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_latest
  ON public.whatsapp_message_status_events (wamid, status_timestamp DESC, received_at DESC);

ALTER TABLE public.whatsapp_message_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_message_status_events FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_message_status_events TO service_role;

CREATE OR REPLACE FUNCTION public.apply_latest_whatsapp_status_to_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest public.whatsapp_message_status_events%ROWTYPE;
BEGIN
  IF NEW.whatsapp_message_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO latest
  FROM public.whatsapp_message_status_events
  WHERE wamid = NEW.whatsapp_message_id
  ORDER BY status_timestamp DESC, received_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.delivery_status := latest.status;
  NEW.delivery_updated_at := latest.status_timestamp;

  IF latest.status = 'delivered' THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, latest.status_timestamp);
  ELSIF latest.status = 'read' THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, latest.status_timestamp);
    NEW.read_at := latest.status_timestamp;
  ELSIF latest.status = 'failed' THEN
    NEW.failed_at := latest.status_timestamp;
    NEW.delivery_error_code := latest.error_code;
    NEW.delivery_error_title := latest.error_title;
    NEW.delivery_error_message := latest.error_message;
    NEW.delivery_error_details := latest.error_details;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_latest_whatsapp_status_to_reminder
  ON public.reminder_logs;

CREATE TRIGGER trg_apply_latest_whatsapp_status_to_reminder
BEFORE INSERT OR UPDATE OF whatsapp_message_id ON public.reminder_logs
FOR EACH ROW
EXECUTE FUNCTION public.apply_latest_whatsapp_status_to_reminder();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reminder_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reminder_logs;
  END IF;
END $$;

COMMENT ON TABLE public.whatsapp_message_status_events IS
  'Idempotent WhatsApp outbound status callbacks ordered by Meta timestamp.';
