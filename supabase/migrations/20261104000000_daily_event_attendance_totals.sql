-- Manual event-wide attendance totals shown in Reports > Daily coverage.
-- Reads and writes are intentionally server-only: authorized Server Actions
-- validate the application's signed session before using service_role.

CREATE TABLE IF NOT EXISTS public.daily_event_attendance_totals (
  event_date date PRIMARY KEY,
  total_attendance integer NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_event_attendance_totals_nonnegative
    CHECK (total_attendance >= 0 AND total_attendance <= 1000000)
);

ALTER TABLE public.daily_event_attendance_totals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.daily_event_attendance_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_event_attendance_totals TO service_role;

COMMENT ON TABLE public.daily_event_attendance_totals IS
  'Manual event-wide attendance headcount by operational event date.';
COMMENT ON COLUMN public.daily_event_attendance_totals.total_attendance IS
  'Total people reported for the event date; independent from volunteer QR check-ins.';

INSERT INTO public.system_settings (key, value)
VALUES
  ('role.admin.manage_daily_attendance_totals', 'true'),
  ('role.technology.manage_daily_attendance_totals', 'true'),
  ('role.committee.manage_daily_attendance_totals', 'false')
ON CONFLICT (key) DO NOTHING;
