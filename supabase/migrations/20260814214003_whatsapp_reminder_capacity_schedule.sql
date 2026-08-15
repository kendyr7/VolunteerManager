-- Persist the automatic WhatsApp reminder allocation so the projection and the
-- cron handler use the same deterministic 3 -> 2 -> 1 day capacity plan.

CREATE TABLE IF NOT EXISTS public.whatsapp_reminder_schedule (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_key            text NOT NULL UNIQUE,
  volunteer_id            uuid NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  event_date              date NOT NULL,
  day_key                 text NOT NULL,
  shift_key               text NOT NULL CHECK (shift_key IN ('T1', 'T2', 'T3', 'T4')),
  recipient_phone         text,
  preferred_send_date     date NOT NULL,
  scheduled_send_date     date,
  preferred_lead_days     smallint NOT NULL CHECK (preferred_lead_days BETWEEN 1 AND 3),
  scheduled_lead_days     smallint CHECK (scheduled_lead_days BETWEEN 1 AND 3),
  allocation_status       text NOT NULL CHECK (
    allocation_status IN ('scheduled', 'overflow', 'invalid', 'sent', 'cancelled')
  ),
  allocation_reason       text NOT NULL CHECK (
    allocation_reason IN ('preferred', 'capacity_early', 'capacity_late', 'capacity_exceeded', 'invalid_phone')
  ),
  plan_version            uuid NOT NULL,
  sent_at                 timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_reminder_schedule_send_date
  ON public.whatsapp_reminder_schedule (scheduled_send_date, allocation_status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_reminder_schedule_event
  ON public.whatsapp_reminder_schedule (event_date, volunteer_id, shift_key);

CREATE INDEX IF NOT EXISTS idx_whatsapp_reminder_schedule_phone_date
  ON public.whatsapp_reminder_schedule (recipient_phone, scheduled_send_date)
  WHERE recipient_phone IS NOT NULL;

ALTER TABLE public.whatsapp_reminder_schedule ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_reminder_schedule FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_reminder_schedule TO service_role;

COMMENT ON TABLE public.whatsapp_reminder_schedule IS
  'Server-only allocation of automatic shift reminders across the 3, 2 and 1 day lead-time window.';

ALTER TABLE public.reminder_logs
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS preferred_send_date date,
  ADD COLUMN IF NOT EXISTS scheduled_send_date date;

CREATE INDEX IF NOT EXISTS idx_reminder_logs_recipient_sent_at
  ON public.reminder_logs (recipient_phone, sent_at DESC)
  WHERE recipient_phone IS NOT NULL;
