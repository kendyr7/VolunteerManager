-- Enable Row Level Security (RLS) for remaining tables
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS passkeys ENABLE ROW LEVEL SECURITY;

-- Define Policies for profiles table (permits server queries)
DROP POLICY IF EXISTS "Lectura pública de profiles" ON profiles;
CREATE POLICY "Lectura pública de profiles" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura pública de profiles" ON profiles;
CREATE POLICY "Escritura pública de profiles" ON profiles FOR ALL USING (true);

-- Define Policies for passkeys table (WebAuthn)
DROP POLICY IF EXISTS "Lectura pública de passkeys" ON passkeys;
CREATE POLICY "Lectura pública de passkeys" ON passkeys FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura pública de passkeys" ON passkeys;
CREATE POLICY "Escritura pública de passkeys" ON passkeys FOR ALL USING (true);
