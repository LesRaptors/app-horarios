-- =============================================================================
-- Test: aislamiento cross-tenant multi-tenant model
-- Ejecutar DESPUÉS de aplicar migration 039.
-- Pattern: BEGIN ... ROLLBACK para no ensuciar prod.
-- =============================================================================

BEGIN;

-- Setup: crear segunda org de prueba
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES ('00000000-0000-0000-0000-000000000099', 'Test Org B', 'test-org-b', 'starter', 'active', 'CO', 'America/Bogota');

-- Crear usuarios falsos (sin auth.users — bypass via service_role para el test)
-- NOTA: este test asume que SE EJECUTA con service_role (Supabase MCP usa service_role).

INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com', 'Admin', 'A', 'admin', '00000000-0000-0000-0000-000000000001', true),
  ('22222222-2222-2222-2222-222222222222', 'admin-b@test.com', 'Admin', 'B', 'admin', '00000000-0000-0000-0000-000000000099', true);

-- Crear datos en cada org
INSERT INTO locations (id, organization_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'Sede A1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000099', 'Sede B1');

-- =============================================================================
-- Test 1: admin-a NO debe ver locations de Org B
-- =============================================================================
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  cross_tenant_count INT;
BEGIN
  SELECT COUNT(*) INTO cross_tenant_count FROM locations
    WHERE organization_id = '00000000-0000-0000-0000-000000000099';
  ASSERT cross_tenant_count = 0,
    format('TEST 1 FAILED: admin-a saw %s rows of Org B locations', cross_tenant_count);
  RAISE NOTICE 'TEST 1 PASSED: admin-a sees 0 rows of Org B';
END $$;

-- =============================================================================
-- Test 2: admin-a NO puede INSERT en Org B
-- =============================================================================
DO $$
DECLARE
  insert_failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO locations (organization_id, name) VALUES
      ('00000000-0000-0000-0000-000000000099', 'Hack Sede');
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    insert_failed := true;
  END;
  ASSERT insert_failed = true, 'TEST 2 FAILED: admin-a was able to INSERT in Org B';
  RAISE NOTICE 'TEST 2 PASSED: admin-a INSERT in Org B was blocked';
END $$;

-- =============================================================================
-- Test 3: admin-a SÍ ve sus propios datos (Org A)
-- =============================================================================
DO $$
DECLARE
  own_count INT;
BEGIN
  SELECT COUNT(*) INTO own_count FROM locations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001';
  ASSERT own_count >= 1, format('TEST 3 FAILED: admin-a sees %s rows of Org A (expected >= 1)', own_count);
  RAISE NOTICE 'TEST 3 PASSED: admin-a sees % rows of Org A', own_count;
END $$;

-- =============================================================================
-- Test 4: super_admin ve TODO
-- =============================================================================
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
  VALUES ('33333333-3333-3333-3333-333333333333', 'super@saas.com', 'Super', 'Admin', 'super_admin', NULL, true);

SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE
  total_orgs INT;
BEGIN
  SELECT COUNT(DISTINCT organization_id) INTO total_orgs FROM locations;
  ASSERT total_orgs >= 2, format('TEST 4 FAILED: super_admin sees only %s orgs (expected >= 2)', total_orgs);
  RAISE NOTICE 'TEST 4 PASSED: super_admin sees % orgs', total_orgs;
END $$;

-- =============================================================================
-- Test 5: holidays nacionales visibles a admin-a (CO country)
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  national_count INT;
BEGIN
  SELECT COUNT(*) INTO national_count FROM holidays
    WHERE organization_id IS NULL AND country = 'CO';
  ASSERT national_count > 0,
    format('TEST 5 FAILED: admin-a sees %s national CO holidays (expected > 0)', national_count);
  RAISE NOTICE 'TEST 5 PASSED: admin-a sees % national CO holidays', national_count;
END $$;

-- =============================================================================
-- Test 6: admin-a NO puede modificar holidays nacionales
-- =============================================================================
DO $$
DECLARE
  affected_rows INT := 0;
BEGIN
  UPDATE holidays SET name = 'HACKED' WHERE organization_id IS NULL;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ASSERT affected_rows = 0,
    format('TEST 6 FAILED: admin-a updated %s national holidays', affected_rows);
  RAISE NOTICE 'TEST 6 PASSED: admin-a UPDATE national holidays blocked (% rows affected)', affected_rows;
END $$;

-- =============================================================================
-- Test 7: helper get_user_org_id() retorna el correcto
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE
  resolved_org UUID;
BEGIN
  SELECT public.get_user_org_id() INTO resolved_org;
  ASSERT resolved_org = '00000000-0000-0000-0000-000000000001',
    format('TEST 7 FAILED: get_user_org_id returned %s', resolved_org);
  RAISE NOTICE 'TEST 7 PASSED: get_user_org_id() = %', resolved_org;
END $$;

-- =============================================================================
-- Test 8: helper is_super_admin() funciona
-- =============================================================================
SET LOCAL "request.jwt.claim.sub" TO '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE
  is_super BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO is_super;
  ASSERT is_super = true, 'TEST 8 FAILED: is_super_admin returned false for super_admin';
  RAISE NOTICE 'TEST 8 PASSED: is_super_admin() = true for super';
END $$;

SET LOCAL "request.jwt.claim.sub" TO '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE
  is_super BOOLEAN;
BEGIN
  SELECT public.is_super_admin() INTO is_super;
  ASSERT is_super = false, 'TEST 8b FAILED: is_super_admin returned true for admin';
  RAISE NOTICE 'TEST 8b PASSED: is_super_admin() = false for admin';
END $$;

ROLLBACK;

-- Si llegaste acá sin EXCEPTION, todos los tests pasaron.
SELECT 'All 8 isolation tests PASSED' AS result;
