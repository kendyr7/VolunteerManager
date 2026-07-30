-- Migration: Add reason column to shift_change_requests table
ALTER TABLE public.shift_change_requests 
ADD COLUMN IF NOT EXISTS reason TEXT;
