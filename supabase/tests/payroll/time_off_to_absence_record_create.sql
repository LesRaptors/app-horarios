-- Test: aprobar un time_off_request crea un absence_record (trigger time_off_to_absence_record_trg).
--
-- Prueba el trigger REAL tal como quedó tras la migración 050: time_off_requests no
-- tiene columna de tipo, así que toda solicitud aprobada se registra como ausencia
-- remunerada por el empleador (type='vacation', paid_pct=1, payer='employer') con
-- organization_id heredado de la solicitud. Todo corre en BEGIN/ROLLBACK.
BEGIN;

DO $$
DECLARE
  v_org_id    UUID := '00000000-0000-0000-0000-000000000001';
  v_loc_id    UUID;
  v_emp_id    UUID;
  v_tor_id    UUID;
  v_abs_count INT;
  v_abs_type  TEXT;
  v_paid_pct  NUMERIC;
  v_payer     TEXT;
  v_abs_org   UUID;
BEGIN
  SELECT id INTO v_loc_id FROM locations WHERE organization_id = v_org_id LIMIT 1;

  -- Empleado de prueba.
  INSERT INTO profiles (id, organization_id, first_name, last_name, email, role, location_id, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'Test', 'AbsCreate', 'test_abs_create@test.com', 'employee', v_loc_id, true)
  RETURNING id INTO v_emp_id;

  -- Solicitud pending: el trigger dispara pero status != approved → no crea absence.
  INSERT INTO time_off_requests (id, employee_id, organization_id, start_date, end_date, status)
  VALUES (gen_random_uuid(), v_emp_id, v_org_id, '2026-06-01', '2026-06-05', 'pending')
  RETURNING id INTO v_tor_id;

  SELECT COUNT(*) INTO v_abs_count FROM absence_records WHERE source_request_id = v_tor_id;
  IF v_abs_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: absence creado para solicitud pending (esperaba 0, hay %)', v_abs_count;
  END IF;

  -- Aprobar → el trigger crea el absence_record.
  UPDATE time_off_requests SET status = 'approved' WHERE id = v_tor_id;

  SELECT COUNT(*), MAX(type), MAX(paid_pct), MAX(payer)
    INTO v_abs_count, v_abs_type, v_paid_pct, v_payer
    FROM absence_records
   WHERE source_request_id = v_tor_id;
  SELECT organization_id INTO v_abs_org FROM absence_records WHERE source_request_id = v_tor_id LIMIT 1;

  IF v_abs_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba 1 absence tras aprobar, hay %', v_abs_count;
  END IF;
  IF v_abs_type <> 'vacation' THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba type=vacation, hay %', v_abs_type;
  END IF;
  IF v_paid_pct <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba paid_pct=1, hay %', v_paid_pct;
  END IF;
  IF v_payer <> 'employer' THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba payer=employer, hay %', v_payer;
  END IF;
  IF v_abs_org <> v_org_id THEN
    RAISE EXCEPTION 'TEST FAILED: esperaba organization_id=%, hay %', v_org_id, v_abs_org;
  END IF;

  RAISE NOTICE 'OK: aprobar solicitud crea absence_record (vacation, employer, org_id correcto)';
END $$;

ROLLBACK;
