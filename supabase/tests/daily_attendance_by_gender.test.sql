BEGIN;

-- Legacy totals remain valid without a gender breakdown.
INSERT INTO public.daily_event_attendance_totals (event_date, total_attendance)
VALUES ('2099-01-01', 100);

-- New records may store both gender counts when their sum matches the total.
INSERT INTO public.daily_event_attendance_totals (
  event_date,
  male_attendance,
  female_attendance,
  total_attendance
)
VALUES ('2099-01-02', 45, 55, 100);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.daily_event_attendance_totals (
      event_date,
      male_attendance,
      female_attendance,
      total_attendance
    )
    VALUES ('2099-01-03', 45, 50, 100);
    RAISE EXCEPTION 'A mismatched gender sum should have been rejected';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.daily_event_attendance_totals (
      event_date,
      male_attendance,
      total_attendance
    )
    VALUES ('2099-01-04', 100, 100);
    RAISE EXCEPTION 'A partial gender breakdown should have been rejected';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

ROLLBACK;
