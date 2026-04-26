-- Test: payroll_settings_reject_overlap trigger
-- Verifies that inserting a period overlapping an existing payroll_settings row
-- raises an exception.
BEGIN;
DO $$
DECLARE
  attempted BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO payroll_settings (period_start, period_end, smmlv, aux_transport, hourly_divisor, night_start_hour, sunday_surcharge_pct, holiday_surcharge_pct)
    VALUES ('2026-03-01', '2026-04-30', 1750905, 249095, 220, 19, 0.8, 0.8);
    attempted := true;
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;
  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: overlap was allowed';
  END IF;
  RAISE NOTICE 'OK: overlap rejected';
END $$;
ROLLBACK;
