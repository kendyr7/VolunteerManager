-- Audit entries must only come from authorized users or trusted server clients.
DROP POLICY IF EXISTS "Activity logs writable by all"
  ON public.activity_logs;
