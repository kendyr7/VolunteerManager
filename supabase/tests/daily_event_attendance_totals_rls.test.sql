BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.daily_event_attendance_totals'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'daily_event_attendance_totals must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.daily_event_attendance_totals', 'SELECT')
    OR has_table_privilege('authenticated', 'public.daily_event_attendance_totals', 'SELECT')
    OR has_table_privilege('authenticated', 'public.daily_event_attendance_totals', 'INSERT')
    OR has_table_privilege('authenticated', 'public.daily_event_attendance_totals', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.daily_event_attendance_totals', 'DELETE')
  THEN
    RAISE EXCEPTION 'daily attendance totals must not be exposed to browser roles';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.daily_event_attendance_totals', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.daily_event_attendance_totals', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.daily_event_attendance_totals', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.daily_event_attendance_totals', 'DELETE')
  THEN
    RAISE EXCEPTION 'service_role needs CRUD access for authorized Server Actions';
  END IF;
END
$$;

ROLLBACK;
