-- Create index for quick lookup of shifts by volunteer_id
CREATE INDEX IF NOT EXISTS idx_shifts_volunteer_id ON shifts(volunteer_id);

-- Create index for quick lookup of volunteers by committee_id (optimizes joins in dashboard)
CREATE INDEX IF NOT EXISTS idx_volunteers_committee_id ON volunteers(committee_id);

-- Create index for profiles by phone (optimizes coordinator login lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
