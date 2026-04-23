-- Smoke test: RLS policies exist on employee_equity_rollups.
BEGIN;
DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE tablename = 'employee_equity_rollups';
  IF policy_count = 0 THEN
    RAISE EXCEPTION 'FAIL: no policies on employee_equity_rollups';
  END IF;
  RAISE NOTICE 'PASS: % RLS policies present', policy_count;
END $$;
ROLLBACK;
