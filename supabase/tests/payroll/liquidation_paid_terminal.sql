-- Test: a liquidation with status='paid' cannot transition back to draft/approved.
-- Trigger: liquidations_paid_terminal_trg (BEFORE UPDATE)
BEGIN;

DO $$
DECLARE
  v_org_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_emp_id   UUID;
  v_liq_id   UUID;
  attempted  BOOLEAN := false;
BEGIN
  -- Necesitamos un empleado de esa org para la FK employee_id.
  SELECT id INTO v_emp_id FROM profiles WHERE organization_id = v_org_id LIMIT 1;
  IF v_emp_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay profiles en la org de prueba';
    RETURN;
  END IF;

  INSERT INTO liquidations (organization_id, employee_id, termination_date, reason,
    contract_kind, hire_date, cesantias_cutoff, vacations_cutoff, base_salary, status)
  VALUES (v_org_id, v_emp_id, '2026-04-01', 'renuncia', 'indefinido',
    '2024-04-01', '2026-01-01', '2025-04-01', 2000000, 'draft')
  RETURNING id INTO v_liq_id;

  UPDATE liquidations SET status = 'approved' WHERE id = v_liq_id;
  UPDATE liquidations SET status = 'paid'     WHERE id = v_liq_id;

  BEGIN
    UPDATE liquidations SET status = 'draft' WHERE id = v_liq_id;
    attempted := true;
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: paid -> draft transition was allowed';
  END IF;

  RAISE NOTICE 'OK: paid liquidation is terminal — reversion rejected';
END $$;

ROLLBACK;
