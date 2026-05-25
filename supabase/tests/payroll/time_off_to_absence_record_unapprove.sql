-- Test: changing an approved time_off_request to rejected deletes the absence_record.
-- Exercises trigger branch 2 of time_off_to_absence_record_trg:
--   OLD.status = 'approved' AND NEW.status <> 'approved' => DELETE absence_records
--
-- Same schema-fix preamble as time_off_to_absence_record_create.sql (see that file for details).
BEGIN;

ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'vacation';

CREATE OR REPLACE FUNCTION time_off_to_absence_record()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type     TEXT;
  v_paid_pct NUMERIC(4,3);
  v_payer    TEXT;
  v_org_id   UUID;
BEGIN
  v_type := CASE
    WHEN NEW.type = 'vacation' THEN 'vacation'
    WHEN NEW.type = 'sick'     THEN 'sick_eps'
    WHEN NEW.type = 'personal' THEN 'paid_leave'
    ELSE 'paid_leave'
  END;
  v_paid_pct := CASE v_type
    WHEN 'sick_eps'     THEN 0.6667
    WHEN 'unpaid_leave' THEN 0
    WHEN 'suspension'   THEN 0
    ELSE 1
  END;
  v_payer := CASE v_type
    WHEN 'sick_eps'     THEN 'eps'
    WHEN 'sick_arl'     THEN 'arl'
    WHEN 'maternity'    THEN 'eps'
    WHEN 'paternity'    THEN 'eps'
    WHEN 'unpaid_leave' THEN 'none'
    WHEN 'suspension'   THEN 'none'
    ELSE 'employer'
  END;
  SELECT organization_id INTO v_org_id FROM profiles WHERE id = NEW.employee_id;

  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved') THEN
    INSERT INTO absence_records
      (employee_id, organization_id, start_date, end_date, type, paid_pct, payer, source_request_id)
    VALUES
      (NEW.employee_id, v_org_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND
     (OLD.start_date <> NEW.start_date OR OLD.end_date <> NEW.end_date) THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    INSERT INTO absence_records
      (employee_id, organization_id, start_date, end_date, type, paid_pct, payer, source_request_id)
    VALUES
      (NEW.employee_id, v_org_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_org_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id    UUID := 'a0000000-0000-0000-0000-000000000001';
  v_emp_id    UUID;
  v_tor_id    UUID;
  v_abs_count INT;
BEGIN
  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsUnapprove', 'test_abs_unapprove@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Insert already-approved request (trigger branch 1 fires on INSERT with status=approved).
  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, type, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-07-01', '2026-07-03', 'vacation', 'approved')
  RETURNING id INTO v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected 1 absence_record after approved insert, got %', v_abs_count;
  END IF;

  -- Un-approve: change status to rejected => trigger branch 2 deletes the absence_record.
  UPDATE time_off_requests SET status = 'rejected' WHERE id = v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: expected 0 absence_records after rejection, got %', v_abs_count;
  END IF;

  RAISE NOTICE 'OK: rejecting an approved time_off_request deletes its absence_record';
END $$;

ROLLBACK;
