-- Migration: Create reminder_logs table for automated WhatsApp reminder tracking

CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id         uuid REFERENCES public.volunteers(id) ON DELETE CASCADE,
  shift_key            text NOT NULL CHECK (shift_key IN ('T1', 'T2', 'T3', 'T4')),
  day_key              text NOT NULL,
  whatsapp_message_id  text UNIQUE,
  status               text NOT NULL DEFAULT 'contactado' CHECK (status IN ('contactado', 'confirmado', 'error')),
  raw_payload          jsonb,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  confirmed_at         timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reminder_logs_volunteer_id ON public.reminder_logs(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_wamid ON public.reminder_logs(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_status ON public.reminder_logs(status);

-- Enable RLS
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "reminder_logs readable by all"
  ON public.reminder_logs FOR SELECT USING (true);

CREATE POLICY "reminder_logs writable by all"
  ON public.reminder_logs FOR ALL USING (true) WITH CHECK (true);
