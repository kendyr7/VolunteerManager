-- Alter shifts table to add checkout columns
ALTER TABLE shifts 
ADD COLUMN IF NOT EXISTS checked_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

-- Create index for quick lookup of checkout records
CREATE INDEX IF NOT EXISTS idx_shifts_checked_out ON shifts(checked_out);
