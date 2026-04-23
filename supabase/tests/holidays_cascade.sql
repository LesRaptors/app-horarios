-- Inserting a holiday should recompute rollups for entries on that date.
BEGIN;
DO $$
DECLARE
  v_id UUID;
  v_emp UUID;
  before_holidays INT;
  after_holidays INT;
BEGIN
  SELECT p.id INTO v_emp FROM profiles p WHERE p.is_active = true LIMIT 1;

  INSERT INTO schedule_entries (schedule_id, employee_id, position_id, date, start_time, end_time, shift_template_id)
  SELECT (SELECT id FROM schedules LIMIT 1), v_emp,
         (SELECT id FROM positions LIMIT 1),
         '2099-06-15' /* arbitrary weekday */, '09:00', '17:00',
         (SELECT id FROM shift_templates WHERE is_night = false LIMIT 1)
  RETURNING id INTO v_id;

  SELECT holidays_worked INTO before_holidays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 6 AND employee_id = v_emp;

  INSERT INTO holidays (date, name, location_id) VALUES ('2099-06-15', 'Fake holiday', NULL);

  SELECT holidays_worked INTO after_holidays FROM employee_equity_rollups
  WHERE year = 2099 AND month = 6 AND employee_id = v_emp;

  IF COALESCE(before_holidays, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 holidays before, got %', before_holidays;
  END IF;
  IF COALESCE(after_holidays, 0) <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 holiday after insert, got %', after_holidays;
  END IF;
  RAISE NOTICE 'PASS';
END $$;
ROLLBACK;
