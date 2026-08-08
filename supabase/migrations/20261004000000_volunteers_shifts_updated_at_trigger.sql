-- Migration: 20261004000000_volunteers_shifts_updated_at_trigger.sql
-- Description: Adds updated_at columns and PostgreSQL BEFORE UPDATE triggers to volunteers and shifts tables.

-- 1. Ensure updated_at column exists on public.volunteers
ALTER TABLE public.volunteers 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure updated_at column exists on public.shifts
ALTER TABLE public.shifts 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Backfill existing records to ensure zero NULL values
UPDATE public.volunteers 
  SET updated_at = COALESCE(created_at, NOW()) 
  WHERE updated_at IS NULL;

UPDATE public.shifts 
  SET updated_at = NOW() 
  WHERE updated_at IS NULL;

-- 4. Create or replace central PL/pgSQL trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach trigger to public.volunteers
DROP TRIGGER IF EXISTS trg_volunteers_updated_at ON public.volunteers;
CREATE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON public.volunteers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Attach trigger to public.shifts
DROP TRIGGER IF EXISTS trg_shifts_updated_at ON public.shifts;
CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
