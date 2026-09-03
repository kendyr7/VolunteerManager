-- Preserve the existing RLS behavior while removing redundant policy work.
ALTER POLICY "Autenticados pueden modificar turnos"
  ON public.shifts
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Lectores pueden ver turnos"
  ON public.shifts;

ALTER POLICY "Lectores pueden ver comites"
  ON public.committees
  USING ((SELECT auth.role()) = 'authenticated');

ALTER POLICY "Activity logs writable by administrators"
  ON public.activity_logs
  WITH CHECK ((SELECT auth.jwt() ->> 'app_role') = 'Admin');

DROP POLICY IF EXISTS "Requirements readable by all"
  ON public.committee_shift_requirements;

-- Keep the UNIQUE constraint-backed indexes and remove their exact copies.
DROP INDEX IF EXISTS public.idx_phone_cleanup_reviews_phone;
DROP INDEX IF EXISTS public.idx_profiles_phone;
