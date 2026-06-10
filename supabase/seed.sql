-- Seed Data for VolunteerManager
-- 1. Insertar Turnos de Prueba (Shifts)
INSERT INTO shifts (id, date, shift_number, start_time, end_time, is_extended)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '2026-09-14', 1, '08:00', '12:00', false),
  ('22222222-2222-2222-2222-222222222222', '2026-09-14', 2, '11:00', '15:00', false),
  ('33333333-3333-3333-3333-333333333333', '2026-09-14', 3, '14:00', '18:00', false),
  ('44444444-4444-4444-4444-444444444444', '2026-09-14', 4, '17:00', '22:00', true);

-- 2. Insertar Shift Slots (Capacidades de comités por turno)
INSERT INTO shift_slots (id, shift_id, committee_id, capacity)
VALUES
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', (SELECT id FROM committees WHERE slug='historia'), 20),
  ('aaaa2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', (SELECT id FROM committees WHERE slug='historia'), 15),
  ('bbbb1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', (SELECT id FROM committees WHERE slug='seguridad'), 12),
  ('bbbb2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', (SELECT id FROM committees WHERE slug='seguridad'), 12),
  ('cccc1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', (SELECT id FROM committees WHERE slug='guia'), 50);

-- 3. Insertar Admin y Coordinadores Básicos
INSERT INTO volunteers (id, phone, pin_hash, first_name, last_name, role, committee_id, neighborhood)
VALUES
  ('99999999-9999-9999-9999-999999999999', '8888 0000', '1234', 'Admin', 'Sistema', 'admin', NULL, 'Central'),
  ('88888888-8888-8888-8888-888888888881', '8888 1111', '1234', 'Laura', 'Coordinadora Historia', 'coordinator', (SELECT id FROM committees WHERE slug='historia'), 'Norte'),
  ('88888888-8888-8888-8888-888888888882', '8888 2222', '1234', 'Andrés', 'Coordinador Seguridad', 'coordinator', (SELECT id FROM committees WHERE slug='seguridad'), 'Sur');

-- 4. Generar Voluntarios para Historia (20)
WITH names AS (
  SELECT ARRAY['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'] AS n,
         ARRAY['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'] AS l
),
gen_h AS (
  INSERT INTO volunteers (phone, pin_hash, first_name, last_name, role, committee_id)
  SELECT 
    '1000' || LPAD(seq::text, 4, '0'), 
    '1234', 
    (SELECT n[1 + (seq % 20)] FROM names), 
    (SELECT l[1 + ((seq * 7) % 20)] FROM names), 
    'volunteer', 
    (SELECT id FROM committees WHERE slug='historia')
  FROM generate_series(1, 20) AS seq
  RETURNING id
)
-- Inscribirlos al Turno 1 de Historia
INSERT INTO registrations (volunteer_id, slot_id, status)
SELECT id, 'aaaa1111-1111-1111-1111-111111111111', 'registered' FROM gen_h;

-- 5. Generar Voluntarios para Seguridad (12)
WITH names AS (
  SELECT ARRAY['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'] AS n,
         ARRAY['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'] AS l
),
gen_s AS (
  INSERT INTO volunteers (phone, pin_hash, first_name, last_name, role, committee_id)
  SELECT 
    '2000' || LPAD(seq::text, 4, '0'), 
    '1234', 
    (SELECT n[1 + ((seq + 5) % 20)] FROM names), 
    (SELECT l[1 + ((seq * 3) % 20)] FROM names), 
    'volunteer', 
    (SELECT id FROM committees WHERE slug='seguridad')
  FROM generate_series(1, 12) AS seq
  RETURNING id
)
-- Inscribirlos al Turno 1 de Seguridad
INSERT INTO registrations (volunteer_id, slot_id, status)
SELECT id, 'bbbb1111-1111-1111-1111-111111111111', 'confirmed' FROM gen_s;

-- 6. Generar Voluntarios para Guía (50)
WITH names AS (
  SELECT ARRAY['Alejandro', 'Sofia', 'Mateo', 'Valentina', 'Diego', 'Isabella', 'Daniel', 'Camila', 'Santiago', 'Mariana', 'Gabriel', 'Lucia', 'Lucas', 'Valeria', 'Tomas', 'Elena', 'Emilio', 'Martina', 'Nicolas', 'Victoria'] AS n,
         ARRAY['García', 'Martínez', 'Rodríguez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Silva', 'Rojas'] AS l
),
gen_g AS (
  INSERT INTO volunteers (phone, pin_hash, first_name, last_name, role, committee_id)
  SELECT 
    '3000' || LPAD(seq::text, 4, '0'), 
    '1234', 
    (SELECT n[1 + ((seq + 11) % 20)] FROM names), 
    (SELECT l[1 + ((seq * 13) % 20)] FROM names), 
    'volunteer', 
    (SELECT id FROM committees WHERE slug='guia')
  FROM generate_series(1, 50) AS seq
  RETURNING id
)
-- Inscribirlos al Turno 1 de Guía
INSERT INTO registrations (volunteer_id, slot_id, status)
SELECT id, 'cccc1111-1111-1111-1111-111111111111', 'registered' FROM gen_g;
