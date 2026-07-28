-- Migration: Add status column to committees table for archiving
ALTER TABLE public.committees ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
UPDATE public.committees SET status = 'active' WHERE status IS NULL;
