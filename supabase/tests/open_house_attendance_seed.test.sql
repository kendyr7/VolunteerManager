DO $$
DECLARE
  imported_rows integer;
  imported_total integer;
  total_only_rows integer;
BEGIN
  SELECT count(*), sum(total_attendance)
  INTO imported_rows, imported_total
  FROM public.daily_event_attendance_totals
  WHERE event_date IN (
    '2026-09-05', '2026-09-07', '2026-09-08', '2026-09-09',
    '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14',
    '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    '2026-09-19'
  );

  IF imported_rows <> 13 THEN
    RAISE EXCEPTION 'Expected 13 imported attendance rows, found %', imported_rows;
  END IF;

  IF imported_total <> 29996 THEN
    RAISE EXCEPTION 'Expected imported attendance total 29996, found %', imported_total;
  END IF;

  SELECT count(*)
  INTO total_only_rows
  FROM public.daily_event_attendance_totals
  WHERE event_date IN ('2026-09-07', '2026-09-08', '2026-09-09')
    AND male_attendance IS NULL
    AND female_attendance IS NULL;

  IF total_only_rows <> 3 THEN
    RAISE EXCEPTION 'Expected September 7-9 to remain total-only attendance rows';
  END IF;
END
$$;
