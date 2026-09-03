-- Returns the dashboard's operational source rows in a single PostgREST
-- response. The application still performs the existing calculations; this
-- function only removes the 1,000-row pagination round trips.
CREATE OR REPLACE FUNCTION public.get_dashboard_operational_snapshot(
  p_day_keys text[],
  p_committee_id uuid DEFAULT NULL,
  p_include_insight boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'committees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', committee.id,
        'name', committee.name,
        'status', committee.status
      ))
      FROM public.committees AS committee
      WHERE committee.status IS NULL OR committee.status <> 'archived'
    ), '[]'::jsonb),
    'requirements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'committee_id', requirement.committee_id,
        'shift_key', requirement.shift_key,
        'required', requirement.required
      ))
      FROM public.committee_shift_requirements AS requirement
      WHERE p_committee_id IS NULL OR requirement.committee_id = p_committee_id
    ), '[]'::jsonb),
    'volunteers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', volunteer.id,
        'committee_id', volunteer.committee_id,
        'status', volunteer.status
      ))
      FROM public.volunteers AS volunteer
      WHERE (volunteer.status IS NULL OR volunteer.status <> 'archived')
        AND (p_committee_id IS NULL OR volunteer.committee_id = p_committee_id)
    ), '[]'::jsonb),
    'shifts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', shift_row.id,
        'volunteer_id', shift_row.volunteer_id,
        'day_key', shift_row.day_key,
        'shift_key', shift_row.shift_key,
        'checked_in', shift_row.checked_in,
        'area_id', shift_row.area_id
      ))
      FROM public.shifts AS shift_row
      WHERE shift_row.day_key = ANY(p_day_keys)
        AND (
          p_committee_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.volunteers AS volunteer
            WHERE volunteer.id = shift_row.volunteer_id
              AND volunteer.committee_id = p_committee_id
          )
        )
    ), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', session_row.id,
        'volunteer_id', session_row.volunteer_id,
        'day_key', session_row.day_key,
        'started_at', session_row.started_at,
        'ended_at', session_row.ended_at,
        'status', session_row.status
      ))
      FROM public.attendance_sessions AS session_row
      WHERE session_row.day_key = ANY(p_day_keys)
        AND (
          p_committee_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.volunteers AS volunteer
            WHERE volunteer.id = session_row.volunteer_id
              AND volunteer.committee_id = p_committee_id
          )
        )
    ), '[]'::jsonb),
    'areas', CASE WHEN p_include_insight THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', area.id,
        'committee_id', area.committee_id,
        'name', area.name,
        'status', area.status
      ))
      FROM public.committee_areas AS area
      WHERE (area.status IS NULL OR area.status <> 'archived')
        AND (p_committee_id IS NULL OR area.committee_id = p_committee_id)
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'area_requirements', CASE WHEN p_include_insight THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'area_id', requirement.area_id,
        'day_key', requirement.day_key,
        'shift_key', requirement.shift_key,
        'required_count', requirement.required_count
      ))
      FROM public.area_shift_requirements AS requirement
      WHERE requirement.day_key = ANY(p_day_keys)
        AND (
          p_committee_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.committee_areas AS area
            WHERE area.id = requirement.area_id
              AND area.committee_id = p_committee_id
          )
        )
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_operational_snapshot(text[], uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_operational_snapshot(text[], uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_operational_snapshot(text[], uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.get_dashboard_operational_snapshot(text[], uuid, boolean)
IS 'Returns dashboard source rows in one service-role-only response to avoid PostgREST pagination round trips.';
