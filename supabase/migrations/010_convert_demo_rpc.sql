CREATE OR REPLACE FUNCTION convert_demo_to_real(
  p_demo_id UUID,
  p_real_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo RECORD;
  v_entries_count INT;
BEGIN
  SELECT * INTO v_demo FROM profiles WHERE id = p_demo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empleado demo no encontrado');
  END IF;
  IF NOT v_demo.is_demo THEN
    RETURN jsonb_build_object('success', false, 'error', 'El empleado no es un demo');
  END IF;

  UPDATE schedule_entries SET employee_id = p_real_id WHERE employee_id = p_demo_id;
  GET DIAGNOSTICS v_entries_count = ROW_COUNT;

  UPDATE employee_secondary_positions SET employee_id = p_real_id WHERE employee_id = p_demo_id;

  UPDATE profiles SET
    position_id = COALESCE((SELECT position_id FROM profiles WHERE id = p_demo_id), position_id),
    location_id = COALESCE((SELECT location_id FROM profiles WHERE id = p_demo_id), location_id),
    max_hours_per_week = (SELECT max_hours_per_week FROM profiles WHERE id = p_demo_id)
  WHERE id = p_real_id;

  DELETE FROM profiles WHERE id = p_demo_id;

  RETURN jsonb_build_object('success', true, 'entries_migrated', v_entries_count);
END;
$$;
