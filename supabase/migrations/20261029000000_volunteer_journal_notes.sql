-- Private volunteer journal notes.
-- The application already issues Supabase-compatible JWTs with:
--   sub = volunteers.id, userType = volunteer, role = authenticated.
-- Keep the browser client on the anon key and let RLS enforce ownership.

CREATE OR REPLACE FUNCTION public.volunteer_journal_tags_valid(tag_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT cardinality(tag_values) <= 8
    AND (SELECT count(DISTINCT lower(btrim(tag))) FROM unnest(tag_values) AS tag) = cardinality(tag_values)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(tag_values) AS tag
      WHERE length(tag) > 30 OR length(btrim(tag)) = 0
    );
$$;

CREATE TABLE IF NOT EXISTS public.volunteer_journal_notes (
  id uuid PRIMARY KEY,
  volunteer_id uuid NOT NULL REFERENCES public.volunteers(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  content_text text NOT NULL DEFAULT '',
  content_version smallint NOT NULL DEFAULT 1,
  shift_date date NULL,
  color text NOT NULL DEFAULT 'default',
  pattern text NOT NULL DEFAULT 'none',
  is_pinned boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_journal_notes_content_check
    CHECK (length(title) <= 200 AND length(content_html) <= 102400 AND length(content_text) <= 102400),
  CONSTRAINT volunteer_journal_notes_color_check
    CHECK (color IN ('default', 'coral', 'amber', 'emerald', 'teal', 'sky', 'lavender', 'rose', 'slate')),
  CONSTRAINT volunteer_journal_notes_pattern_check
    CHECK (pattern IN ('none', 'grid', 'dots', 'lines', 'gradient')),
  CONSTRAINT volunteer_journal_notes_tags_check
    CHECK (public.volunteer_journal_tags_valid(tags)),
  CONSTRAINT volunteer_journal_notes_has_content_check
    CHECK (length(btrim(title)) > 0 OR length(btrim(content_text)) > 0)
);

CREATE INDEX IF NOT EXISTS volunteer_journal_notes_owner_list_idx
  ON public.volunteer_journal_notes (volunteer_id, is_pinned DESC, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS volunteer_journal_notes_owner_shift_idx
  ON public.volunteer_journal_notes (volunteer_id, shift_date);

CREATE OR REPLACE FUNCTION public.touch_volunteer_journal_note()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.revision = OLD.revision + 1;
  NEW.volunteer_id = OLD.volunteer_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.volunteer_journal_shift_day_key(value date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE value
    WHEN DATE '2026-09-05' THEN 'sáb 5'
    WHEN DATE '2026-09-10' THEN 'jue 10'
    WHEN DATE '2026-09-11' THEN 'vie 11'
    WHEN DATE '2026-09-12' THEN 'sáb 12'
    WHEN DATE '2026-09-14' THEN 'lun 14'
    WHEN DATE '2026-09-15' THEN 'mar 15'
    WHEN DATE '2026-09-16' THEN 'mié 16'
    WHEN DATE '2026-09-17' THEN 'jue 17'
    WHEN DATE '2026-09-18' THEN 'vie 18'
    WHEN DATE '2026-09-19' THEN 'sáb 19'
    WHEN DATE '2026-09-21' THEN 'lun 21'
    WHEN DATE '2026-09-22' THEN 'mar 22'
    WHEN DATE '2026-09-23' THEN 'mié 23'
    WHEN DATE '2026-09-24' THEN 'jue 24'
    WHEN DATE '2026-09-25' THEN 'vie 25'
    WHEN DATE '2026-09-26' THEN 'sáb 26'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.validate_volunteer_journal_shift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A removed shift must not make an existing memory impossible to edit.
  -- Validate only a new association (or an insert), as described in the plan.
  IF TG_OP = 'UPDATE' AND NEW.shift_date IS NOT DISTINCT FROM OLD.shift_date THEN
    RETURN NEW;
  END IF;
  IF NEW.shift_date IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shifts
    WHERE shifts.volunteer_id = NEW.volunteer_id
      AND lower(btrim(shifts.day_key)) = lower(public.volunteer_journal_shift_day_key(NEW.shift_date))
  ) THEN
    RAISE EXCEPTION 'El voluntario no tiene un turno registrado para ese día.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS volunteer_journal_notes_touch_updated_at
  ON public.volunteer_journal_notes;
CREATE TRIGGER volunteer_journal_notes_touch_updated_at
  BEFORE UPDATE ON public.volunteer_journal_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_volunteer_journal_note();

DROP TRIGGER IF EXISTS volunteer_journal_notes_validate_shift
  ON public.volunteer_journal_notes;
CREATE TRIGGER volunteer_journal_notes_validate_shift
  BEFORE INSERT OR UPDATE OF volunteer_id, shift_date ON public.volunteer_journal_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_volunteer_journal_shift();

ALTER TABLE public.volunteer_journal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_journal_notes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.volunteer_journal_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.volunteer_journal_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.volunteer_journal_notes TO service_role;

DROP POLICY IF EXISTS "Volunteers read their private journal" ON public.volunteer_journal_notes;
CREATE POLICY "Volunteers read their private journal"
  ON public.volunteer_journal_notes
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'userType') = 'volunteer'
    AND volunteer_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Volunteers create their private journal" ON public.volunteer_journal_notes;
CREATE POLICY "Volunteers create their private journal"
  ON public.volunteer_journal_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.jwt() ->> 'userType') = 'volunteer'
    AND volunteer_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Volunteers update their private journal" ON public.volunteer_journal_notes;
CREATE POLICY "Volunteers update their private journal"
  ON public.volunteer_journal_notes
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'userType') = 'volunteer'
    AND volunteer_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT auth.jwt() ->> 'userType') = 'volunteer'
    AND volunteer_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Volunteers delete their private journal" ON public.volunteer_journal_notes;
CREATE POLICY "Volunteers delete their private journal"
  ON public.volunteer_journal_notes
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'userType') = 'volunteer'
    AND volunteer_id = (SELECT auth.uid())
  );

COMMENT ON TABLE public.volunteer_journal_notes IS
  'Private volunteer-owned journal notes. Never include in coordinator reports or operational exports.';

REVOKE ALL ON FUNCTION public.volunteer_journal_tags_valid(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.volunteer_journal_shift_day_key(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_volunteer_journal_shift() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_volunteer_journal_note() FROM PUBLIC;
