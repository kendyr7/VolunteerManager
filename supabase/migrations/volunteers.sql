-- Script SQL de importación masiva de voluntarios y turnos para Supabase / PostgreSQL
-- Generado automáticamente a partir de los datos de la plataforma

DO $$
DECLARE
  v_id UUID;
BEGIN

  -- ==========================================
  -- VOLUNTARIO 1: Dagoberto Santos Navarrete Mairena
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50586463344';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50586463344', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Dagoberto Santos', 'Navarrete Mairena', 30, 'Los laures', 'Villa flor', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 6. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 7. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 11. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 2: Augusto César Blanco Guillén
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584701400';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584701400', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Augusto César', 'Blanco Guillén', 22, 'San Judas', 'Universitaria', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T1');
  END IF;

  -- 5. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T2');
  END IF;

  -- 7. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 10. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 11. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 15. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 3: Génesis Paola Mejía Altamirano
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50585690250';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50585690250', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Génesis Paola', 'Mejía Altamirano', 30, 'Trinidad', 'Managua', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 3. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 4: Alisson Kristel Medina Mayorga
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50588345667';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50588345667', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Alisson Kristel', 'Medina Mayorga', 26, 'Rubén Dario', 'Las Américas', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 3. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 4. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 5: Anhia Luisayara Luna Aguilera
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50585943663';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50585943663', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Anhia Luisayara', 'Luna Aguilera', 21, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 2. Registrar al Turno 2 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T2');
  END IF;

  -- 3. Registrar al Turno 2 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T2');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T2');
  END IF;

  -- 5. Registrar al Turno 2 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T2');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T2');
  END IF;

  -- 7. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 8. Registrar al Turno 2 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T2');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T2');
  END IF;

  -- 10. Registrar al Turno 2 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T2');
  END IF;

  -- 11. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 12. Registrar al Turno 2 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T2');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 6: José Luis López López
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50558272079';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50558272079', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'José Luis', 'López López', 17, '4 esquinas', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 7: Eliasyd Josué Putoy López
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50557216473';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50557216473', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Eliasyd Josué', 'Putoy López', 20, '4Esquinas', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 4. Registrar al Turno 4 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T4');
  END IF;

  -- 5. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 6. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 7. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 10. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 11. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 15. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 8: Brisa Elena Ñurinda López
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584104514';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584104514', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Brisa Elena', 'Ñurinda López', 24, 'Nindiri', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 9: Ana Luisa Contreras Rosales
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50588593810';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50588593810', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Ana Luisa', 'Contreras Rosales', 50, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 10: Eduardo Serrano
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584814435';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584814435', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Eduardo', 'Serrano', 25, 'Por definir', 'Por definir', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 11: Kendyr Gabriel Quintanilla Estrada
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50578912506';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50578912506', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Kendyr Gabriel', 'Quintanilla Estrada', 27, 'Nindirí', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T4');
  END IF;

  -- 3. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 4. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 5. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 6. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 10. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 11. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 12. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 15. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 16. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 17. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 18. Registrar al Turno 2 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T2');
  END IF;

  -- 19. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 20. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 21. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 22. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 23. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 24. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 12: Jonathan Alejandro Ruiz Paramo
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584333820';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584333820', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Jonathan Alejandro', 'Ruiz Paramo', 33, 'Las Sabogales', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 4. Registrar al Turno 4 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T4');
  END IF;

  -- 5. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 6. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 7. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 10. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 11. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 13: Ingrid Carreon 
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50557675491';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50557675491', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Ingrid', 'Carreon', 25, 'Por definir', 'Por definir', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 14: Lais Cuarezma 
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50585357764';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50585357764', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Lais', 'Cuarezma', 25, 'Por definir', 'Por definir', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 15: Miguel Abraham Orozco Cubillo
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50558071293';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50558071293', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Miguel Abraham', 'Orozco Cubillo', 22, 'Ruben Dario', 'Las Americas', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T1');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T1');
  END IF;

  -- 5. Registrar al Turno 1 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T1');
  END IF;

  -- 6. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T1');
  END IF;

  -- 8. Registrar al Turno 1 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T1');
  END IF;

  -- 9. Registrar al Turno 1 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T1');
  END IF;

  -- 10. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 11. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 16: Tatiana Alejandra Cuadra Cuadra
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50581889336';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50581889336', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Tatiana Alejandra', 'Cuadra Cuadra', 17, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 17: Darling Fernanda Maltez Calero
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50577449163';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50577449163', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Darling Fernanda', 'Maltez Calero', 26, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 5. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 7. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 8. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 10. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 11. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 13. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 18: Kenner Samuel Quintanilla Estrada
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50581616943';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50581616943', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Kenner Samuel', 'Quintanilla Estrada', 23, 'Nindiri', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 19: Saríah Elizabeth Contreras Quintero
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50589917453';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50589917453', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Saríah Elizabeth', 'Contreras Quintero', 26, 'Las Sabogales', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 2. Registrar al Turno 2 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T2');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 8. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 11. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 12. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 15. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 16. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 17. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 18. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 19. Registrar al Turno 1 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 20: Carlos Daniel Orozco Cubillo
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50585151792';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50585151792', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Carlos Daniel', 'Orozco Cubillo', 27, 'Rubén Dario', 'Las Américas', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 21: Astrania Yalitza Hernandez Moreno
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50589536124';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50589536124', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Astrania Yalitza', 'Hernandez Moreno', 20, 'Altagracia', 'Universitaria', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T1');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T1');
  END IF;

  -- 5. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 6. Registrar al Turno 1 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T1');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T1');
  END IF;

  -- 8. Registrar al Turno 1 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T1');
  END IF;

  -- 9. Registrar al Turno 1 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T1');
  END IF;

  -- 10. Registrar al Turno 1 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T1');
  END IF;

  -- 11. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 12. Registrar al Turno 1 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T1');
  END IF;

  -- 13. Registrar al Turno 1 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T1');
  END IF;

  -- 14. Registrar al Turno 1 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T1');
  END IF;

  -- 15. Registrar al Turno 1 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 22: Yuleydis de los Angeles Fernández Bonilla
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50589926358';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50589926358', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Yuleydis de los', 'Angeles Fernández Bonilla', 25, 'La trinidad', 'Managua', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 23: Giuliana Sarahí Gaitán Lara
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50581033483';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50581033483', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Giuliana Sarahí', 'Gaitán Lara', 17, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 7. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T2');
  END IF;

  -- 10. Registrar al Turno 2 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T2');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 24: Luis Cuarezma
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50558697764';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50558697764', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Luis', 'Cuarezma', 25, 'Por definir', 'Por definir', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 25: Nubia Yuleybi Selva Jaenscthke
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50581859748';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50581859748', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Nubia Yuleybi', 'Selva Jaenscthke', 39, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T1');
  END IF;

  -- 5. Registrar al Turno 1 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T1');
  END IF;

  -- 6. Registrar al Turno 1 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T1');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T1');
  END IF;

  -- 8. Registrar al Turno 1 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T1');
  END IF;

  -- 9. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 10. Registrar al Turno 1 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T1');
  END IF;

  -- 11. Registrar al Turno 1 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T1');
  END IF;

  -- 12. Registrar al Turno 1 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T1');
  END IF;

  -- 13. Registrar al Turno 1 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T1');
  END IF;

  -- 14. Registrar al Turno 1 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T1');
  END IF;

  -- 15. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 26: Luz María Rayo Navarrete
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50588728192';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50588728192', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Luz María', 'Rayo Navarrete', 33, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 3. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T1');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 12. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 16. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 17. Registrar al Turno 4 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T4');
  END IF;

  -- 18. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 19. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 20. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 21. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 22. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 23. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 24. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- 25. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 26. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 27. Registrar al Turno 4 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T4');
  END IF;

  -- 28. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 29. Registrar al Turno 4 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T4');
  END IF;

  -- 30. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 31. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 32. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 33. Registrar al Turno 4 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T4');
  END IF;

  -- 34. Registrar al Turno 4 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T4');
  END IF;

  -- 35. Registrar al Turno 4 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 27: Carolina del Carmen Castrillo López
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50583313746';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50583313746', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Carolina del', 'Carmen Castrillo López', 34, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 8. Registrar al Turno 2 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T2');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T2');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 11. Registrar al Turno 2 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T2');
  END IF;

  -- 12. Registrar al Turno 2 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T2');
  END IF;

  -- 13. Registrar al Turno 2 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T2');
  END IF;

  -- 14. Registrar al Turno 2 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T2');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 28: Litzy Zitlialy Miranda Bejarano
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50586710540';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50586710540', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Litzy Zitlialy', 'Miranda Bejarano', 18, 'San miguel', 'Estaca masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 2. Registrar al Turno 2 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T2');
  END IF;

  -- 3. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 5. Registrar al Turno 2 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T2');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T2');
  END IF;

  -- 7. Registrar al Turno 2 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T2');
  END IF;

  -- 8. Registrar al Turno 2 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T2');
  END IF;

  -- 9. Registrar al Turno 2 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T2');
  END IF;

  -- 10. Registrar al Turno 2 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T2');
  END IF;

  -- 11. Registrar al Turno 2 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T2');
  END IF;

  -- 12. Registrar al Turno 2 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T2');
  END IF;

  -- 13. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 14. Registrar al Turno 1 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T1');
  END IF;

  -- 15. Registrar al Turno 1 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T1');
  END IF;

  -- 16. Registrar al Turno 1 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T1');
  END IF;

  -- 17. Registrar al Turno 1 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T1');
  END IF;

  -- 18. Registrar al Turno 1 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T1');
  END IF;

  -- 19. Registrar al Turno 1 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T1');
  END IF;

  -- 20. Registrar al Turno 1 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T1');
  END IF;

  -- 21. Registrar al Turno 1 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T1');
  END IF;

  -- 22. Registrar al Turno 1 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T1');
  END IF;

  -- 23. Registrar al Turno 1 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T1');
  END IF;

  -- 24. Registrar al Turno 1 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 29: Darling de los Ángeles Romero
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50586909657';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50586909657', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Darling de', 'los Ángeles Romero', 25, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 5. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 15. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 16. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 17. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 30: Karina Iraida Garzón Delgado
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584169960';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584169960', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Karina Iraida', 'Garzón Delgado', 38, 'Las Sabogales', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 10. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 11. Registrar al Turno 1 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T1');
  END IF;

  -- 12. Registrar al Turno 1 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T1');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 14. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 31: Juan Pablo Hernandez Davila
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50557736582';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50557736582', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Juan Pablo', 'Hernandez Davila', 27, 'Ruben Darío', 'Las Américas', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 3. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 4. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 32: Muriel Valeria Contreras Sanchez
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50577936005';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50577936005', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Muriel Valeria', 'Contreras Sanchez', 19, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 6. Registrar al Turno 2 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T2');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 11. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 14. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 33: María Mercedes Córdoba Galeano
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50582647688';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50582647688', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'María Mercedes', 'Córdoba Galeano', 28, 'Ciudadela', 'Americas', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 2. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 34: Wendy Nicole Lovo Casaya
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50582551835';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50582551835', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Wendy Nicole', 'Lovo Casaya', 18, 'Altagracia', 'Universitaria', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 1 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T1');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 3. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T1');
  END IF;

  -- 5. Registrar al Turno 1 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T1');
  END IF;

  -- 6. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T1');
  END IF;

  -- 8. Registrar al Turno 1 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T1');
  END IF;

  -- 9. Registrar al Turno 1 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T1');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 35: Carlos Said Padilla Cuadra
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50586619334';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50586619334', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Carlos Said', 'Padilla Cuadra', 20, 'Masaya', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 2. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 5. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 7. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-18
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 18', 'T3');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 10. Registrar al Turno 3 del 2026-09-21
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 21', 'T3');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-22
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 22', 'T3');
  END IF;

  -- 12. Registrar al Turno 3 del 2026-09-23
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 23', 'T3');
  END IF;

  -- 13. Registrar al Turno 3 del 2026-09-24
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 24', 'T3');
  END IF;

  -- 14. Registrar al Turno 4 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T4');
  END IF;

  -- 15. Registrar al Turno 3 del 2026-09-25
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 25', 'T3');
  END IF;

  -- 16. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 17. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 36: Jorge Luis Rodriguez Meneses
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50577841267';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50577841267', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Jorge Luis', 'Rodriguez Meneses', 37, 'Cuatro Esquinas', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 37: Danelia Elieth Contreras Quintero
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50576739046';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50576739046', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Danelia Elieth', 'Contreras Quintero', 23, 'Las Sabogales', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 2 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T2');
  END IF;

  -- 2. Registrar al Turno 1 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T1');
  END IF;

  -- 3. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 4. Registrar al Turno 1 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T1');
  END IF;

  -- 5. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 6. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 7. Registrar al Turno 1 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T1');
  END IF;

  -- 8. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 9. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- ==========================================
  -- VOLUNTARIO 38: Rachel Aracelly López Robles
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50587016372';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50587016372', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Rachel Aracelly', 'López Robles', 20, 'Las Flores', 'Masaya', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- Sin turnos registrados para este voluntario

  -- ==========================================
  -- VOLUNTARIO 39: Ada Lucía Valverde Mejía
  -- ==========================================
  -- 1. Insertar voluntario o recuperar ID si ya existe
  SELECT id INTO v_id FROM volunteers WHERE phone = '+50584494105';
  IF v_id IS NULL THEN
    INSERT INTO volunteers (phone, pin, first_name, last_name, age, neighborhood, stake, committee_id)
    VALUES ('+50584494105', LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'), 'Ada Lucía', 'Valverde Mejía', 27, 'Monserrat', 'Universitaria', (SELECT id FROM committees WHERE name='Historia'))
    RETURNING id INTO v_id;
  END IF;

  -- 1. Registrar al Turno 2 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T2');
  END IF;

  -- 2. Registrar al Turno 3 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T3');
  END IF;

  -- 3. Registrar al Turno 4 del 2026-09-10
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 10', 'T4');
  END IF;

  -- 4. Registrar al Turno 2 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T2');
  END IF;

  -- 5. Registrar al Turno 3 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T3');
  END IF;

  -- 6. Registrar al Turno 4 del 2026-09-11
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'vie 11', 'T4');
  END IF;

  -- 7. Registrar al Turno 2 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T2');
  END IF;

  -- 8. Registrar al Turno 3 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T3');
  END IF;

  -- 9. Registrar al Turno 4 del 2026-09-12
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 12', 'T4');
  END IF;

  -- 10. Registrar al Turno 2 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T2');
  END IF;

  -- 11. Registrar al Turno 3 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T3');
  END IF;

  -- 12. Registrar al Turno 4 del 2026-09-14
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'lun 14', 'T4');
  END IF;

  -- 13. Registrar al Turno 2 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T2');
  END IF;

  -- 14. Registrar al Turno 3 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T3');
  END IF;

  -- 15. Registrar al Turno 4 del 2026-09-15
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mar 15', 'T4');
  END IF;

  -- 16. Registrar al Turno 2 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T2');
  END IF;

  -- 17. Registrar al Turno 3 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T3');
  END IF;

  -- 18. Registrar al Turno 4 del 2026-09-16
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'mié 16', 'T4');
  END IF;

  -- 19. Registrar al Turno 2 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T2');
  END IF;

  -- 20. Registrar al Turno 3 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T3');
  END IF;

  -- 21. Registrar al Turno 4 del 2026-09-17
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'jue 17', 'T4');
  END IF;

  -- 22. Registrar al Turno 2 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T2');
  END IF;

  -- 23. Registrar al Turno 3 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T3');
  END IF;

  -- 24. Registrar al Turno 4 del 2026-09-19
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 19', 'T4');
  END IF;

  -- 25. Registrar al Turno 2 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T2');
  END IF;

  -- 26. Registrar al Turno 3 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T3');
  END IF;

  -- 27. Registrar al Turno 4 del 2026-09-26
  IF v_id IS NOT NULL THEN
    INSERT INTO shifts (volunteer_id, day_key, shift_key)
    VALUES (v_id, 'sáb 26', 'T4');
  END IF;

END $$;

