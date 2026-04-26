-- Test: payroll_settings has the expected RLS policies.
BEGIN;

DO $$
DECLARE
  cnt INT;
BEGIN
  SELECT count(*) INTO cnt FROM pg_policy
   WHERE polrelid = 'public.payroll_settings'::regclass;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'TEST FAILED: expected ≥2 policies on payroll_settings, got %', cnt;
  END IF;
  RAISE NOTICE 'OK: payroll_settings has % policies', cnt;
END $$;

ROLLBACK;
