-- Test: billing_idempotency_schema.sql
-- Verifica que:
--   1. El índice parcial invoices_one_open_per_sub rechaza una segunda factura
--      "open" para la misma suscripción.
--   2. organizations.billing_exempt tiene restricción NOT NULL.
--
-- Patrón: BEGIN / ROLLBACK (seguro contra prod).

BEGIN;

-- ─── Setup mínimo ────────────────────────────────────────────────────────────
INSERT INTO organizations (id, name, slug, billing_exempt)
VALUES ('00000000-bbbb-0000-0000-000000000001', 'Test Idempotency Org', 'test-idempotency-org-049', false);

INSERT INTO plans (id, name, display_order, price_cop, is_active)
VALUES ('00000000-bbbb-0000-0000-000000000002', 'Test Plan 049', 999, 99000, true);

INSERT INTO subscriptions (
  id, organization_id, plan_id, status,
  current_period_start, current_period_end
) VALUES (
  '00000000-bbbb-0000-0000-000000000003',
  '00000000-bbbb-0000-0000-000000000001',
  '00000000-bbbb-0000-0000-000000000002',
  'active',
  now(), now() + interval '30 days'
);

-- ─── Test 1: primera factura "open" debe insertarse sin error ─────────────────
INSERT INTO invoices (
  id, organization_id, subscription_id, plan_id,
  period_start, period_end, amount_cop, iva_cop, total_cop,
  status, due_date
) VALUES (
  '00000000-bbbb-0000-0000-000000000010',
  '00000000-bbbb-0000-0000-000000000001',
  '00000000-bbbb-0000-0000-000000000003',
  '00000000-bbbb-0000-0000-000000000002',
  now(), now() + interval '30 days',
  99000, 18810, 117810,
  'open', now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = '00000000-bbbb-0000-0000-000000000010') THEN
    RAISE EXCEPTION 'Test 1 FAILED: primera factura open no fue insertada';
  END IF;
  RAISE NOTICE 'Test 1 PASSED: primera factura open insertada correctamente';
END;
$$;

-- ─── Test 2: segunda factura "open" para la misma suscripción debe fallar ─────
DO $$
BEGIN
  BEGIN
    INSERT INTO invoices (
      id, organization_id, subscription_id, plan_id,
      period_start, period_end, amount_cop, iva_cop, total_cop,
      status, due_date
    ) VALUES (
      '00000000-bbbb-0000-0000-000000000011',
      '00000000-bbbb-0000-0000-000000000001',
      '00000000-bbbb-0000-0000-000000000003',
      '00000000-bbbb-0000-0000-000000000002',
      now(), now() + interval '30 days',
      99000, 18810, 117810,
      'open', now()
    );
    RAISE EXCEPTION 'Test 2 FAILED: se permitio segunda factura open para la misma suscripcion';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Test 2 PASSED: indice unique bloqueo doble factura open';
  END;
END;
$$;

-- ─── Test 3: factura "paid" para la misma suscripción debe permitirse ─────────
INSERT INTO invoices (
  id, organization_id, subscription_id, plan_id,
  period_start, period_end, amount_cop, iva_cop, total_cop,
  status, due_date
) VALUES (
  '00000000-bbbb-0000-0000-000000000012',
  '00000000-bbbb-0000-0000-000000000001',
  '00000000-bbbb-0000-0000-000000000003',
  '00000000-bbbb-0000-0000-000000000002',
  now() - interval '30 days', now(),
  99000, 18810, 117810,
  'paid', now() - interval '30 days'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = '00000000-bbbb-0000-0000-000000000012') THEN
    RAISE EXCEPTION 'Test 3 FAILED: factura paid no fue insertada';
  END IF;
  RAISE NOTICE 'Test 3 PASSED: factura paid coexiste sin restriccion del indice';
END;
$$;

-- ─── Test 4: billing_exempt NOT NULL en organizations ────────────────────────
DO $$
BEGIN
  BEGIN
    INSERT INTO organizations (id, name, slug, billing_exempt)
    VALUES ('00000000-bbbb-0000-0000-000000000099', 'Null Exempt Test', 'null-exempt-049', NULL);
    RAISE EXCEPTION 'Test 4 FAILED: se permitio billing_exempt = NULL';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'Test 4 PASSED: NOT NULL rechazo billing_exempt = NULL';
  END;
END;
$$;

ROLLBACK;
