-- Test: cambiar una solicitud aprobada a rechazada borra el absence_record
-- (trigger time_off_to_absence_record_trg, rama des-aprobación). BEGIN/ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_org_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id    UUID;
  v_emp_id    UUID;
  v_tor_id    UUID;
  v_abs_count INT;
BEGIN
  SELECT id INTO v_loc_id FROM locations WHERE organization_id = v_org_id LIMIT 1;

  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsUnappr', 'test_abs_unappr@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Crear directamente como aprobada → crea absence.
  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-07-01', '2026-07-03', 'approved')
  RETURNING id INTO v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba 1 absence tras crear aprobada, hay %', v_abs_count;
  END IF;

  -- Rechazar → el trigger borra el absence.
  UPDATE time_off_requests SET status = 'rejected' WHERE id = v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba 0 absence tras rechazar, hay %', v_abs_count;
  END IF;

  RAISE NOTICE 'OK: rechazar solicitud aprobada borra el absence_record';
END $$;

ROLLBACK;
