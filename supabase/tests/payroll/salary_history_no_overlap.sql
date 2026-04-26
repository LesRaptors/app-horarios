-- Test: salary_history rejects overlapping closed ranges.
BEGIN;

DO $$
DECLARE
  emp UUID;
  attempted BOOLEAN := false;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  -- Insert a closed range [Jan, Mar].
  INSERT INTO salary_history (employee_id, monthly_salary, effective_from, effective_to)
    VALUES (emp, 2000000, '2026-01-01', '2026-03-31');

  -- Try to insert a row whose effective_from falls inside that closed range.
  BEGIN
    INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
      VALUES (emp, 2200000, '2026-02-15');
    attempted := true;
  EXCEPTION WHEN raise_exception THEN
    -- expected: trigger rejected the insert
    NULL;
  END;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: overlap was allowed';
  END IF;

  RAISE NOTICE 'OK: overlap rejected';
END $$;

ROLLBACK;
