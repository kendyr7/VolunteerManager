-- Phase 3 Step 2B Execution Audit Migration

ALTER TABLE public.phone_cleanup_review_items
  ADD COLUMN IF NOT EXISTS corrected_phone VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS processing_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_processing_status'
  ) THEN
    ALTER TABLE public.phone_cleanup_review_items
      ADD CONSTRAINT chk_processing_status
      CHECK (processing_status IN ('PENDING', 'APPROVED', 'PROCESSED', 'ERROR', 'REJECTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_cleanup_items_proc_status ON public.phone_cleanup_review_items(processing_status);
