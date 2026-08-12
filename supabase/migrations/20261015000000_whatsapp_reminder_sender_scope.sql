-- Track the platform user who initiated each WhatsApp reminder and keep
-- reminder diagnostics behind the application's server-side authorization.

ALTER TABLE public.reminder_logs
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid;

COMMENT ON COLUMN public.reminder_logs.sent_by_user_id IS
  'Profile ID of the platform user who initiated the reminder. NULL means an automated/system send.';

CREATE INDEX IF NOT EXISTS idx_reminder_logs_sender_sent_at
  ON public.reminder_logs (sent_by_user_id, sent_at DESC);

-- The application uses its own signed session cookie, so Supabase's anon/auth
-- roles cannot safely determine the current platform profile. Reads and writes
-- are therefore performed by authenticated Next.js server actions or trusted
-- webhook/cron handlers through the service-role client.
DROP POLICY IF EXISTS "reminder_logs readable by all" ON public.reminder_logs;
DROP POLICY IF EXISTS "reminder_logs writable by all" ON public.reminder_logs;

REVOKE ALL ON TABLE public.reminder_logs FROM anon, authenticated;
