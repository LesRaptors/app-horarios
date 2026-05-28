-- =============================================================================
-- Test: approve_demo_request crea la subscription en trial (migración 056)
-- =============================================================================
-- Valida la lógica de migración 056 (demo_requests.updated_at + trigger +
-- approve_demo_request que ahora INSERTA una subscription en 'trialing') SIN
-- aplicarla a prod: se aplica el DDL DENTRO de la transacción BEGIN ... ROLLBACK,
-- por lo que nada se persiste.
--
-- Pattern: igual que super_admin_active_org_test.sql / multi_tenant_isolation_test.sql
--   - DDL de la migración verbatim, sin su propio BEGIN;/COMMIT;
--   - setup como service_role (Supabase MCP) -> RLS no bloquea la siembra
--   - asserts en bloques DO $$ ... ASSERT ... $$
--
-- 4 asserts:
--   1. aprobar crea exactamente 1 subscription para la org nueva
--   2. status='trialing' y current_period_end = trial_ends_at
--   3. demo_requests.status pasa a 'approved'
--   4. plan 'trial' (no válido para subscriptions.plan_id FK plans) cae a 'starter'
-- =============================================================================

BEGIN;

-- =============================================================================
-- (a) DDL de migración 056 (verbatim, sin su propio BEGIN;/COMMIT;)
-- =============================================================================

-- 1. updated_at + trigger
ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS demo_requests_set_updated_at ON public.demo_requests;
CREATE TRIGGER demo_requests_set_updated_at
  BEFORE UPDATE ON public.demo_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Redefinir approve_demo_request para crear la subscription en trial.
CREATE OR REPLACE FUNCTION approve_demo_request(
  p_demo_request_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_admin_email TEXT,
  p_admin_first_name TEXT,
  p_admin_last_name TEXT,
  p_approver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY['www', 'admin', 'api', 'app', 'auth', 'mail', 'static'];
  v_new_org_id UUID;
  v_trial_end TIMESTAMPTZ := now() + INTERVAL '30 days';
  v_plan_id TEXT := CASE WHEN p_plan IN ('starter','pro','enterprise') THEN p_plan ELSE 'starter' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approver_id AND role = 'super_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden: approver must be active super_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF lower(p_org_slug) = ANY(reserved) THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used', p_org_slug
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', v_trial_end, 'CO')
  RETURNING id INTO v_new_org_id;

  UPDATE demo_requests
    SET status = 'approved',
        approved_org_id = v_new_org_id,
        approved_at = now(),
        approved_by = p_approver_id
  WHERE id = p_demo_request_id;

  UPDATE organizations
    SET approved_by = p_approver_id,
        approved_from_demo_request_id = p_demo_request_id
  WHERE id = v_new_org_id;

  -- NUEVO: crear subscription en trial (vigencia real para el dunning)
  INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (v_new_org_id, v_plan_id, 'trialing', now(), v_trial_end);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', v_trial_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- (b) Setup
-- =============================================================================
-- super_admin_active_org y otras tablas tienen FK a auth.users(id); sembramos un
-- auth.users mínimo para el super_admin. Las profiles NO tienen esa FK desde la
-- migración 011, pero la siembra es segura. Rollback al final lo descarta.
INSERT INTO auth.users (id) VALUES ('99999999-0000-0000-0000-000000000009');
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
  VALUES ('99999999-0000-0000-0000-000000000009', 'super@saas.com', 'Super', 'Admin', 'super_admin', NULL, true);

INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
  VALUES ('dddddddd-0000-0000-0000-000000000001', 'Lead Test', 'lead-test@example.com', 'Acme SAS', '3001234567', 'otro', 'new');

-- TEST 1-3: aprobar crea subscription trialing con period_end = trial_ends_at
DO $$
DECLARE v_result JSONB; v_org UUID; v_sub_count INT; v_sub_status TEXT; v_period_end TIMESTAMPTZ; v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT approve_demo_request(
    'dddddddd-0000-0000-0000-000000000001',
    'Acme SAS', 'acme-sas', 'starter',
    'lead-test@example.com', 'Lead', 'Test',
    '99999999-0000-0000-0000-000000000009'
  ) INTO v_result;
  v_org := (v_result->>'organization_id')::UUID;
  v_trial_end := (v_result->>'trial_ends_at')::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_sub_count FROM subscriptions WHERE organization_id = v_org;
  ASSERT v_sub_count = 1, format('TEST 1 FAILED: %s subscriptions (esperado 1)', v_sub_count);

  SELECT status, current_period_end INTO v_sub_status, v_period_end FROM subscriptions WHERE organization_id = v_org;
  ASSERT v_sub_status = 'trialing', format('TEST 2a FAILED: status=%s', v_sub_status);
  ASSERT v_period_end = v_trial_end, 'TEST 2b FAILED: current_period_end != trial_ends_at';

  ASSERT (SELECT status FROM demo_requests WHERE id = 'dddddddd-0000-0000-0000-000000000001') = 'approved', 'TEST 3 FAILED';
  RAISE NOTICE 'TESTS 1-3 PASSED';
END $$;

-- TEST 4: plan 'trial' cae a 'starter' en la subscription
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
  VALUES ('dddddddd-0000-0000-0000-000000000002', 'Lead 2', 'lead2@example.com', 'Beta SAS', '3001112222', 'otro', 'new');
DO $$
DECLARE v_result JSONB; v_plan TEXT;
BEGIN
  SELECT approve_demo_request(
    'dddddddd-0000-0000-0000-000000000002',
    'Beta SAS', 'beta-sas', 'trial',
    'lead2@example.com', 'Lead', 'Two',
    '99999999-0000-0000-0000-000000000009'
  ) INTO v_result;
  SELECT plan_id INTO v_plan FROM subscriptions WHERE organization_id = (v_result->>'organization_id')::UUID;
  ASSERT v_plan = 'starter', format('TEST 4 FAILED: plan_id=%s (esperado starter)', v_plan);
  RAISE NOTICE 'TEST 4 PASSED: plan trial -> starter';
END $$;

ROLLBACK;
SELECT 'approve_demo_request_subscription: 4 tests PASSED' AS result;
