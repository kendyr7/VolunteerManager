-- Alter shifts table to add attendance columns
ALTER TABLE shifts 
ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES profiles(id);

-- Create index for quick lookup of attendance records
CREATE INDEX IF NOT EXISTS idx_shifts_checked_in ON shifts(checked_in);
