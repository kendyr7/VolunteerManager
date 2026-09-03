-- Indexes for the operational dashboard reads.
--
-- The dashboard filters shifts and attendance sessions by event day before
-- joining them to volunteers. Existing indexes start with volunteer_id, so
-- they cannot efficiently serve the global day-first access pattern.

CREATE INDEX IF NOT EXISTS shifts_day_volunteer_idx
  ON public.shifts (day_key, volunteer_id);

CREATE INDEX IF NOT EXISTS attendance_sessions_day_volunteer_started_idx
  ON public.attendance_sessions (day_key, volunteer_id, started_at DESC);
