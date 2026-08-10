-- Migration: 20261010000000_attendance_sessions.sql
-- Description: Creates attendance_sessions table as the Single Source of Truth for physical attendance
-- Security: Defense-in-depth with strict RLS enabled, NO public policies, and REVOKE on PUBLIC, anon, authenticated.

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  day_key VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  auto_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Status integrity constraint
  CONSTRAINT chk_attendance_session_status CHECK (status IN ('open', 'completed')),
  
  -- Open vs Completed ended_at consistency constraint
  CONSTRAINT chk_attendance_session_open_ended CHECK (
    (status = 'open' AND ended_at IS NULL) OR 
    (status = 'completed' AND ended_at IS NOT NULL)
  ),

  -- Chronology integrity constraint: ended_at >= started_at
  CONSTRAINT chk_attendance_session_chronology CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);

-- Partial unique index: Enforce AT MOST ONE open session per volunteer simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_attendance_session_per_volunteer 
ON public.attendance_sessions (volunteer_id) 
WHERE status = 'open';

-- Index for fast lookup by volunteer and day_key
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_volunteer_day 
ON public.attendance_sessions (volunteer_id, day_key);

-- ----------------------------------------------------------------------
-- HARDENED DEFENSE-IN-DEPTH SECURITY & PRIVILEGES
-- ----------------------------------------------------------------------

-- 1. Enable Row Level Security (RLS)
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all direct permissions from PUBLIC, anon, and authenticated roles
REVOKE ALL ON TABLE public.attendance_sessions FROM PUBLIC, anon, authenticated;

-- 3. Grant full permissions exclusively to service_role (used by authorized Server Actions)
GRANT ALL ON TABLE public.attendance_sessions TO service_role;

-- 4. NO public or authenticated policies are created. 
-- Direct REST calls from browser using anon/authenticated keys are blocked 100%.
-- Server Actions bypass RLS via service_role key securely on Node.js backend.
