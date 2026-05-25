-- Test: changing dates on an approved time_off_request replaces the absence_record.
-- Exercises trigger branch 3 of time_off_to_absence_record_trg:
--   NEW.status = 'approved' AND (OLD.start_date <> NEW.start_date OR OLD.end_date <> NEW.end_date)
--   => DELETE old absence_records + INSERT new one with updated dates
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
  v_org_id      UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id      UUID := 'a0000000-0000-0000-0000-000000000001';
  v_emp_id      UUID;
  v_tor_id      UUID;
  v_abs_count   INT;
  v_abs_start   DATE;
  v_abs_end     DATE;
BEGIN
  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsDateChg', 'test_abs_datechange@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Insert approved request with original dates.
  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, type, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-08-01', '2026-08-05', 'personal', 'approved')
  RETURNING id INTO v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected 1 absence_record after initial approve, got %', v_abs_count;
  END IF;

  -- Change the dates while still approved — trigger branch 3 replaces the record.
  UPDATE time_off_requests
     SET start_date = '2026-08-10', end_date = '2026-08-15'
   WHERE id = v_tor_id;

  SELECT COUNT(*), MAX(start_date), MAX(end_date)
    INTO v_abs_count, v_abs_start, v_abs_end
    FROM absence_records
   WHERE source_request_id = v_tor_id;

  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected 1 absence_record after date change, got %', v_abs_count;
  END IF;
  IF v_abs_start <> '2026-08-10'::date THEN
    RAISE EXCEPTION 'TEST FAILED: expected start_date=2026-08-10, got %', v_abs_start;
  END IF;
  IF v_abs_end <> '2026-08-15'::date THEN
    RAISE EXCEPTION 'TEST FAILED: expected end_date=2026-08-15, got %', v_abs_end;
  END IF;

  RAISE NOTICE 'OK: changing dates on approved request replaces absence_record with new dates';
END $$;

ROLLBACK;
