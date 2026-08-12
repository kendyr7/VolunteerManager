-- Role and permission model for platform profiles.
-- Existing Editor profiles become committee coordinators. Administrators can
-- later change specific profiles to technology coordinators from /users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coordinator_type text;

UPDATE public.profiles
SET coordinator_type = 'committee'
WHERE role = 'Editor'
  AND coordinator_type IS NULL;

UPDATE public.profiles
SET coordinator_type = NULL
WHERE role <> 'Editor';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_coordinator_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_coordinator_type_check
  CHECK (
    (role = 'Editor' AND coordinator_type IN ('committee', 'technology'))
    OR (role <> 'Editor' AND coordinator_type IS NULL)
  );

-- Technology permissions are configurable as a group policy. Volunteer
-- archiving and platform-user management remain exclusive to Administrators.
INSERT INTO public.system_settings (key, value)
VALUES
  ('role.technology.view_dashboard', 'true'),
  ('role.technology.view_volunteers', 'true'),
  ('role.technology.edit_personal_info', 'true'),
  ('role.technology.reschedule_volunteers', 'true'),
  ('role.technology.register_missing_attendance', 'false'),
  ('role.technology.correct_attendance_times', 'false'),
  ('role.technology.view_notices', 'true'),
  ('role.technology.view_requests', 'true'),
  ('role.technology.view_global_reports', 'true'),
  ('role.technology.scan_qr_attendance', 'true'),
  ('role.technology.create_volunteers', 'true'),
  ('role.technology.import_volunteers', 'true'),
  ('role.committee.view_notices', 'true'),
  ('role.committee.view_requests', 'true'),
  ('role.committee.view_global_reports', 'false')
ON CONFLICT (key) DO NOTHING;

-- Browser clients may subscribe/read the permission configuration, but all
-- writes go through an Admin-authorized Server Action using the service role.
DROP POLICY IF EXISTS "System settings writable by all authenticated users"
  ON public.system_settings;
DROP POLICY IF EXISTS "System settings writable by administrators"
  ON public.system_settings;

CREATE POLICY "System settings writable by administrators"
  ON public.system_settings
  FOR ALL
  USING ((auth.jwt() ->> 'app_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'app_role') = 'Admin');

-- Platform users are managed only through Admin-authorized Server Actions.
DROP POLICY IF EXISTS "Escritura pública de profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles writable by administrators" ON public.profiles;
CREATE POLICY "Profiles writable by administrators"
  ON public.profiles
  FOR ALL
  USING ((auth.jwt() ->> 'app_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'app_role') = 'Admin');

-- Audit entries are written by trusted Server Actions, never by the browser.
DROP POLICY IF EXISTS "Activity logs insertable by all" ON public.activity_logs;
DROP POLICY IF EXISTS "Activity logs writable by all authenticated users" ON public.activity_logs;
DROP POLICY IF EXISTS "Activity logs writable by administrators" ON public.activity_logs;
CREATE POLICY "Activity logs writable by administrators"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'app_role') = 'Admin');

-- Permission and profile changes need to reach already-open sessions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
