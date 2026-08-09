-- Migration: 20261006000000_volunteers_select_policy.sql
-- Description: Adds a public SELECT policy for public.volunteers to enable Supabase Realtime postgres_changes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'volunteers' 
      AND policyname = 'Lectura pública de volunteers'
  ) THEN
    CREATE POLICY "Lectura pública de volunteers"
    ON public.volunteers
    FOR SELECT
    USING (true);
  END IF;
END $$;
