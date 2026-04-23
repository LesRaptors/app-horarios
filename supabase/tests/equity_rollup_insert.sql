-- Verify inserting a Sunday entry increments sundays_worked.
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  count_sundays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-01-04' /* Sunday */, '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  SELECT sundays_worked INTO count_sundays
  FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1 AND employee_id = v_emp;

  IF count_sundays IS NULL OR count_sundays < 1 THEN
    RAISE EXCEPTION 'FAIL: expected sundays_worked >= 1, got %', count_sundays;
  END IF;
  RAISE NOTICE 'PASS: sundays_worked = %', count_sundays;
END $$;
ROLLBACK;
