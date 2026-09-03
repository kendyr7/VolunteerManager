-- Put the auth function call itself behind an initPlan so PostgreSQL
-- evaluates JWT/UID access once per statement instead of once per row.
ALTER POLICY "Activity logs writable by administrators"
  ON public.activity_logs
  WITH CHECK (((SELECT auth.jwt()) ->> 'app_role') = 'Admin');

ALTER POLICY "Authenticated app users read permitted volunteers"
  ON public.volunteers
  USING (
    (
      ((SELECT auth.jwt()) ->> 'userType') = 'volunteer'
      AND id = (SELECT auth.uid())
    )
    OR ((SELECT auth.jwt()) ->> 'userType') = 'profile'
  );

ALTER POLICY "Authenticated profiles read permitted profiles"
  ON public.profiles
  USING (
    ((SELECT auth.jwt()) ->> 'userType') = 'profile'
    AND (
      id = (SELECT auth.uid())
      OR ((SELECT auth.jwt()) ->> 'app_role') = ANY (ARRAY['Admin'::text, 'Editor'::text])
    )
  );

ALTER POLICY "Authorized users read committee areas"
  ON public.committee_areas
  USING (
    ((SELECT auth.jwt()) ->> 'app_role') = 'Admin'
    OR (
      ((SELECT auth.jwt()) ->> 'userType') = 'profile'
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = (SELECT auth.uid())
          AND profile.role = 'Editor'::public.user_role
          AND profile.coordinator_type = 'committee'
          AND profile.committee_id = committee_areas.committee_id
          AND COALESCE(profile.status, 'active') <> 'archived'
      )
    )
    OR (
      ((SELECT auth.jwt()) ->> 'userType') = 'volunteer'
      AND EXISTS (
        SELECT 1
        FROM public.volunteers AS volunteer
        WHERE volunteer.id = (SELECT auth.uid())
          AND volunteer.committee_id = committee_areas.committee_id
          AND COALESCE(volunteer.status, 'active') <> 'archived'
      )
    )
  );
