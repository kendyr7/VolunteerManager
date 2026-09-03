-- The unique index on (committee_id, shift_key) already covers lookups
-- that start with committee_id. Keep only the composite index.
DROP INDEX IF EXISTS public.idx_csr_committee_id;
