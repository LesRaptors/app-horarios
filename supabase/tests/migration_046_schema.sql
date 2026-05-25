-- =============================================================================
-- Test: migration 046 billing schema
-- Valida que el schema se aplicó correctamente:
--   - Las 6 tablas nuevas existen
--   - organizations.billing_exempt + organizations.current_plan_id existen
--   - RLS habilitada en las 6 tablas
--   - 3 planes seeded con precios correctos
--   - LR (00000000-0000-0000-0000-000000000001) está billing_exempt=true,
--     current_plan_id='enterprise'
--
-- Pattern: BEGIN ... ROLLBACK — seguro contra prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Test 1: las 6 tablas nuevas existen en schema public
-- =============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  FOR missing IN
    SELECT t FROM unnest(ARRAY[
      'plans','payment_methods','subscriptions',
      'invoices','payments','billing_providers'
    ]) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    )
  LOOP
    RAISE EXCEPTION 'FAIL test 1: tabla "%" no existe', missing;
  END LOOP;
  RAISE NOTICE 'PASS test 1: las 6 tablas billing existen';
END $$;

-- =============================================================================
-- Test 2: organizations.billing_exempt + current_plan_id existen
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='organizations'
       AND column_name='billing_exempt'
  ) THEN
    RAISE EXCEPTION 'FAIL test 2a: organizations.billing_exempt no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='organizations'
       AND column_name='current_plan_id'
  ) THEN
    RAISE EXCEPTION 'FAIL test 2b: organizations.current_plan_id no existe';
  END IF;

  RAISE NOTICE 'PASS test 2: organizations tiene billing_exempt + current_plan_id';
END $$;

-- =============================================================================
-- Test 3: RLS habilitada en las 6 tablas nuevas
-- =============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  FOR missing IN
    SELECT t FROM unnest(ARRAY[
      'plans','payment_methods','subscriptions',
      'invoices','payments','billing_providers'
    ]) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_tables
       WHERE schemaname='public' AND tablename=t AND rowsecurity=true
    )
  LOOP
    RAISE EXCEPTION 'FAIL test 3: RLS no habilitada en tabla "%"', missing;
  END LOOP;
  RAISE NOTICE 'PASS test 3: RLS habilitada en las 6 tablas billing';
END $$;

-- =============================================================================
-- Test 4: 3 planes seeded con precios correctos
-- =============================================================================
DO $$
DECLARE
  v_starter_price INT;
  v_pro_price INT;
  v_enterprise_price INT;
  v_enterprise_contact_sales BOOLEAN;
BEGIN
  SELECT price_cop INTO v_starter_price FROM plans WHERE id='starter';
  SELECT price_cop INTO v_pro_price FROM plans WHERE id='pro';
  SELECT price_cop, contact_sales INTO v_enterprise_price, v_enterprise_contact_sales
    FROM plans WHERE id='enterprise';

  IF v_starter_price IS NULL THEN
    RAISE EXCEPTION 'FAIL test 4a: plan "starter" no existe';
  END IF;
  IF v_starter_price <> 99000 THEN
    RAISE EXCEPTION 'FAIL test 4b: starter.price_cop = % (esperado 99000)', v_starter_price;
  END IF;
  IF v_pro_price <> 249000 THEN
    RAISE EXCEPTION 'FAIL test 4c: pro.price_cop = % (esperado 249000)', v_pro_price;
  END IF;
  IF v_enterprise_price <> 999000 THEN
    RAISE EXCEPTION 'FAIL test 4d: enterprise.price_cop = % (esperado 999000)', v_enterprise_price;
  END IF;
  IF v_enterprise_contact_sales IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 4e: enterprise.contact_sales no es true';
  END IF;

  RAISE NOTICE 'PASS test 4: 3 planes seeded con precios y contact_sales correctos';
END $$;

-- =============================================================================
-- Test 5: LR billing_exempt=true, current_plan_id='enterprise'
-- =============================================================================
DO $$
DECLARE
  v_exempt BOOLEAN;
  v_plan TEXT;
BEGIN
  SELECT billing_exempt, current_plan_id INTO v_exempt, v_plan
    FROM organizations
   WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_exempt IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 5a: LR.billing_exempt = % (esperado true)', v_exempt;
  END IF;
  IF v_plan <> 'enterprise' THEN
    RAISE EXCEPTION 'FAIL test 5b: LR.current_plan_id = % (esperado enterprise)', v_plan;
  END IF;

  RAISE NOTICE 'PASS test 5: LR grandfathered (billing_exempt=true, plan=enterprise)';
END $$;

-- =============================================================================
-- Test 6: los 3 indexes existen
-- =============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  FOR missing IN
    SELECT ix FROM unnest(ARRAY[
      'subscriptions_status_idx',
      'subscriptions_period_end_idx',
      'invoices_org_status_idx'
    ]) AS ix
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND indexname=ix
    )
  LOOP
    RAISE EXCEPTION 'FAIL test 6: index "%" no existe', missing;
  END LOOP;
  RAISE NOTICE 'PASS test 6: los 3 indexes existen';
END $$;

ROLLBACK;

SELECT 'All 6 migration_046 schema tests PASSED' AS result;
