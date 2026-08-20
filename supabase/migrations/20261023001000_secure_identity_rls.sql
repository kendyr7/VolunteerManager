-- Remove anonymous Data API access to identity records. Browser requests carry
-- the application's signed Supabase-compatible JWT; server-only authentication
-- and WebAuthn operations use service_role.

ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.volunteers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.passkeys FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.volunteers TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.volunteers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.passkeys TO service_role;

DROP POLICY IF EXISTS "Volunteer records readable by app clients" ON public.volunteers;
DROP POLICY IF EXISTS "Lectura pública de volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "Lectores pueden ver voluntarios" ON public.volunteers;
DROP POLICY IF EXISTS "Voluntarios pueden leer su propio perfil" ON public.volunteers;

CREATE POLICY "Authenticated app users read permitted volunteers"
  ON public.volunteers
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT auth.jwt() ->> 'userType') = 'volunteer'
      AND id = (SELECT auth.uid())
    )
    OR (SELECT auth.jwt() ->> 'userType') = 'profile'
  );

DROP POLICY IF EXISTS "Lectura pública de profiles" ON public.profiles;
DROP POLICY IF EXISTS "Lectores pueden ver perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Escritura pública de profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles writable by administrators" ON public.profiles;

CREATE POLICY "Authenticated profiles read permitted profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.jwt() ->> 'userType') = 'profile'
    AND (
      id = (SELECT auth.uid())
      OR (SELECT auth.jwt() ->> 'app_role') IN ('Admin', 'Editor')
    )
  );

DROP POLICY IF EXISTS "Lectura pública de passkeys" ON public.passkeys;
DROP POLICY IF EXISTS "Escritura pública de passkeys" ON public.passkeys;
DROP POLICY IF EXISTS "Permitir acceso desde el servidor" ON public.passkeys;

-- No passkey policy is intentionally created. All access is server-side after
-- validating the application's HttpOnly session and, where applicable, row ownership.
