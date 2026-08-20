-- Committee area coverage foundation.
--
-- This migration is intentionally ordered after the repository's existing
-- 2026-10 migrations. The Supabase CLI generated the file with the current
-- date, but this repository already contains future-dated migrations.

CREATE TABLE public.committee_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT committee_areas_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT committee_areas_description_length
    CHECK (description IS NULL OR char_length(description) <= 240),
  CONSTRAINT committee_areas_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT committee_areas_archive_state_check
    CHECK (
      (status = 'active' AND archived_at IS NULL AND archived_by IS NULL)
      OR (status = 'archived' AND archived_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX committee_areas_unique_active_name
  ON public.committee_areas (committee_id, lower(btrim(name)))
  WHERE status = 'active';

CREATE INDEX committee_areas_committee_status_order_idx
  ON public.committee_areas (committee_id, status, sort_order, name);

CREATE TABLE public.area_shift_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.committee_areas(id) ON DELETE RESTRICT,
  day_key text NOT NULL,
  shift_key text NOT NULL,
  required_count integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT area_shift_requirements_day_key_check
    CHECK (char_length(btrim(day_key)) BETWEEN 2 AND 20),
  CONSTRAINT area_shift_requirements_shift_key_check
    CHECK (shift_key IN ('T1', 'T2', 'T3', 'T4')),
  CONSTRAINT area_shift_requirements_required_count_check
    CHECK (required_count >= 0),
  CONSTRAINT area_shift_requirements_unique
    UNIQUE (area_id, day_key, shift_key)
);

CREATE INDEX area_shift_requirements_area_day_idx
  ON public.area_shift_requirements (area_id, day_key, shift_key);

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS area_id uuid;

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS shifts_area_id_fkey;

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_area_id_fkey
  FOREIGN KEY (area_id)
  REFERENCES public.committee_areas(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS shifts_area_day_shift_idx
  ON public.shifts (area_id, day_key, shift_key)
  WHERE area_id IS NOT NULL;

-- An assignment may only use an active area from the volunteer's committee.
-- Keeping this invariant in Postgres protects imports and future write paths in
-- addition to the Server Action validation.
CREATE OR REPLACE FUNCTION public.validate_shift_committee_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  volunteer_committee_id uuid;
  area_committee_id uuid;
  area_status text;
BEGIN
  IF NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT committee_id
    INTO volunteer_committee_id
  FROM public.volunteers
  WHERE id = NEW.volunteer_id;

  SELECT committee_id, status
    INTO area_committee_id, area_status
  FROM public.committee_areas
  WHERE id = NEW.area_id;

  IF area_committee_id IS NULL THEN
    RAISE EXCEPTION 'El área seleccionada no existe.' USING ERRCODE = '23503';
  END IF;

  IF area_status <> 'active' THEN
    RAISE EXCEPTION 'No se puede asignar un área archivada.' USING ERRCODE = '23514';
  END IF;

  IF volunteer_committee_id IS NULL OR volunteer_committee_id <> area_committee_id THEN
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

DROP TRIGGER IF EXISTS committee_areas_updated_at_trigger ON public.committee_areas;
CREATE TRIGGER committee_areas_updated_at_trigger
  BEFORE UPDATE ON public.committee_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS area_shift_requirements_updated_at_trigger ON public.area_shift_requirements;
CREATE TRIGGER area_shift_requirements_updated_at_trigger
  BEFORE UPDATE ON public.area_shift_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.committee_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_shift_requirements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.committee_areas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.area_shift_requirements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.committee_areas TO authenticated;
GRANT SELECT ON TABLE public.area_shift_requirements TO authenticated;
GRANT ALL ON TABLE public.committee_areas TO service_role;
GRANT ALL ON TABLE public.area_shift_requirements TO service_role;

CREATE POLICY "Authorized users read committee areas"
  ON public.committee_areas
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'app_role') = 'Admin'
    OR (
      (SELECT auth.jwt() ->> 'userType') = 'profile'
      AND EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = (SELECT auth.uid())
          AND profile.role = 'Editor'
          AND profile.coordinator_type = 'committee'
          AND profile.committee_id = committee_areas.committee_id
          AND coalesce(profile.status, 'active') <> 'archived'
      )
    )
    OR (
      (SELECT auth.jwt() ->> 'userType') = 'volunteer'
      AND EXISTS (
        SELECT 1
        FROM public.volunteers volunteer
        WHERE volunteer.id = (SELECT auth.uid())
          AND volunteer.committee_id = committee_areas.committee_id
          AND coalesce(volunteer.status, 'active') <> 'archived'
      )
    )
  );

CREATE POLICY "Authorized users read area requirements"
  ON public.area_shift_requirements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.committee_areas area
      WHERE area.id = area_shift_requirements.area_id
    )
  );

COMMENT ON TABLE public.committee_areas IS
  'Operational areas owned by one committee. Archived rows remain available for historical assignments.';
COMMENT ON TABLE public.area_shift_requirements IS
  'Minimum volunteer coverage required for one committee area, event day and shift.';
COMMENT ON COLUMN public.shifts.area_id IS
  'Optional operational area for this volunteer day/shift assignment. NULL means Sin área.';
