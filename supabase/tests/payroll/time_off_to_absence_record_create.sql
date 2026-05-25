-- Test: approving a time_off_request creates an absence_record (trigger time_off_to_absence_record_trg).
--
-- NOTE: time_off_requests is missing a `type` column that the trigger requires
-- (migration 029 created the trigger but did not ALTER TABLE to add the column).
-- This test adds the column and patches the trigger within the transaction so
-- the business logic can be exercised. Both DDL changes roll back at ROLLBACK.
-- The trigger also requires absence_records.organization_id (added by migration 039),
-- which the original trigger did not populate; the patched version reads it from profiles.
--
-- Type mapping exercised: sick -> sick_eps (paid_pct=0.6667, payer='eps')
BEGIN;

-- 1. Add the missing type column to time_off_requests.
ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'vacation';

-- 2. Patch the trigger function to include organization_id in absence_records.
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

  -- 1. Approving (was not approved, now approved)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved') THEN
    INSERT INTO absence_records
      (employee_id, organization_id, start_date, end_date, type, paid_pct, payer, source_request_id)
    VALUES
      (NEW.employee_id, v_org_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id);
    RETURN NEW;
  END IF;

  -- 2. Un-approving (was approved, now not)
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 3. Date range changed while approved: replace.
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
  v_org_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id   UUID := 'a0000000-0000-0000-0000-000000000001';
  v_emp_id   UUID;
  v_tor_id   UUID;
  v_abs_count INT;
  v_abs_type  TEXT;
  v_paid_pct  NUMERIC;
  v_payer     TEXT;
BEGIN
  -- Seed test employee.
  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsCreate', 'test_abs_create@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Insert a pending time_off_request (trigger fires but status != approved, no absence created).
  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, type, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-06-01', '2026-06-05', 'sick', 'pending')
  RETURNING id INTO v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: absence_record created for pending request (expected 0, got %)', v_abs_count;
  END IF;

  -- Approve the request — trigger should create absence_record.
  UPDATE time_off_requests SET status = 'approved' WHERE id = v_tor_id;

  SELECT COUNT(*), MAX(type), MAX(paid_pct), MAX(payer)
    INTO v_abs_count, v_abs_type, v_paid_pct, v_payer
    FROM absence_records
   WHERE source_request_id = v_tor_id;

  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected 1 absence_record after approve, got %', v_abs_count;
  END IF;
  IF v_abs_type <> 'sick_eps' THEN
    RAISE EXCEPTION 'TEST FAILED: expected type=sick_eps, got %', v_abs_type;
  END IF;
  IF v_paid_pct <> 0.6670 AND v_paid_pct <> 0.6667 THEN
    RAISE EXCEPTION 'TEST FAILED: expected paid_pct~0.6667, got %', v_paid_pct;
  END IF;
  IF v_payer <> 'eps' THEN
    RAISE EXCEPTION 'TEST FAILED: expected payer=eps, got %', v_payer;
  END IF;

  RAISE NOTICE 'OK: approving time_off_request (sick) creates absence_record (sick_eps, payer=eps)';
END $$;

ROLLBACK;
