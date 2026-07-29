-- Migration: Create activity_logs table for Admin audit trails
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name   text NOT NULL DEFAULT 'Sistema',
  user_role   text NOT NULL DEFAULT 'Admin',
  action_type text NOT NULL,
  description text NOT NULL,
  details     text,
  target_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity logs readable by all authenticated users"
  ON public.activity_logs FOR SELECT USING (true);

CREATE POLICY "Activity logs writable by all authenticated users"
  ON public.activity_logs FOR INSERT WITH CHECK (true);

-- Insert initial audit entry
INSERT INTO public.activity_logs (user_name, user_role, action_type, description, details)
VALUES (
  'Sistema',
  'Admin',
  'Configuración',
  'Historial de Actividades activado correctamente',
  'Módulo de auditoría de operaciones iniciado para Puertas Abiertas 2026.'
);
