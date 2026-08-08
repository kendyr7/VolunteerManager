-- Phase 2 - Phone Identity Model

-- 1. Add Columns to volunteers table
ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_shared_phone BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_phone_owner_id UUID REFERENCES public.volunteers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_phone_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS shared_phone_authorized_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS shared_phone_authorized_at TIMESTAMPTZ NULL;

-- 2. Constraint: Audit trail required if is_shared_phone = true
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_shared_phone_audit'
  ) THEN
    ALTER TABLE public.volunteers
      ADD CONSTRAINT chk_shared_phone_audit
      CHECK (
        is_shared_phone = false
        OR (
          is_shared_phone = true
          AND shared_phone_reason IS NOT NULL
          AND shared_phone_authorized_by IS NOT NULL
          AND shared_phone_authorized_at IS NOT NULL
          AND shared_phone_owner_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- 3. Constraint: Cannot be own shared phone owner
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_shared_phone_owner_not_self'
  ) THEN
    ALTER TABLE public.volunteers
      ADD CONSTRAINT chk_shared_phone_owner_not_self
      CHECK (
        is_shared_phone = false
        OR shared_phone_owner_id IS DISTINCT FROM id
      );
  END IF;
END $$;

-- 4. Partial Unique Index: Only standard active volunteers must have unique phone_normalized
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_unique_active_phone
  ON public.volunteers (phone_normalized)
  WHERE status = 'active'
    AND is_shared_phone = false;
