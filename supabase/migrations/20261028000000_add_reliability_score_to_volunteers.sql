-- Add reliability_score to volunteers table
ALTER TABLE public.volunteers 
ADD COLUMN IF NOT EXISTS reliability_score INTEGER DEFAULT 100;

ALTER TABLE public.volunteers
ALTER COLUMN reliability_score SET DEFAULT 100;

UPDATE public.volunteers
SET reliability_score = 100
WHERE reliability_score IS NULL;

ALTER TABLE public.volunteers
ALTER COLUMN reliability_score SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteers_reliability_score_range'
      AND conrelid = 'public.volunteers'::regclass
  ) THEN
    ALTER TABLE public.volunteers
    ADD CONSTRAINT volunteers_reliability_score_range
    CHECK (reliability_score BETWEEN 0 AND 100);
  END IF;
END
$$;

COMMENT ON COLUMN public.volunteers.reliability_score IS 'Score of attendance reliability (0-100), based on completed vs missed shifts against total commitment.';
