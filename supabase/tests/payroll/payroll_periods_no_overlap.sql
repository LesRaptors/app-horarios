-- Test: payroll_periods_reject_overlap trigger rejects overlapping periods.
-- Trigger: payroll_periods_reject_overlap_trg (BEFORE INSERT OR UPDATE)
-- Function: payroll_periods_reject_overlap()
-- Raises: 'El período se solapa con otro período de nómina existente'
--
-- Note: payroll_periods requires organization_id (added by migration 039).
-- The overlap check in the trigger does NOT filter by organization_id (global check).
BEGIN;

DO $$
DECLARE
  v_org_id  UUID := '00000000-0000-0000-0000-000000000001';
  attempted BOOLEAN := false;
BEGIN
  -- Insert a valid period: Jan 2027.
  INSERT INTO payroll_periods (period_start, period_end, frequency, status, organization_id)
  VALUES ('2027-01-01', '2027-01-31', 'mensual', 'draft', v_org_id);

  -- Try to insert an overlapping period (Feb–Mar 2027 starts before Jan ends => overlaps).
  -- Actually overlap: Jan 1 – Jan 31 vs Jan 15 – Feb 28 => overlap.
  BEGIN
    INSERT INTO payroll_periods (period_start, period_end, frequency, status, organization_id)
    VALUES ('2027-01-15', '2027-02-28', 'mensual', 'draft', v_org_id);
    attempted := true;
  EXCEPTION WHEN raise_exception THEN
    -- Expected: trigger rejected the overlapping insert.
    NULL;
  END;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: overlapping payroll period was allowed';
  END IF;

  -- Verify the non-overlapping adjacent period is accepted (Feb starts day after Jan ends).
  INSERT INTO payroll_periods (period_start, period_end, frequency, status, organization_id)
  VALUES ('2027-02-01', '2027-02-28', 'mensual', 'draft', v_org_id);

  RAISE NOTICE 'OK: overlapping payroll period rejected; adjacent non-overlapping period accepted';
END $$;

ROLLBACK;
