-- Test: migration 044 reserved slugs
-- Ejecutar via execute_sql (Supabase MCP) o psql como service_role.
-- Pattern BEGIN/ROLLBACK — seguro contra prod.

BEGIN;

-- =============================================================================
-- Test 1: suggest_unique_slug('admin') NO devuelve 'admin'
-- =============================================================================
DO $$
DECLARE r TEXT;
BEGIN
  r := suggest_unique_slug('admin');
  IF r = 'admin' THEN
    RAISE EXCEPTION 'FAIL test 1: suggest_unique_slug("admin") devolvió "admin" (reserved)';
  END IF;
  RAISE NOTICE 'PASS test 1: suggest_unique_slug("admin") = %', r;
END $$;

-- =============================================================================
-- Test 2: suggest_unique_slug('www') NO devuelve 'www'
-- =============================================================================
DO $$
DECLARE r TEXT;
BEGIN
  r := suggest_unique_slug('www');
  IF r = 'www' THEN
    RAISE EXCEPTION 'FAIL test 2: suggest_unique_slug("www") devolvió "www" (reserved)';
  END IF;
  RAISE NOTICE 'PASS test 2: suggest_unique_slug("www") = %', r;
END $$;

-- =============================================================================
-- Test 3: INSERT directo con slug reservado falla CHECK constraint
-- =============================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO organizations (id, name, slug, plan, status, trial_ends_at, country)
    VALUES (
      gen_random_uuid(), 'Test Admin Org', 'admin', 'trial', 'trialing',
      now() + INTERVAL '30 days', 'CO'
    );
    RAISE EXCEPTION 'FAIL test 3: INSERT con slug "admin" debería fallar pero no falló';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS test 3: CHECK constraint rechaza slug "admin"';
  END;
END $$;

-- =============================================================================
-- Test 4: approve_demo_request con slug reservado falla con mensaje claro
-- =============================================================================
-- Setup: fake demo_request
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
VALUES (
  '99999999-1111-1111-1111-111111111111',
  'Reserved Test', 'reserved@example.com', 'Reserved Org',
  '+57 300 000 0000', 'salud', 'new'
);

DO $$
BEGIN
  BEGIN
    PERFORM approve_demo_request(
      '99999999-1111-1111-1111-111111111111',
      'Reserved Org',
      'admin',
      'trial', 'reserved@example.com', 'Reserved', 'Test',
      '7e75517e-b3bd-4092-abaf-f9106a184a07'::UUID
    );
    RAISE EXCEPTION 'FAIL test 4: approve_demo_request con slug "admin" debería fallar';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS test 4: approve_demo_request rechaza slug "admin"';
  END;
END $$;

-- =============================================================================
-- Test 5: approve_demo_request con slug válido pasa (sanity check)
-- =============================================================================
DO $$
DECLARE result JSONB;
BEGIN
  result := approve_demo_request(
    '99999999-1111-1111-1111-111111111111',
    'Reserved Org',
    'valid-slug-test-' || floor(random() * 100000)::TEXT,
    'trial', 'reserved@example.com', 'Reserved', 'Test',
    '7e75517e-b3bd-4092-abaf-f9106a184a07'::UUID
  );
  IF (result->>'success')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL test 5: approve_demo_request con slug válido no retornó success=true';
  END IF;
  RAISE NOTICE 'PASS test 5: approve_demo_request acepta slug válido';
END $$;

ROLLBACK;
