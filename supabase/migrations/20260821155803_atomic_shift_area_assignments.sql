-- Keep shift-area updates and their audit entries in the same transaction.
CREATE OR REPLACE FUNCTION public.assign_shift_areas_with_audit(
  p_shift_ids uuid[],
  p_area_id uuid,
  p_audit_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer := COALESCE(cardinality(p_shift_ids), 0);
  v_updated_count integer;
  v_audit_count integer;
BEGIN
  IF v_expected_count = 0 THEN
    RAISE EXCEPTION 'At least one shift ID is required';
  END IF;

  IF v_expected_count <> (
    SELECT count(DISTINCT input.shift_id)
    FROM unnest(p_shift_ids) AS input(shift_id)
    WHERE input.shift_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Shift IDs must be unique and non-null';
  END IF;

  IF jsonb_typeof(p_audit_rows) <> 'array'
     OR jsonb_array_length(p_audit_rows) <> v_expected_count THEN
    RAISE EXCEPTION 'Every shift update requires exactly one audit row';
  END IF;

  WITH updated AS (
    UPDATE public.shifts
    SET area_id = p_area_id
    WHERE id = ANY(p_shift_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION 'Not all requested shifts were updated';
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

REVOKE ALL ON FUNCTION public.assign_shift_areas_with_audit(uuid[], uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_shift_areas_with_audit(uuid[], uuid, jsonb)
  TO service_role;
