-- Migration: 20261005000000_enable_realtime_publication.sql
-- Description: Enables PostgreSQL Supabase Realtime (postgres_changes) for volunteers and shifts tables idempotently.

DO $$
BEGIN
  -- 1. Add public.volunteers to supabase_realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'volunteers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.volunteers;
  END IF;

  -- 2. Add public.shifts to supabase_realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
  END IF;
END $$;
