-- Migration: Create system_settings table
-- Stores global system configuration like coordinator shift edit permissions

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System settings readable by authenticated profiles"
  ON public.system_settings
  FOR SELECT
  USING (true);

CREATE POLICY "System settings writable by all authenticated users"
  ON public.system_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.system_settings (key, value)
VALUES ('allow_coordinator_shift_edit', 'false')
ON CONFLICT (key) DO NOTHING;
