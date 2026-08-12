-- Idempotency key for automatic WhatsApp shift reminders. The cron handler
-- claims a volunteer/day/shift before calling Meta, preventing duplicate sends
-- when the scheduler invokes the route more than once.

ALTER TABLE public.reminder_logs
  ADD COLUMN IF NOT EXISTS send_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS automation_key text;

ALTER TABLE public.reminder_logs
  DROP CONSTRAINT IF EXISTS reminder_logs_send_source_check;

ALTER TABLE public.reminder_logs
  ADD CONSTRAINT reminder_logs_send_source_check
  CHECK (send_source IN ('manual', 'automatic', 'test'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_logs_automation_key
  ON public.reminder_logs (automation_key)
  WHERE automation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_logs_source_sent_at
  ON public.reminder_logs (send_source, sent_at DESC);
