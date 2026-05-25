-- Test: RLS presence — liquidations/liquidation_items have RLS enabled and
-- org-scoped policies (org A cannot see org B). Verifies policy definitions exist.
BEGIN;

DO $$
DECLARE
  v_rls_liq  BOOLEAN;
  v_rls_item BOOLEAN;
  v_pol_count INT;
BEGIN
  SELECT relrowsecurity INTO v_rls_liq  FROM pg_class WHERE relname = 'liquidations';
  SELECT relrowsecurity INTO v_rls_item FROM pg_class WHERE relname = 'liquidation_items';

  IF NOT v_rls_liq THEN
    RAISE EXCEPTION 'TEST FAILED: RLS not enabled on liquidations';
  END IF;
  IF NOT v_rls_item THEN
    RAISE EXCEPTION 'TEST FAILED: RLS not enabled on liquidation_items';
  END IF;

  SELECT count(*) INTO v_pol_count FROM pg_policies
    WHERE tablename IN ('liquidations','liquidation_items');
  IF v_pol_count < 4 THEN
    RAISE EXCEPTION 'TEST FAILED: expected >=4 policies, found %', v_pol_count;
  END IF;

  RAISE NOTICE 'OK: RLS enabled + % policies present on liquidation tables', v_pol_count;
END $$;

ROLLBACK;
