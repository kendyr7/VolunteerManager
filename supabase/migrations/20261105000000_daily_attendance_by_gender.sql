-- Split the manual event-wide attendance total by gender while preserving
-- legacy totals that may have been recorded before this migration.

ALTER TABLE public.daily_event_attendance_totals
  ADD COLUMN IF NOT EXISTS male_attendance integer,
  ADD COLUMN IF NOT EXISTS female_attendance integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_event_attendance_totals_male_range'
      AND conrelid = 'public.daily_event_attendance_totals'::regclass
  ) THEN
    ALTER TABLE public.daily_event_attendance_totals
      ADD CONSTRAINT daily_event_attendance_totals_male_range
      CHECK (male_attendance IS NULL OR male_attendance BETWEEN 0 AND 1000000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_event_attendance_totals_female_range'
      AND conrelid = 'public.daily_event_attendance_totals'::regclass
  ) THEN
    ALTER TABLE public.daily_event_attendance_totals
      ADD CONSTRAINT daily_event_attendance_totals_female_range
      CHECK (female_attendance IS NULL OR female_attendance BETWEEN 0 AND 1000000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_event_attendance_totals_gender_sum'
      AND conrelid = 'public.daily_event_attendance_totals'::regclass
  ) THEN
    ALTER TABLE public.daily_event_attendance_totals
      ADD CONSTRAINT daily_event_attendance_totals_gender_sum
      CHECK (
        (male_attendance IS NULL AND female_attendance IS NULL)
        OR (
          male_attendance IS NOT NULL
          AND female_attendance IS NOT NULL
          AND total_attendance = male_attendance + female_attendance
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.daily_event_attendance_totals.male_attendance IS
  'Men included in the manually reported event-wide attendance total.';
COMMENT ON COLUMN public.daily_event_attendance_totals.female_attendance IS
  'Women included in the manually reported event-wide attendance total.';
