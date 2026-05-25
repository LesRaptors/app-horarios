-- Test: partial unique index prevents two open rows (effective_to IS NULL) per employee.
-- Index: tax_deductions_one_open_per_employee
--   CREATE UNIQUE INDEX ... ON tax_personal_deductions (employee_id) WHERE effective_to IS NULL
--
-- The trigger tax_deductions_close_previous_trg auto-closes earlier open rows on INSERT,
-- so this test disables that trigger to force a direct second open-row insert and confirm
-- the unique index fires. Pattern mirrors salary_history_one_open_per_employee.sql.
BEGIN;

DO $$
DECLARE
  v_org_id  UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id  UUID := 'a0000000-0000-0000-0000-000000000001';
  v_emp_id  UUID;
  attempted BOOLEAN := false;
BEGIN
  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'TaxOpen', 'test_tax_open@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Insert first open row (effective_to IS NULL).
  INSERT INTO tax_personal_deductions
    (employee_id, organization_id, effective_from)
  VALUES
    (v_emp_id, v_org_id, '2026-01-01');

  -- Disable the auto-close trigger so the second open-row insert hits the unique index.
  ALTER TABLE tax_personal_deductions DISABLE TRIGGER tax_deductions_close_previous_trg;

  BEGIN
    -- Attempt second open row for the same employee — unique index must reject it.
    INSERT INTO tax_personal_deductions
      (employee_id, organization_id, effective_from)
    VALUES
      (v_emp_id, v_org_id, '2026-06-01');
    attempted := true;
  EXCEPTION WHEN unique_violation THEN
    -- Expected: partial unique index rejected the second open row.
    NULL;
  END;

  ALTER TABLE tax_personal_deductions ENABLE TRIGGER tax_deductions_close_previous_trg;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: two open tax_personal_deductions rows allowed for same employee';
  END IF;

  RAISE NOTICE 'OK: unique partial index rejects two open tax_personal_deductions rows per employee';
END $$;

ROLLBACK;
