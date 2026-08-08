-- Phase 3: Person-Centric Phone Cleanup Incremental Migration (Strict Legacy-Preserving)

-- 1. Ensure parent table exists
CREATE TABLE IF NOT EXISTS public.phone_cleanup_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized VARCHAR(20) NOT NULL UNIQUE,
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  confidence TEXT NOT NULL DEFAULT 'MEDIUM',
  review_status TEXT NOT NULL DEFAULT 'DRAFT',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewer_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_cleanup_reviews_phone ON public.phone_cleanup_reviews(phone_normalized);

-- 2. Ensure child items table exists with legacy columns preserved
CREATE TABLE IF NOT EXISTS public.phone_cleanup_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.phone_cleanup_reviews(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  proposed_action TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  approved_action TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  shared_phone_owner_id UUID REFERENCES public.volunteers(id) ON DELETE SET NULL,
  corrected_phone VARCHAR(20) DEFAULT NULL,
  reviewer_comment TEXT,
  processing_status TEXT NOT NULL DEFAULT 'PENDING',
  processing_error TEXT DEFAULT NULL,
  processed_at TIMESTAMPTZ DEFAULT NULL,
  processed_by TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unq_item_volunteer_review UNIQUE (review_id, volunteer_id)
);

-- 3. INCREMENTAL COLUMNS ADDITION (NULLABLE FOR LEGACY ROWS - NO ARTIFICIAL DECISIONS FORCED)
ALTER TABLE public.phone_cleanup_review_items 
  ADD COLUMN IF NOT EXISTS original_phone VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS decision TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_status TEXT NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duplicate_primary_volunteer_id UUID REFERENCES public.volunteers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'LEGACY';

-- 4. POPULATE original_phone FROM VOLUNTEERS WITHOUT ALTERING VOLUNTEERS OR FORCING DECISIONS
UPDATE public.phone_cleanup_review_items i
SET original_phone = v.phone
FROM public.volunteers v
WHERE i.volunteer_id = v.id AND i.original_phone IS NULL;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_phone_cleanup_items_review_id ON public.phone_cleanup_review_items(review_id);
CREATE INDEX IF NOT EXISTS idx_phone_cleanup_items_volunteer_id ON public.phone_cleanup_review_items(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_phone_cleanup_items_proc_status ON public.phone_cleanup_review_items(processing_status);
CREATE INDEX IF NOT EXISTS idx_phone_cleanup_items_status ON public.phone_cleanup_review_items(status);
