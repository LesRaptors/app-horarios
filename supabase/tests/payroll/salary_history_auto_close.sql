-- Test: inserting a new salary closes the previous open row.
BEGIN;

DO $$
DECLARE
  emp UUID;
  prev_to DATE;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2000000, '2026-01-01');

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2500000, '2026-04-01');

  SELECT effective_to INTO prev_to
    FROM salary_history
   WHERE employee_id = emp AND effective_from = '2026-01-01';

  IF prev_to <> '2026-03-31' THEN
    RAISE EXCEPTION 'TEST FAILED: expected effective_to=2026-03-31, got %', prev_to;
  END IF;
  RAISE NOTICE 'OK: previous row closed correctly';
END $$;

ROLLBACK;
