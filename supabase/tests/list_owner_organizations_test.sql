-- =============================================================================
-- Test: list_owner_organizations (migración 054)
-- =============================================================================
-- Valida el RPC SECURITY DEFINER list_owner_organizations SIN aplicarlo a prod:
-- el DDL corre DENTRO de BEGIN ... ROLLBACK, por lo que nada se persiste.
--
-- Punto clave: el RPC debe listar TODAS las orgs aunque el super_admin tenga un
-- tenant activo (caso en que is_super_admin()=false y la RLS de organizations
-- devolvería solo 1). El check de rol es CRUDO (role='super_admin'), no la
-- función tenant-aware is_super_admin().
--
-- Pattern: igual que super_admin_active_org_test.sql
--   - SET LOCAL role authenticated; + SET LOCAL "request.jwt.claim.sub"
--   - asserts en bloques DO $$ ... ASSERT ... $$
--   - el setup (INSERTs) corre como service_role antes del SET LOCAL role.
--
-- NOTA: list_owner_organizations depende de set_active_org / super_admin_active_org
-- (migración 053, ya aplicada en cloud), por lo que el test NO los recrea.
-- =============================================================================

BEGIN;

-- =============================================================================
-- (a) DDL de migración 054 (verbatim, sin su propio BEGIN;/COMMIT;)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_owner_organizations()
RETURNS TABLE (
  id                     UUID,
  name                   TEXT,
  slug                   TEXT,
  status                 TEXT,
  billing_exempt         BOOLEAN,
  current_plan_id        TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  subscription_status    TEXT,
  employee_count         BIGINT,
  location_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'solo super_admin puede listar organizaciones';
  END IF;

  RETURN QUERY
    SELECT
      o.id, o.name, o.slug, o.status, o.billing_exempt, o.current_plan_id,
      o.onboarding_completed_at,
      (SELECT s.status FROM subscriptions s
         WHERE s.organization_id = o.id
         ORDER BY s.created_at DESC LIMIT 1) AS subscription_status,
      (SELECT count(*) FROM profiles p
         WHERE p.organization_id = o.id AND p.is_active) AS employee_count,
      (SELECT count(*) FROM locations l
         WHERE l.organization_id = o.id) AS location_count
    FROM organizations o
    ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_owner_organizations() TO authenticated;

-- =============================================================================
-- (b) Setup de datos
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Test Org A', 'test-org-a', 'starter', 'active', 'CO', 'America/Bogota'),
  ('00000000-0000-0000-0000-0000000000b2', 'Test Org B', 'test-org-b', 'starter', 'active', 'CO', 'America/Bogota');

INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-a@test.com', 'Admin', 'A', 'admin', '00000000-0000-0000-0000-0000000000a1', true),
  ('99999999-0000-0000-0000-000000000009', 'super@saas.com', 'Super', 'Admin', 'super_admin', NULL, true);

-- super_admin_active_org.user_id tiene FK a auth.users(id) (las profiles NO la
-- tienen desde migración 011). Sembramos un auth.users mínimo para el super_admin
-- para que set_active_org satisfaga la FK. Rollback al final lo descarta.
INSERT INTO auth.users (id) VALUES ('99999999-0000-0000-0000-000000000009');

INSERT INTO locations (id, organization_id, name) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Sede A'),
  ('b2b2b2b2-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Sede B');

SET LOCAL role authenticated;

-- TEST 1: super_admin SIN tenant activo -> lista >= 2 orgs
SET LOCAL "request.jwt.claim.sub" TO '99999999-0000-0000-0000-000000000009';
DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.list_owner_organizations();
  ASSERT v_n >= 2, format('TEST 1 FAILED: lista %s orgs sin tenant activo (esperado >= 2)', v_n);
  RAISE NOTICE 'TEST 1 PASSED: super_admin sin tenant activo lista % orgs', v_n;
END $$;

-- TEST 2: super_admin CON tenant activo = Org A -> STILL lista >= 2 orgs
-- (clave: el RPC bypasea el gate tenant-aware). is_super_admin() debe ser false aquí.
SELECT public.set_active_org('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_n INT; v_super BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = false, 'TEST 2a FAILED: is_super_admin debe ser false con tenant activo';
  SELECT COUNT(*) INTO v_n FROM public.list_owner_organizations();
  ASSERT v_n >= 2, format('TEST 2b FAILED: lista %s orgs CON tenant activo (esperado >= 2)', v_n);
  RAISE NOTICE 'TEST 2 PASSED: con tenant activo (is_super_admin=false) el RPC aún lista % orgs', v_n;
END $$;

-- TEST 3: usuario normal (admin-a) -> el RPC LANZA excepción
SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-0000-0000-0000-000000000001';
DO $$
DECLARE v_failed BOOLEAN := false; v_n INT;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.list_owner_organizations();
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  ASSERT v_failed = true, 'TEST 3 FAILED: admin normal pudo llamar list_owner_organizations';
  RAISE NOTICE 'TEST 3 PASSED: list_owner_organizations bloqueado para no-super_admin';
END $$;

-- TEST 4: métricas -> la org del admin-a reporta employee_count >= 1
SET LOCAL "request.jwt.claim.sub" TO '99999999-0000-0000-0000-000000000009';
-- Limpiar tenant activo del super para volver a modo panel (no afecta el RPC, pero
-- mantiene el estado limpio y reafirma que funciona en modo panel).
SELECT public.set_active_org(NULL);
DO $$
DECLARE v_emp BIGINT;
BEGIN
  SELECT employee_count INTO v_emp
  FROM public.list_owner_organizations()
  WHERE id = '00000000-0000-0000-0000-0000000000a1';
  ASSERT v_emp >= 1, format('TEST 4 FAILED: Org A reporta employee_count=%s (esperado >= 1)', v_emp);
  RAISE NOTICE 'TEST 4 PASSED: Org A reporta employee_count=% (>= 1)', v_emp;
END $$;

ROLLBACK;
SELECT 'list_owner_organizations: 4 tests PASSED' AS result;
