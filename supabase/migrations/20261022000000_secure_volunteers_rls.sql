-- Migration: Secure volunteers writes and normalize Data API privileges.
--
-- The application still performs volunteer reads from browser clients using the
-- anon key and its own signed session cookie. Until those reads move behind a
-- server-side DAL (or the browser receives Supabase-compatible JWT claims),
-- SELECT must remain available to anon/authenticated clients. All mutations are
-- restricted to Server Actions that use service_role.

-- 1. Ensure RLS is enabled on volunteers
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;

-- 2. Remove inherited and direct privileges before granting the minimum needed.
REVOKE ALL ON TABLE public.volunteers FROM PUBLIC, anon, authenticated;

-- 3. Transitional read-only Data API access required by current browser flows.
GRANT SELECT ON TABLE public.volunteers TO anon, authenticated;

-- 4. Remove every legacy policy, including policies that used deprecated
-- auth.role() checks or allowed writes based on untrusted/missing JWT claims.
DROP POLICY IF EXISTS "Escritura pública de volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "Modificación de volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "Coordinadores pueden modificar voluntarios" ON public.volunteers;
DROP POLICY IF EXISTS "Lectores pueden ver voluntarios" ON public.volunteers;
DROP POLICY IF EXISTS "Lectura pública de volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "Voluntarios pueden leer su propio perfil" ON public.volunteers;

-- 5. Preserve only the read path needed by the current application. Table
-- privileges prevent INSERT/UPDATE/DELETE even if a future policy is added by
-- mistake; service_role bypasses RLS for authorized Server Actions.
CREATE POLICY "Volunteer records readable by app clients"
  ON public.volunteers
  FOR SELECT
  TO anon, authenticated
  USING (true);
