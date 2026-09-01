-- Enforce the committee boundary for shift-area assignments in every write path.
-- Also reconcile existing assignments whenever a volunteer changes committee.

CREATE OR REPLACE FUNCTION public.validate_shift_committee_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_volunteer_committee_id uuid;
  v_area_committee_id uuid;
  v_area_status text;
BEGIN
  IF NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT volunteer.committee_id
    INTO v_volunteer_committee_id
  FROM public.volunteers AS volunteer
  WHERE volunteer.id = NEW.volunteer_id;

  SELECT area.committee_id, area.status
    INTO v_area_committee_id, v_area_status
  FROM public.committee_areas AS area
  WHERE area.id = NEW.area_id;

  IF v_area_committee_id IS NULL THEN
    RAISE EXCEPTION 'El área seleccionada no existe.' USING ERRCODE = '23503';
  END IF;

  IF v_area_status <> 'active' THEN
    RAISE EXCEPTION 'No se puede asignar un área archivada.' USING ERRCODE = '23514';
  END IF;

  IF v_volunteer_committee_id IS NULL OR v_volunteer_committee_id <> v_area_committee_id THEN
    RAISE EXCEPTION 'El área y el voluntario deben pertenecer al mismo comité.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_shift_committee_area_trigger ON public.shifts;
CREATE TRIGGER validate_shift_committee_area_trigger
  BEFORE INSERT OR UPDATE OF volunteer_id, area_id
  ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_shift_committee_area();

CREATE OR REPLACE FUNCTION public.reconcile_shift_areas_after_volunteer_committee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_assignment record;
BEGIN
  IF OLD.committee_id IS NOT DISTINCT FROM NEW.committee_id THEN
    RETURN NEW;
  END IF;

  FOR v_assignment IN
    SELECT
      shift.id,
      shift.day_key,
      shift.shift_key,
      shift.area_id,
      area.name AS area_name,
      area.committee_id AS area_committee_id
    FROM public.shifts AS shift
    JOIN public.committee_areas AS area ON area.id = shift.area_id
    WHERE shift.volunteer_id = NEW.id
      AND area.committee_id IS DISTINCT FROM NEW.committee_id
  LOOP
    UPDATE public.shifts
    SET area_id = NULL
    WHERE id = v_assignment.id;

    INSERT INTO public.activity_logs (
      user_name,
      user_role,
      action_type,
      description,
      details,
      target_id
    ) VALUES (
      'Sistema',
      'Sistema',
      'Seguridad',
      format(
        'Retiró el área "%s" del turno %s de %s al cambiar de comité',
        v_assignment.area_name,
        v_assignment.shift_key,
        v_assignment.day_key
      ),
      jsonb_build_object(
        'context', jsonb_build_object(
          'operation', 'committee_transfer_area_cleanup',
          'shiftId', v_assignment.id,
          'dayKey', v_assignment.day_key,
          'shiftKey', v_assignment.shift_key,
          'previousAreaId', v_assignment.area_id,
          'previousAreaCommitteeId', v_assignment.area_committee_id,
          'targetCommitteeId', NEW.committee_id
        )
      )::text,
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reconcile_shift_areas_after_volunteer_committee_change_trigger
  ON public.volunteers;
CREATE TRIGGER reconcile_shift_areas_after_volunteer_committee_change_trigger
  AFTER UPDATE OF committee_id
  ON public.volunteers
  FOR EACH ROW
  WHEN (OLD.committee_id IS DISTINCT FROM NEW.committee_id)
  EXECUTE FUNCTION public.reconcile_shift_areas_after_volunteer_committee_change();

-- Repair any inconsistent historical rows if they exist in another environment.
DO $$
DECLARE
  v_assignment record;
BEGIN
  FOR v_assignment IN
    SELECT
      shift.id,
      shift.volunteer_id,
      shift.day_key,
      shift.shift_key,
      shift.area_id,
      area.name AS area_name,
      area.committee_id AS area_committee_id,
      volunteer.committee_id AS volunteer_committee_id
    FROM public.shifts AS shift
    JOIN public.volunteers AS volunteer ON volunteer.id = shift.volunteer_id
    JOIN public.committee_areas AS area ON area.id = shift.area_id
    WHERE volunteer.committee_id IS DISTINCT FROM area.committee_id
  LOOP
    UPDATE public.shifts
    SET area_id = NULL
    WHERE id = v_assignment.id;

    INSERT INTO public.activity_logs (
      user_name,
      user_role,
      action_type,
      description,
      details,
      target_id
    ) VALUES (
      'Sistema',
      'Sistema',
      'Seguridad',
      format(
        'Corrigió un área de otro comité en el turno %s de %s: %s → Sin área',
        v_assignment.shift_key,
        v_assignment.day_key,
        v_assignment.area_name
      ),
      jsonb_build_object(
        'context', jsonb_build_object(
          'operation', 'cross_committee_area_migration_cleanup',
          'shiftId', v_assignment.id,
          'dayKey', v_assignment.day_key,
          'shiftKey', v_assignment.shift_key,
          'previousAreaId', v_assignment.area_id,
          'previousAreaCommitteeId', v_assignment.area_committee_id,
          'volunteerCommitteeId', v_assignment.volunteer_committee_id
        )
      )::text,
      v_assignment.volunteer_id::text
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_shift_committee_area() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_shift_areas_after_volunteer_committee_change()
  FROM PUBLIC, anon, authenticated;
