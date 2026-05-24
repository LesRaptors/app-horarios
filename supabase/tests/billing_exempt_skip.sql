-- =============================================================================
-- Test: cron query excluye orgs con billing_exempt=true
-- Reproduce el SELECT que ejecuta /api/cron/billing/process-cycles (spec sección 4.4):
--   SELECT id FROM subscriptions s
--    JOIN organizations o ON o.id = s.organization_id
--   WHERE o.billing_exempt = false
--     AND s.current_period_end <= now()
--     AND s.status IN ('active','trialing');
--
-- Setup: 1 org exempta + 1 org no-exempta, ambas con subscription
-- vencida (current_period_end en el pasado). Solo la no-exempta debe aparecer.
--
-- Ejecutar DESPUÉS de aplicar migration 046. Service_role (bypassa RLS).
-- Pattern: BEGIN ... ROLLBACK — seguro contra prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Setup: 2 orgs (1 exempta, 1 no), 2 subscriptions vencidas
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone, billing_exempt)
VALUES
  ('00000000-0000-0000-0000-000000000ddd', 'Test Org D Exempt',    'test-org-d-exempt',    'enterprise', 'active', 'CO', 'America/Bogota', true),
  ('00000000-0000-0000-0000-000000000eee', 'Test Org E NotExempt', 'test-org-e-notexempt', 'starter',    'active', 'CO', 'America/Bogota', false);

INSERT INTO subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end)
VALUES
  -- Exempta: current_period_end en el pasado, status='active'
  ('dddd4444-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000ddd', 'enterprise', 'active', now() - INTERVAL '31 days', now() - INTERVAL '1 day'),
  -- No exempta: misma situación
  ('eeee5555-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000eee', 'starter',    'active', now() - INTERVAL '31 days', now() - INTERVAL '1 day');

-- =============================================================================
-- Test 1: cron query devuelve SOLO la no-exempta
-- =============================================================================
DO $$
DECLARE
  due_ids UUID[];
  exempt_in_result BOOLEAN;
  notexempt_in_result BOOLEAN;
BEGIN
  -- Reproducir cron query
  SELECT array_agg(s.id) INTO due_ids
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
   WHERE o.billing_exempt = false
     AND s.current_period_end <= now()
     AND s.status IN ('active','trialing')
     -- Filtrar solo nuestras orgs de prueba para que prod data no interfiera
     AND s.organization_id IN (
       '00000000-0000-0000-0000-000000000ddd',
       '00000000-0000-0000-0000-000000000eee'
     );

  exempt_in_result    := 'dddd4444-0000-0000-0000-000000000001'::UUID = ANY(COALESCE(due_ids, ARRAY[]::UUID[]));
  notexempt_in_result := 'eeee5555-0000-0000-0000-000000000001'::UUID = ANY(COALESCE(due_ids, ARRAY[]::UUID[]));

  IF exempt_in_result THEN
    RAISE EXCEPTION 'FAIL test 1a: org exempta apareció en resultado del cron query';
  END IF;
  IF NOT notexempt_in_result THEN
    RAISE EXCEPTION 'FAIL test 1b: org no-exempta NO apareció en resultado del cron query';
  END IF;
  RAISE NOTICE 'PASS test 1: cron query excluye exempta, incluye no-exempta';
END $$;

-- =============================================================================
-- Test 2: LR (id fijo grandfathered) tiene billing_exempt=true tras migration
-- =============================================================================
DO $$
DECLARE v_exempt BOOLEAN;
BEGIN
  SELECT billing_exempt INTO v_exempt
    FROM organizations
   WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_exempt IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 2: LR.billing_exempt = % (esperado true tras migration)', v_exempt;
  END IF;
  RAISE NOTICE 'PASS test 2: LR sigue exempta (grandfathered)';
END $$;

-- =============================================================================
-- Test 3: la org no-exempta SÍ pasa el filtro de status (active/trialing)
--         pero una en past_due NO debería pasar
-- =============================================================================
SAVEPOINT sp3;

UPDATE subscriptions SET status='past_due'
 WHERE id = 'eeee5555-0000-0000-0000-000000000001';

DO $$
DECLARE
  due_count INT;
BEGIN
  SELECT COUNT(*) INTO due_count
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
   WHERE o.billing_exempt = false
     AND s.current_period_end <= now()
     AND s.status IN ('active','trialing')
     AND s.organization_id = '00000000-0000-0000-0000-000000000eee';

  IF due_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 3: subscription past_due apareció en cron query (%)', due_count;
  END IF;
  RAISE NOTICE 'PASS test 3: subscription past_due correctamente excluida del cron query';
END $$;

ROLLBACK TO SAVEPOINT sp3;

ROLLBACK;

SELECT 'All 3 billing_exempt_skip tests PASSED' AS result;
