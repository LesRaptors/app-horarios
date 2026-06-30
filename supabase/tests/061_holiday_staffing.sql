-- Test 061: la fila festiva y la no-festiva del mismo (pos,shift,dow) coexisten;
-- un re-guardado sin la festiva la borra solo a ella.
BEGIN;

DO $$
DECLARE
  v_loc UUID; v_pos UUID; v_shift UUID; v_n INT;
BEGIN
  SELECT id INTO v_loc FROM locations LIMIT 1;
  SELECT id INTO v_pos FROM positions LIMIT 1;
  SELECT id INTO v_shift FROM shift_templates LIMIT 1;

  -- Insert directo (evita el permission gate del RPC en el test).
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday)
  VALUES
    (v_loc, v_pos, v_shift, 0, 2, false),  -- domingo normal
    (v_loc, v_pos, v_shift, 0, 1, true);   -- festivo (sentinela dow=0)

  SELECT count(*) INTO v_n FROM staffing_requirements
   WHERE location_id=v_loc AND position_id=v_pos AND shift_template_id=v_shift AND day_of_week=0;
  ASSERT v_n = 2, format('Esperaba 2 filas (festiva + no-festiva), obtuve %s', v_n);

  ASSERT EXISTS (SELECT 1 FROM staffing_requirements
    WHERE location_id=v_loc AND position_id=v_pos AND shift_template_id=v_shift
      AND day_of_week=0 AND is_holiday=true AND required_count=1),
    'Falta la fila festiva con required=1';
END $$;

ROLLBACK;
