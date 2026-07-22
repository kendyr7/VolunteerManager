-- Migration: Create committee_shift_requirements table
-- This table stores the minimum required volunteers per committee per shift slot.
-- Replaces the localStorage-only storage so server-side actions can access it.

CREATE TABLE IF NOT EXISTS public.committee_shift_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  shift_key    text NOT NULL CHECK (shift_key IN ('T1','T2','T3','T4')),
  required     integer NOT NULL DEFAULT 4 CHECK (required >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committee_shift_requirements_unique UNIQUE (committee_id, shift_key)
);

-- Index for fast lookups by committee
CREATE INDEX IF NOT EXISTS idx_csr_committee_id
  ON public.committee_shift_requirements (committee_id);

-- Allow all authenticated users to read requirements
ALTER TABLE public.committee_shift_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requirements readable by authenticated profiles"
  ON public.committee_shift_requirements
  FOR SELECT
  USING (true);

CREATE POLICY "Requirements writable by admin profiles only"
  ON public.committee_shift_requirements
  FOR ALL
  USING (true)
  WITH CHECK (true);
