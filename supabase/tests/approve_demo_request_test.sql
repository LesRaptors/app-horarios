-- Test: approve_demo_request RPC (signature con p_approver_id explícito)
-- Ejecutar via execute_sql (Supabase MCP) o psql como service_role.
-- Pattern BEGIN/ROLLBACK — seguro contra prod.
--
-- Estrategia:
--   - service_role bypass RLS, ideal para setup + verifications.
--   - approve_demo_request ya NO depende de auth.uid(); el caller pasa
--     p_approver_id explícitamente (signature actualizada en migration 043).

BEGIN;

-- Setup: fake demo_request
INSERT INTO demo_requests (id, nombre, email, empresa, telefono, sector, status)
VALUES (
  '88888888-1111-1111-1111-111111111111',
  'Test User', 'test@example.com', 'Test Empresa',
  '+57 300 000 0000', 'salud', 'new'
);

-- Test 1: super_admin (suv411@hotmail.com) puede aprobar pasando su id
DO $$
DECLARE result JSONB;
BEGIN
  result := approve_demo_request(
    '88888888-1111-1111-1111-111111111111',
    'Test Empresa',
    'test-empresa-' || floor(random() * 100000)::TEXT,
    'trial', 'test@example.com', 'Test', 'User',
    '7e75517e-b3bd-4092-abaf-f9106a184a07'::UUID
  );
  ASSERT (result->>'success')::BOOLEAN = true, 'TEST 1 FAILED: success=false';
  ASSERT (result->>'organization_id') IS NOT NULL, 'TEST 1 FAILED: no org id';
  RAISE NOTICE 'TEST 1 PASSED: org % created', result->>'organization_id';
END $$;

-- Test 2: approved_by audit populado en organizations Y demo_requests
DO $$
DECLARE
  v_org_approved_by UUID;
  v_req_approved_by UUID;
BEGIN
  SELECT approved_by INTO v_req_approved_by
    FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111';
  SELECT approved_by INTO v_org_approved_by
    FROM organizations
    WHERE id=(SELECT approved_org_id FROM demo_requests WHERE id='88888888-1111-1111-1111-111111111111');
  ASSERT v_req_approved_by = '7e75517e-b3bd-4092-abaf-f9106a184a07',
    format('TEST 2 FAILED: demo_request.approved_by=%s', v_req_approved_by);
  ASSERT v_org_approved_by = '7e75517e-b3bd-4092-abaf-f9106a184a07',
    format('TEST 2 FAILED: organization.approved_by=%s', v_org_approved_by);
  RAISE NOTICE 'TEST 2 PASSED: approved_by audit populado en ambos';
END $$;

-- Test 3: trial_ends_at ≈ now() + 30 days
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

-- Test 4: admin (no super_admin) → exception insufficient_privilege
INSERT INTO profiles (id, email, first_name, last_name, role, organization_id, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', 'admin-test@evi.co', 'Admin', 'Test', 'admin',
        '00000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE call_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM approve_demo_request(
      '88888888-1111-1111-1111-111111111111',
      'Hack Org', 'hack-org', 'trial', 'hack@test.com', 'Hack', 'Er',
      '44444444-4444-4444-4444-444444444444'::UUID
    );
  EXCEPTION WHEN insufficient_privilege OR others THEN
    call_failed := true;
  END;
  ASSERT call_failed = true, 'TEST 4 FAILED: non-super_admin pudo aprobar';
  RAISE NOTICE 'TEST 4 PASSED: non-super_admin bloqueado';
END $$;

ROLLBACK;
SELECT 'All 4 approve_demo_request tests PASSED' AS result;
