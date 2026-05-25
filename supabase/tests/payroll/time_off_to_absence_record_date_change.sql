-- Test: cambiar las fechas de una solicitud aprobada reemplaza el absence_record
-- (trigger time_off_to_absence_record_trg, rama 3). BEGIN/ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_org_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id    UUID;
  v_emp_id    UUID;
  v_tor_id    UUID;
  v_abs_count INT;
  v_abs_start DATE;
  v_abs_end   DATE;
BEGIN
  SELECT id INTO v_loc_id FROM locations WHERE organization_id = v_org_id LIMIT 1;

  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsDate', 'test_abs_date@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-08-01', '2026-08-05', 'approved')
  RETURNING id INTO v_tor_id;

  -- Cambiar el rango de fechas estando aprobada → reemplaza el absence.
  UPDATE time_off_requests SET start_date = '2026-08-10', end_date = '2026-08-14' WHERE id = v_tor_id;

  SELECT COUNT(*), MAX(start_date), MAX(end_date)
    INTO v_abs_count, v_abs_start, v_abs_end
    FROM absence_records WHERE source_request_id = v_tor_id;

  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba 1 absence (reemplazado), hay %', v_abs_count;
  END IF;
  IF v_abs_start <> '2026-08-10' OR v_abs_end <> '2026-08-14' THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba fechas 2026-08-10..14, hay %..%', v_abs_start, v_abs_end;
  END IF;

  RAISE NOTICE 'OK: cambiar fechas de solicitud aprobada reemplaza el absence_record';
END $$;

ROLLBACK;
