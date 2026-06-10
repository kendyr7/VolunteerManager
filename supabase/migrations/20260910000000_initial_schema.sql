-- Tipos y Enums
CREATE TYPE role_enum AS ENUM ('volunteer', 'coordinator', 'admin');
CREATE TYPE registration_status AS ENUM ('registered', 'confirmed', 'absent', 'replaced');

-- Committees
CREATE TABLE committees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
);

-- Volunteers
-- Nota: Aunque usemos RLS, si se maneja autenticación custom en Next.js, 
-- el RLS puede requerir variables de sesión de Postgres personalizadas o usar roles de base de datos.
CREATE TABLE volunteers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER,
    neighborhood TEXT,
    stake TEXT,
    committee_id UUID REFERENCES committees(id),
    role role_enum DEFAULT 'volunteer',
    reliability_score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shifts
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    shift_number INTEGER NOT NULL CHECK (shift_number BETWEEN 1 AND 4),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_extended BOOLEAN DEFAULT FALSE
);

-- Shift Slots
CREATE TABLE shift_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
    committee_id UUID REFERENCES committees(id) ON DELETE CASCADE,
    capacity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(shift_id, committee_id)
);

-- Registrations
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id UUID REFERENCES volunteers(id) ON DELETE CASCADE,
    slot_id UUID REFERENCES shift_slots(id) ON DELETE CASCADE,
    status registration_status DEFAULT 'registered',
    replaced_by UUID REFERENCES volunteers(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(volunteer_id, slot_id)
);

-- Insertar comités iniciales
INSERT INTO committees (name, slug) VALUES 
('Historia', 'historia'),
('Seguridad', 'seguridad'),
('Transporte', 'transporte'),
('Traducción', 'traduccion'),
('Guía', 'guia');

-- Función atómica para inscripción de voluntarios
CREATE OR REPLACE FUNCTION register_volunteer(
  p_volunteer_id uuid, p_slot_id uuid
) RETURNS json AS $$
DECLARE 
  current_count int;  
  cap int;
BEGIN
  -- Bloquea el registro del slot para evitar condiciones de carrera
  SELECT capacity INTO cap FROM shift_slots WHERE id = p_slot_id FOR UPDATE;
  
  -- Cuenta los voluntarios ya inscritos
  SELECT COUNT(*) INTO current_count FROM registrations
    WHERE slot_id = p_slot_id AND status != 'absent';
    
  IF current_count >= cap THEN
    RETURN json_build_object('success', false, 'error', 'slot_full');
  END IF;
  
  INSERT INTO registrations (volunteer_id, slot_id, status)
    VALUES (p_volunteer_id, p_slot_id, 'registered');
    
  RETURN json_build_object('success', true);
END; 
$$ LANGUAGE plpgsql;

-- Políticas de RLS (Row Level Security) básicas
ALTER TABLE committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Por el momento creamos políticas permisivas para lectura.
-- Las políticas restrictivas exactas pueden ajustarse luego dependiendo de cómo
-- generemos el JWT custom o conectemos Next.js con Supabase Auth.
CREATE POLICY "Lectura pública de comités" ON committees FOR SELECT USING (true);
CREATE POLICY "Lectura pública de shifts" ON shifts FOR SELECT USING (true);
