-- =============================================================================
-- Test: aislamiento RLS billing (cross-tenant)
-- Admin de Org A NO puede ver subscriptions/invoices/payment_methods de Org B.
-- Ejecutar DESPUÉS de aplicar migration 046.
-- Pattern: BEGIN ... ROLLBACK para no ensuciar prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Setup: 2 orgs de prueba + 2 admins + datos billing en ambas
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES
  ('00000000-0000-0000-0000-000000000aaa', 'Test Org A Billing', 'test-org-a-billing', 'starter', 'active', 'CO', 'America/Bogota'),
  ('00000000-0000-0000-0000-000000000bbb', 'Test Org B Billing', 'test-org-b-billing', 'starter', 'active', 'CO', 'America/Bogota');

INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 'admin-a-bill@test.com', 'Admin', 'A', 'admin', '00000000-0000-0000-0000-000000000aaa', true),
  ('bbbb2222-2222-2222-2222-222222222222', 'admin-b-bill@test.com', 'Admin', 'B', 'admin', '00000000-0000-0000-0000-000000000bbb', true);

-- Payment methods (1 cada)
INSERT INTO payment_methods (id, organization_id, provider, provider_payment_source_id, card_brand, card_last4, card_exp_month, card_exp_year)
VALUES
  ('aaaa1111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000aaa', 'wompi', 'wompi_src_a', 'VISA', '4242', 12, 2027),
  ('bbbb2222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000bbb', 'wompi', 'wompi_src_b', 'VISA', '1234', 11, 2028);

-- Subscriptions (1 cada)
INSERT INTO subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end, payment_method_id)
VALUES
  ('aaaa1111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000aaa', 'starter', 'active', now(), now() + INTERVAL '30 days', 'aaaa1111-0000-0000-0000-000000000001'),
  ('bbbb2222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000bbb', 'starter', 'active', now(), now() + INTERVAL '30 days', 'bbbb2222-0000-0000-0000-000000000001');

-- Invoices (1 cada)
INSERT INTO invoices (id, organization_id, subscription_id, plan_id, period_start, period_end, amount_cop, iva_cop, total_cop, status, due_date)
VALUES
  ('aaaa1111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000aaa', 'aaaa1111-0000-0000-0000-000000000002', 'starter', now(), now() + INTERVAL '30 days', 99000, 18810, 117810, 'open', now() + INTERVAL '5 days'),
  ('bbbb2222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000bbb', 'bbbb2222-0000-0000-0000-000000000002', 'starter', now(), now() + INTERVAL '30 days', 99000, 18810, 117810, 'open', now() + INTERVAL '5 days');

-- =============================================================================
-- Test 1: admin-a NO ve subscriptions de Org B
-- =============================================================================
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO 'aaaa1111-1111-1111-1111-111111111111';

DO $$
DECLARE cross_count INT;
BEGIN
  SELECT COUNT(*) INTO cross_count FROM subscriptions
    WHERE organization_id = '00000000-0000-0000-0000-000000000bbb';
  IF cross_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 1: admin-a vio % subscriptions de Org B', cross_count;
  END IF;
  RAISE NOTICE 'PASS test 1: admin-a no ve subscriptions de Org B';
END $$;

-- =============================================================================
-- Test 2: admin-a NO ve invoices de Org B
-- =============================================================================
DO $$
DECLARE cross_count INT;
BEGIN
  SELECT COUNT(*) INTO cross_count FROM invoices
    WHERE organization_id = '00000000-0000-0000-0000-000000000bbb';
  IF cross_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 2: admin-a vio % invoices de Org B', cross_count;
  END IF;
  RAISE NOTICE 'PASS test 2: admin-a no ve invoices de Org B';
END $$;

-- =============================================================================
-- Test 3: admin-a NO ve payment_methods de Org B
-- =============================================================================
DO $$
DECLARE cross_count INT;
BEGIN
  SELECT COUNT(*) INTO cross_count FROM payment_methods
    WHERE organization_id = '00000000-0000-0000-0000-000000000bbb';
  IF cross_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 3: admin-a vio % payment_methods de Org B', cross_count;
  END IF;
  RAISE NOTICE 'PASS test 3: admin-a no ve payment_methods de Org B';
END $$;

-- =============================================================================
-- Test 4: admin-a SÍ ve sus propias filas (sanity check)
-- =============================================================================
DO $$
DECLARE
  own_subs INT;
  own_invs INT;
  own_pms INT;
BEGIN
  SELECT COUNT(*) INTO own_subs FROM subscriptions
    WHERE organization_id = '00000000-0000-0000-0000-000000000aaa';
  SELECT COUNT(*) INTO own_invs FROM invoices
    WHERE organization_id = '00000000-0000-0000-0000-000000000aaa';
  SELECT COUNT(*) INTO own_pms FROM payment_methods
    WHERE organization_id = '00000000-0000-0000-0000-000000000aaa';

  IF own_subs <> 1 THEN
    RAISE EXCEPTION 'FAIL test 4a: admin-a ve % subscriptions propias (esperado 1)', own_subs;
  END IF;
  IF own_invs <> 1 THEN
    RAISE EXCEPTION 'FAIL test 4b: admin-a ve % invoices propias (esperado 1)', own_invs;
  END IF;
  IF own_pms <> 1 THEN
    RAISE EXCEPTION 'FAIL test 4c: admin-a ve % payment_methods propias (esperado 1)', own_pms;
  END IF;

  RAISE NOTICE 'PASS test 4: admin-a ve sus propias filas (subs=%, invs=%, pms=%)',
    own_subs, own_invs, own_pms;
END $$;

-- =============================================================================
-- Test 5: admin-a NO puede INSERT subscription en Org B (WITH CHECK rechaza)
-- =============================================================================
DO $$
DECLARE insert_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
    VALUES ('00000000-0000-0000-0000-000000000bbb', 'starter', 'trialing', now(), now() + INTERVAL '30 days');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    insert_blocked := true;
  END;
  IF NOT insert_blocked THEN
    RAISE EXCEPTION 'FAIL test 5: admin-a logró INSERT subscription en Org B';
  END IF;
  RAISE NOTICE 'PASS test 5: admin-a INSERT subscription en Org B fue bloqueado';
END $$;

-- =============================================================================
-- Test 6: plans es legible por cualquier authenticated (catálogo público)
-- =============================================================================
DO $$
DECLARE plan_count INT;
BEGIN
  SELECT COUNT(*) INTO plan_count FROM plans WHERE id IN ('starter','pro','enterprise');
  IF plan_count <> 3 THEN
    RAISE EXCEPTION 'FAIL test 6: admin-a ve % planes (esperado 3)', plan_count;
  END IF;
  RAISE NOTICE 'PASS test 6: admin-a ve los 3 planes (catálogo público)';
END $$;

ROLLBACK;

SELECT 'All 6 billing_rls_isolation tests PASSED' AS result;
