-- Extends the import review queue to include possible duplicate people whose
-- names match closely even when their phone numbers are different.

ALTER TABLE public.volunteer_import_exceptions
  ADD COLUMN IF NOT EXISTS conflict_type text NOT NULL DEFAULT 'phone_conflict';

ALTER TABLE public.volunteer_import_exceptions
  ALTER COLUMN send_welcome_message SET DEFAULT false;

ALTER TABLE public.volunteer_import_exceptions
  DROP CONSTRAINT IF EXISTS volunteer_import_exceptions_conflict_type_check;

ALTER TABLE public.volunteer_import_exceptions
  ADD CONSTRAINT volunteer_import_exceptions_conflict_type_check
  CHECK (conflict_type IN ('phone_conflict', 'name_match'));

ALTER TABLE public.volunteer_import_exceptions
  DROP CONSTRAINT IF EXISTS volunteer_import_exceptions_resolution_check;

ALTER TABLE public.volunteer_import_exceptions
  ADD CONSTRAINT volunteer_import_exceptions_resolution_check
  CHECK (
    resolution IS NULL
    OR resolution IN ('shared_phone', 'corrected_phone', 'confirmed_distinct_person', 'rejected')
  );

CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_conflict_type
  ON public.volunteer_import_exceptions (conflict_type, status, submitted_at DESC);

COMMENT ON COLUMN public.volunteer_import_exceptions.conflict_type IS
  'Reason the row requires review: repeated phone or a possible duplicate name.';
