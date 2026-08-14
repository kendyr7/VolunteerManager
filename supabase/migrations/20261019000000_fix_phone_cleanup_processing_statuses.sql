-- Keep the database constraint aligned with the states used by the
-- phone-cleanup processor. The previous constraint rejected PROCESSING,
-- CONFLICT and REQUIRES_INFORMATION updates.

ALTER TABLE public.phone_cleanup_review_items
  DROP CONSTRAINT IF EXISTS chk_processing_status;

ALTER TABLE public.phone_cleanup_review_items
  ADD CONSTRAINT chk_processing_status
  CHECK (
    processing_status IN (
      'PENDING',
      'PROCESSING',
      'APPROVED',
      'PROCESSED',
      'ERROR',
      'CONFLICT',
      'REQUIRES_INFORMATION',
      'REJECTED'
    )
  );

