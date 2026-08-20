-- Migration: Secure system_settings RLS and enforce least privilege
-- Drops permissive policies, revokes all privileges from PUBLIC/anon/authenticated,
-- grants SELECT only to anon & authenticated, and enforces RLS for read-only clients.
-- All writes are handled exclusively via Server Actions using service_role.

-- 1. Drop all existing policies on system_settings
DROP POLICY IF EXISTS "System settings writable by all" ON public.system_settings;
DROP POLICY IF EXISTS "System settings writable by all authenticated users" ON public.system_settings;
DROP POLICY IF EXISTS "System settings writable by administrators" ON public.system_settings;
DROP POLICY IF EXISTS "System settings readable by authenticated profiles" ON public.system_settings;
DROP POLICY IF EXISTS "System settings readable by everyone" ON public.system_settings;
DROP POLICY IF EXISTS "System settings readable by all" ON public.system_settings;
DROP POLICY IF EXISTS "System settings readable by anon and authenticated" ON public.system_settings;

-- 2. Ensure RLS is enabled
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 3. Revoke all table privileges from PUBLIC, anon, authenticated
REVOKE ALL ON TABLE public.system_settings FROM PUBLIC, anon, authenticated;

-- 4. Grant strictly SELECT to anon and authenticated
GRANT SELECT ON TABLE public.system_settings TO anon, authenticated;

-- 5. Create explicit read policy for anon and authenticated
CREATE POLICY "System settings readable by anon and authenticated"
  ON public.system_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);
