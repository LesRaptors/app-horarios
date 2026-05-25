-- Test: a period with status='paid' cannot transition back to 'draft' or 'approved'.
-- Trigger: payroll_periods_paid_terminal_trg (BEFORE UPDATE)
-- Function: payroll_periods_paid_terminal()
-- Raises: 'Un período pagado no puede volver a estado anterior'
BEGIN;

DO $$
DECLARE
  v_org_id        UUID := '00000000-0000-0000-0000-000000000001';
  v_period_id     UUID;
  attempted_draft   BOOLEAN := false;
  attempted_approved BOOLEAN := false;
BEGIN
  -- Insert a period and advance it to 'paid' status (valid transitions: draft -> approved -> paid).
  INSERT INTO payroll_periods (period_start, period_end, frequency, status, organization_id)
  VALUES ('2027-03-01', '2027-03-31', 'mensual', 'draft', v_org_id)
  RETURNING id INTO v_period_id;

  UPDATE payroll_periods SET status = 'approved' WHERE id = v_period_id;
  UPDATE payroll_periods SET status = 'paid'     WHERE id = v_period_id;

  -- Attempt to go back to 'draft' — trigger must reject it.
  BEGIN
    UPDATE payroll_periods SET status = 'draft' WHERE id = v_period_id;
    attempted_draft := true;
  EXCEPTION WHEN raise_exception THEN
    -- Expected: terminal-state guard fired.
    NULL;
  END;

  IF attempted_draft THEN
    RAISE EXCEPTION 'TEST FAILED: paid -> draft transition was allowed';
  END IF;

  -- Attempt to go back to 'approved' — trigger must also reject it.
  BEGIN
    UPDATE payroll_periods SET status = 'approved' WHERE id = v_period_id;
    attempted_approved := true;
  EXCEPTION WHEN raise_exception THEN
    -- Expected.
    NULL;
  END;

  IF attempted_approved THEN
    RAISE EXCEPTION 'TEST FAILED: paid -> approved transition was allowed';
  END IF;

  -- Confirm the period is still 'paid'.
  IF (SELECT status FROM payroll_periods WHERE id = v_period_id) <> 'paid' THEN
    RAISE EXCEPTION 'TEST FAILED: period status is no longer paid after rejected transitions';
  END IF;

  RAISE NOTICE 'OK: paid payroll_period is terminal — reversion to draft or approved rejected';
END $$;

ROLLBACK;
