-- Updating an entry's date should move the rollup between months.
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  jan_sundays INT;
  feb_sundays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-01-04' /* Sunday */, '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  UPDATE schedule_entries SET date = '2099-02-08' /* also Sunday */ WHERE id = v_id;

  SELECT sundays_worked INTO jan_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 1 AND employee_id = v_emp;

  SELECT sundays_worked INTO feb_sundays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 2 AND employee_id = v_emp;

  IF COALESCE(jan_sundays, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 jan sundays after move, got %', jan_sundays;
  END IF;
  IF COALESCE(feb_sundays, 0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 feb sunday after move, got %', feb_sundays;
  END IF;
  RAISE NOTICE 'PASS';
END $$;
ROLLBACK;
