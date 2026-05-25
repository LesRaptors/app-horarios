-- =============================================================================
-- Test: UNIQUE constraints billing
--   - payments.provider_transaction_id UNIQUE (idempotencia webhook Wompi)
--   - subscriptions.organization_id UNIQUE (1 subscription por org)
--
-- Ejecutar DESPUÉS de aplicar migration 046. Service_role (bypassa RLS).
-- Pattern: BEGIN ... ROLLBACK con SAVEPOINTs para aislar cada assertion.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Setup: org de prueba + subscription + invoice
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES ('00000000-0000-0000-0000-000000000ccc', 'Test Org C Unique', 'test-org-c-unique', 'starter', 'active', 'CO', 'America/Bogota');

INSERT INTO subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end)
VALUES ('cccc3333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000ccc', 'starter', 'active', now(), now() + INTERVAL '30 days');

INSERT INTO invoices (id, organization_id, subscription_id, plan_id, period_start, period_end, amount_cop, iva_cop, total_cop, status, due_date)
VALUES ('cccc3333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000ccc', 'cccc3333-0000-0000-0000-000000000001', 'starter', now(), now() + INTERVAL '30 days', 99000, 18810, 117810, 'open', now() + INTERVAL '5 days');

-- =============================================================================
-- Test 1: payments.provider_transaction_id UNIQUE — segundo INSERT debe fallar
-- =============================================================================
SAVEPOINT sp1;

-- Primer payment con provider_transaction_id='wompi_tx_dup_test'
INSERT INTO payments (invoice_id, provider, provider_transaction_id, amount_cop, status)
VALUES ('cccc3333-0000-0000-0000-000000000002', 'wompi', 'wompi_tx_dup_test', 117810, 'approved');

-- Segundo payment con mismo provider_transaction_id → debe fallar
DO $$
DECLARE dup_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO payments (invoice_id, provider, provider_transaction_id, amount_cop, status)
    VALUES ('cccc3333-0000-0000-0000-000000000002', 'wompi', 'wompi_tx_dup_test', 117810, 'approved');
  EXCEPTION WHEN unique_violation THEN
    dup_blocked := true;
  END;
  IF NOT dup_blocked THEN
    RAISE EXCEPTION 'FAIL test 1: segundo INSERT con mismo provider_transaction_id NO falló';
  END IF;
  RAISE NOTICE 'PASS test 1: payments.provider_transaction_id UNIQUE rechaza duplicados';
END $$;

ROLLBACK TO SAVEPOINT sp1;

-- =============================================================================
-- Test 2: subscriptions.organization_id UNIQUE — segundo INSERT debe fallar
-- =============================================================================
SAVEPOINT sp2;

-- Ya existe una subscription para org C (creada en setup).
-- Intentar crear una segunda debe fallar.
DO $$
DECLARE dup_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
    VALUES ('00000000-0000-0000-0000-000000000ccc', 'pro', 'trialing', now(), now() + INTERVAL '30 days');
  EXCEPTION WHEN unique_violation THEN
    dup_blocked := true;
  END;
  IF NOT dup_blocked THEN
    RAISE EXCEPTION 'FAIL test 2: segunda subscription en misma org NO falló';
  END IF;
  RAISE NOTICE 'PASS test 2: subscriptions.organization_id UNIQUE rechaza segunda subscription';
END $$;

ROLLBACK TO SAVEPOINT sp2;

-- =============================================================================
-- Test 3: payment_methods (organization_id, provider_payment_source_id) UNIQUE
-- =============================================================================
SAVEPOINT sp3;

INSERT INTO payment_methods (organization_id, provider, provider_payment_source_id, card_brand, card_last4, card_exp_month, card_exp_year)
VALUES ('00000000-0000-0000-0000-000000000ccc', 'wompi', 'wompi_src_dup', 'VISA', '4242', 12, 2027);

DO $$
DECLARE dup_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO payment_methods (organization_id, provider, provider_payment_source_id, card_brand, card_last4, card_exp_month, card_exp_year)
    VALUES ('00000000-0000-0000-0000-000000000ccc', 'wompi', 'wompi_src_dup', 'VISA', '4242', 12, 2027);
  EXCEPTION WHEN unique_violation THEN
    dup_blocked := true;
  END;
  IF NOT dup_blocked THEN
    RAISE EXCEPTION 'FAIL test 3: duplicado payment_methods (org, source_id) NO falló';
  END IF;
  RAISE NOTICE 'PASS test 3: payment_methods (org, provider_payment_source_id) UNIQUE rechaza duplicados';
END $$;

ROLLBACK TO SAVEPOINT sp3;

ROLLBACK;

SELECT 'All 3 billing_unique_constraints tests PASSED' AS result;
