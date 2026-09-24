-- Attendance supplied from the Open House attendance summary.
-- September 7-9 are attendance-only dates without volunteer shifts.

INSERT INTO public.daily_event_attendance_totals (
  event_date,
  male_attendance,
  female_attendance,
  total_attendance,
  updated_at
)
VALUES
  ('2026-09-05', 134, 159, 293, now()),
  ('2026-09-10', 1305, 1739, 3044, now()),
  ('2026-09-11', 1860, 1897, 3757, now()),
  ('2026-09-12', 1765, 2100, 3865, now()),
  ('2026-09-14', 1616, 1833, 3449, now()),
  ('2026-09-15', 1612, 2329, 3941, now()),
  ('2026-09-16', 923, 1149, 2072, now()),
  ('2026-09-17', 1114, 1521, 2635, now()),
  ('2026-09-18', 806, 999, 1805, now()),
  ('2026-09-19', 1832, 2618, 4450, now())
ON CONFLICT (event_date) DO UPDATE
SET
  male_attendance = EXCLUDED.male_attendance,
  female_attendance = EXCLUDED.female_attendance,
  total_attendance = EXCLUDED.total_attendance,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.daily_event_attendance_totals (
  event_date,
  total_attendance,
  updated_at
)
VALUES
  ('2026-09-07', 198, now()),
  ('2026-09-08', 237, now()),
  ('2026-09-09', 250, now())
ON CONFLICT (event_date) DO UPDATE
SET
  total_attendance = EXCLUDED.total_attendance,
  updated_at = EXCLUDED.updated_at
WHERE daily_event_attendance_totals.male_attendance IS NULL
  AND daily_event_attendance_totals.female_attendance IS NULL;
