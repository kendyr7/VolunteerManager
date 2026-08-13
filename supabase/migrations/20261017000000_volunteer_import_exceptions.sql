-- Persistent review queue for volunteer imports whose phone is already used by
-- another active profile. Normal rows continue to import immediately; phone
-- conflicts remain here until an administrator resolves them.

CREATE TABLE IF NOT EXISTS public.volunteer_import_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  source_row integer,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  age integer,
  neighborhood text,
  stake text,
  committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
  conflicting_volunteer_id uuid REFERENCES public.volunteers(id) ON DELETE SET NULL,
  send_welcome_message boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  resolution text,
  corrected_phone text,
  created_volunteer_id uuid REFERENCES public.volunteers(id) ON DELETE SET NULL,
  submitted_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by_name text NOT NULL,
  submitted_by_role text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_by_role text,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_import_exceptions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT volunteer_import_exceptions_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('shared_phone', 'corrected_phone', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_pending
  ON public.volunteer_import_exceptions (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_phone
  ON public.volunteer_import_exceptions (phone_normalized, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_import_exceptions_unique_pending_person
  ON public.volunteer_import_exceptions (
    phone_normalized,
    lower(first_name),
    lower(last_name),
    coalesce(committee_id::text, '')
  )
  WHERE status = 'pending';

ALTER TABLE public.volunteer_import_exceptions ENABLE ROW LEVEL SECURITY;

-- The app authenticates through its signed Next.js session cookie. All access
-- to this queue therefore goes through authorized server actions using the
-- service-role client; it is never exposed directly to browser clients.
REVOKE ALL ON TABLE public.volunteer_import_exceptions FROM anon, authenticated;

COMMENT ON TABLE public.volunteer_import_exceptions IS
  'Volunteer import rows awaiting administrator review because their phone is shared with an active profile.';
