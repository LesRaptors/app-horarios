-- Test: save_staffing_diff aplica diff correctamente y setea updated_by.
-- Patrón BEGIN/ROLLBACK para no afectar datos reales.
-- NOTA: dentro de la transacción se borran todas las filas de staffing de la sede
-- para tener estado limpio. El ROLLBACK final deja la BD intacta.

BEGIN;

-- Setup: tomar IDs reales existentes (admin profile + 1 location + 2 positions + 1 shift template).
-- Si tu DB de prueba está vacía, deberías crear un seed antes; aquí asumimos data básica.
DO $$
DECLARE
  v_admin_id UUID;
  v_location_id UUID;
  v_pos1 UUID;
  v_pos2 UUID;
  v_shift UUID;
  v_result JSONB;
  v_count INT;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_location_id FROM locations LIMIT 1;
  SELECT p.id INTO v_pos1 FROM positions p JOIN departments d ON d.id = p.department_id WHERE d.location_id = v_location_id LIMIT 1;
  SELECT p.id INTO v_pos2 FROM positions p JOIN departments d ON d.id = p.department_id WHERE d.location_id = v_location_id AND p.id <> v_pos1 LIMIT 1;
  SELECT id INTO v_shift FROM shift_templates WHERE location_id = v_location_id LIMIT 1;

  IF v_admin_id IS NULL OR v_location_id IS NULL OR v_pos1 IS NULL OR v_pos2 IS NULL OR v_shift IS NULL THEN
    RAISE NOTICE 'Skip: faltan datos seed (admin/location/positions/shift) — re-correr en una DB con datos.';
    RETURN;
  END IF;

  -- Limpiar TODAS las filas de la sede para estado conocido (seguro: estamos en BEGIN/ROLLBACK).
  DELETE FROM staffing_requirements WHERE location_id = v_location_id;

  -- Pre-poblar exactamente 2 rows.
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count)
    VALUES (v_location_id, v_pos1, v_shift, 1, 3);
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count)
    VALUES (v_location_id, v_pos2, v_shift, 2, 4);

  -- Simular auth.uid() = admin (la fn usa auth.uid()). En este test, reemplazamos vía SET LOCAL.
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Llamar el RPC: actualiza pos1/day1 a 7, borra pos2/day2 (ausente en payload), inserta pos1/day3=5.
  v_result := save_staffing_diff(
    v_location_id,
    jsonb_build_array(
      jsonb_build_object('position_id', v_pos1, 'shift_template_id', v_shift, 'day_of_week', 1, 'required_count', 7),
      jsonb_build_object('position_id', v_pos1, 'shift_template_id', v_shift, 'day_of_week', 3, 'required_count', 5)
    )
  );

  ASSERT (v_result->>'inserted')::INT = 1, format('Esperaba inserted=1, obtuvo %s', v_result->>'inserted');
  ASSERT (v_result->>'updated')::INT = 1, format('Esperaba updated=1, obtuvo %s', v_result->>'updated');
  ASSERT (v_result->>'deleted')::INT = 1, format('Esperaba deleted=1, obtuvo %s', v_result->>'deleted');

  -- updated_by se setea.
  SELECT count(*) INTO v_count
    FROM staffing_requirements
   WHERE location_id = v_location_id
     AND position_id = v_pos1
     AND day_of_week = 1
     AND required_count = 7
     AND updated_by = v_admin_id;
  ASSERT v_count = 1, 'updated_by no se seteó al admin';

  -- pos2/day2 fue borrado.
  SELECT count(*) INTO v_count
    FROM staffing_requirements
   WHERE location_id = v_location_id AND position_id = v_pos2 AND day_of_week = 2;
  ASSERT v_count = 0, 'pos2/day2 debio borrarse';

  RAISE NOTICE 'save_staffing_diff_test: PASS';
END $$;

ROLLBACK;
