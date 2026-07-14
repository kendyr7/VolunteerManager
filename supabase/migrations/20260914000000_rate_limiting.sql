-- Create login_attempts table for rate limiting against brute force
CREATE TABLE IF NOT EXISTS login_attempts (
    phone TEXT PRIMARY KEY,
    attempts_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for login_attempts
ALTER TABLE IF EXISTS login_attempts ENABLE ROW LEVEL SECURITY;

-- Define Policies for login_attempts table (permits server queries)
DROP POLICY IF EXISTS "Acceso total a login_attempts" ON login_attempts;
CREATE POLICY "Acceso total a login_attempts" ON login_attempts FOR ALL USING (true);
