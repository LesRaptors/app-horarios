-- Test: approve_demo_request RPC
-- Ejecutar via execute_sql (Supabase MCP) o psql como service_role.
-- Pattern BEGIN/ROLLBACK para no ensuciar prod.
--
-- Estrategia:
--   - Setup y verification queries corren como service_role (bypass RLS).
--   - SET LOCAL role authenticated + claim sub solo cuando se llama el RPC,
--     para que is_super_admin() resuelva contra la session_authorization simulada.
--   - RESET role + claim entre tests para que los SELECTs de verificación no
--     caigan bajo RLS de demo_requests/organizations.

BEGIN;

-- Setup (service_role): fake demo_request
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
VALUES (
  '88888888-1111-1111-1111-111111111111',
  'Test User',
  'test@example.com',
  'Test Empresa',
  '+57 300 000 0000',
  'salud',
  'new'
);

-- Test 1: super_admin (suv411@hotmail.com) puede aprobar
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '7e75517e-b3bd-4092-abaf-f9106a184a07';

DO $$
DECLARE result JSONB;
BEGIN
  result := approve_demo_request(
    '88888888-1111-1111-1111-111111111111',
    'Test Empresa',
    'test-empresa-' || floor(random() * 100000)::TEXT,
    'trial',
    'test@example.com',
    'Test',
    'User'
  );
  ASSERT (result->>'success')::BOOLEAN = true, 'TEST 1 FAILED: success=false';
  ASSERT (result->>'organization_id') IS NOT NULL, 'TEST 1 FAILED: no org id';
  RAISE NOTICE 'TEST 1 PASSED: org % created', result->>'organization_id';
END $$;

RESET role;
RESET "request.jwt.claim.sub";

-- Test 2: demo_request marcado approved + linked
DO $$
DECLARE
  v_status TEXT;
  v_approved_org UUID;
BEGIN
  SELECT status, approved_org_id INTO v_status, v_approved_org
  FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111';
  ASSERT v_status = 'approved', format('TEST 2 FAILED: status=%s', v_status);
  ASSERT v_approved_org IS NOT NULL, 'TEST 2 FAILED: no approved_org_id';
  RAISE NOTICE 'TEST 2 PASSED: demo_request status=approved, linked to org';
END $$;

-- Test 3: organization tiene trial_ends_at ≈ now() + 30 days
DO $$
DECLARE v_trial_ends TIMESTAMPTZ;
BEGIN
  SELECT trial_ends_at INTO v_trial_ends FROM organizations
  WHERE id=(SELECT approved_org_id FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111');
  ASSERT v_trial_ends > now() + INTERVAL '29 days',
    format('TEST 3 FAILED: trial_ends_at=%s', v_trial_ends);
  ASSERT v_trial_ends < now() + INTERVAL '31 days',
    format('TEST 3 FAILED: trial_ends_at=%s (too far)', v_trial_ends);
  RAISE NOTICE 'TEST 3 PASSED: trial_ends_at = %', v_trial_ends;
END $$;

-- Setup TEST 4: admin no super_admin
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', 'admin-test@evi.co', 'Admin', 'Test', 'admin',
        '00000000-0000-0000-0000-000000000001', true);

SET LOCAL role authenticated;
SET LOCAL "request.jwt.claim.sub" TO '44444444-4444-4444-4444-444444444444';

DO $$
DECLARE
  call_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM approve_demo_request(
      '88888888-1111-1111-1111-111111111111',
      'Hack Org', 'hack-org', 'trial', 'hack@test.com', 'Hack', 'Er'
    );
  EXCEPTION WHEN insufficient_privilege OR others THEN
    call_failed := true;
  END;
  ASSERT call_failed = true, 'TEST 4 FAILED: non-super_admin pudo aprobar';
  RAISE NOTICE 'TEST 4 PASSED: non-super_admin bloqueado';
END $$;

ROLLBACK;

SELECT 'All 4 approve_demo_request tests PASSED' AS result;
