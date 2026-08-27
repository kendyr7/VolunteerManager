-- Restore different previous areas in one atomic transaction, auditing every change.
CREATE OR REPLACE FUNCTION public.restore_shift_areas_with_audit(
  p_assignments jsonb,
  p_audit_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_updated_count integer;
  v_audit_count integer;
BEGIN
  IF jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'Assignments must be a JSON array';
  END IF;

  v_expected_count := jsonb_array_length(p_assignments);
  IF v_expected_count = 0 OR v_expected_count > 250 THEN
    RAISE EXCEPTION 'Assignments must contain between 1 and 250 rows';
  END IF;

  IF v_expected_count <> (
    SELECT count(DISTINCT assignment.shift_id)
    FROM jsonb_to_recordset(p_assignments) AS assignment(shift_id uuid, area_id uuid)
    WHERE assignment.shift_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Shift IDs must be unique and non-null';
  END IF;

  IF jsonb_typeof(p_audit_rows) <> 'array'
     OR jsonb_array_length(p_audit_rows) <> v_expected_count THEN
    RAISE EXCEPTION 'Every shift restore requires exactly one audit row';
  END IF;

  WITH requested AS (
    SELECT assignment.shift_id, assignment.area_id
    FROM jsonb_to_recordset(p_assignments) AS assignment(shift_id uuid, area_id uuid)
  ),
  updated AS (
    UPDATE public.shifts AS shift
    SET area_id = requested.area_id
    FROM requested
    WHERE shift.id = requested.shift_id
    RETURNING shift.id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION 'Not all requested shifts were restored';
  END IF;

  INSERT INTO public.activity_logs (
    user_name,
    user_role,
    action_type,
    description,
    details,
    target_id
  )
  SELECT
    audit.user_name,
    audit.user_role,
    audit.action_type,
    audit.description,
    audit.details,
    audit.target_id
  FROM jsonb_to_recordset(p_audit_rows) AS audit(
    user_name text,
    user_role text,
    action_type text,
    description text,
    details text,
    target_id text
  );

  GET DIAGNOSTICS v_audit_count = ROW_COUNT;
  IF v_audit_count <> v_expected_count THEN
    RAISE EXCEPTION 'Not all audit rows were written';
  END IF;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_shift_areas_with_audit(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_shift_areas_with_audit(jsonb, jsonb)
  TO service_role;
