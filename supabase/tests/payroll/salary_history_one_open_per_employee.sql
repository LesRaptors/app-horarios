-- Test: unique partial index prevents two open rows per employee.
BEGIN;

DO $$
DECLARE
  emp UUID;
  attempted BOOLEAN := false;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2000000, '2026-01-01');

  -- Disable the auto-close trigger so we can attempt to insert a second open row directly.
  ALTER TABLE salary_history DISABLE TRIGGER salary_history_close_previous_trg;

  BEGIN
    INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
      VALUES (emp, 3000000, '2026-04-01');
    attempted := true;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  ALTER TABLE salary_history ENABLE TRIGGER salary_history_close_previous_trg;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: two open rows allowed';
  END IF;
  RAISE NOTICE 'OK: unique partial index rejects two open rows';
END $$;

ROLLBACK;
