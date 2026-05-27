-- =============================================================================
-- Test: tenant activo del super_admin (migración 053)
-- =============================================================================
-- Valida la lógica de migración 053 (is_super_admin / get_user_org_id /
-- get_user_role tenant-aware + super_admin_active_org + set_active_org) SIN
-- aplicarla a prod: se aplica el DDL DENTRO de la transacción BEGIN ... ROLLBACK,
-- por lo que nada se persiste.
--
-- Pattern: igual que multi_tenant_isolation_test.sql
--   - SET LOCAL role authenticated; + SET LOCAL "request.jwt.claim.sub"
--   - asserts en bloques DO $$ ... ASSERT ... $$
--
-- NOTA: el setup (INSERTs) corre como service_role (Supabase MCP) antes del
-- SET LOCAL role authenticated, por lo que RLS no bloquea la siembra.
--
-- 3 estados de la tabla de verdad + aislamiento de escritura:
--   super_admin SIN tenant activo  -> is_super_admin()=true (modo panel, ve todo)
--   super_admin CON tenant activo  -> is_super_admin()=false, org=tenant, role='admin'
--   usuario normal                 -> sin cambios
-- =============================================================================

BEGIN;

-- =============================================================================
-- (a) DDL de migración 053 (verbatim, sin su propio BEGIN;/COMMIT;)
-- =============================================================================

-- 1. Tabla del tenant activo (1 fila por super_admin)
CREATE TABLE IF NOT EXISTS public.super_admin_active_org (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_active_org ENABLE ROW LEVEL SECURITY;

-- El super_admin solo lee su propia fila (la escritura va por RPC SECURITY DEFINER)
DROP POLICY IF EXISTS saao_self ON public.super_admin_active_org;
CREATE POLICY saao_self ON public.super_admin_active_org
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. RPC para setear/limpiar el tenant activo
CREATE OR REPLACE FUNCTION public.set_active_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check CRUDO de rol (no la función is_super_admin(), que es tenant-aware)
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'solo super_admin puede cambiar de organización';
  END IF;

  IF p_org_id IS NULL THEN
    DELETE FROM super_admin_active_org WHERE user_id = auth.uid();
  ELSE
    INSERT INTO super_admin_active_org (user_id, active_org_id)
    VALUES (auth.uid(), p_org_id)
    ON CONFLICT (user_id) DO UPDATE
      SET active_org_id = EXCLUDED.active_org_id, updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_org(UUID) TO authenticated;

-- 3. Helper interno: rol crudo + org propia + tenant activo en UNA fila
--    (evita 2 SELECTs por policy; STABLE -> cacheado por query)
CREATE OR REPLACE FUNCTION public._user_ctx()
RETURNS TABLE(raw_role TEXT, own_org UUID, active_org UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.role, p.organization_id, s.active_org_id
  FROM profiles p
  LEFT JOIN super_admin_active_org s ON s.user_id = p.id
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public._user_ctx() TO authenticated;

-- 4. Redefinir las 3 funciones para ser tenant-aware
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT raw_role = 'super_admin' AND active_org IS NULL FROM public._user_ctx()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN raw_role = 'super_admin' THEN active_org ELSE own_org END
  FROM public._user_ctx();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw_role = 'super_admin' AND active_org IS NOT NULL THEN 'admin'
    ELSE raw_role
  END
  FROM public._user_ctx();
$$;

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

-- TEST 1: super_admin SIN tenant activo -> modo panel (is_super_admin=true, ve ambas orgs)
SET LOCAL "request.jwt.claim.sub" TO '99999999-0000-0000-0000-000000000009';
DO $$
DECLARE v_super BOOLEAN; v_orgs INT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = true, 'TEST 1a FAILED: is_super_admin no es true en modo panel';
  SELECT COUNT(DISTINCT organization_id) INTO v_orgs FROM locations;
  ASSERT v_orgs >= 2, format('TEST 1b FAILED: super_admin ve %s orgs (esperado >= 2)', v_orgs);
  RAISE NOTICE 'TEST 1 PASSED: modo panel ve todo';
END $$;

-- TEST 2: super_admin CON tenant activo = Org A -> opera como admin de A
-- Se setea el tenant vía el RPC SECURITY DEFINER (única vía de escritura: la
-- tabla solo tiene policy de SELECT, no de INSERT). Como rol authenticated con
-- sub = super, set_active_org pasa el check de rol crudo super_admin.
SELECT public.set_active_org('00000000-0000-0000-0000-0000000000a1');
DO $$
DECLARE v_super BOOLEAN; v_org UUID; v_role TEXT; v_b INT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = false, 'TEST 2a FAILED: is_super_admin debe ser false con tenant activo';
  SELECT public.get_user_org_id() INTO v_org;
  ASSERT v_org = '00000000-0000-0000-0000-0000000000a1', format('TEST 2b FAILED: get_user_org_id=%s', v_org);
  SELECT public.get_user_role() INTO v_role;
  ASSERT v_role = 'admin', format('TEST 2c FAILED: get_user_role=%s (esperado admin)', v_role);
  SELECT COUNT(*) INTO v_b FROM locations WHERE organization_id = '00000000-0000-0000-0000-0000000000b2';
  ASSERT v_b = 0, format('TEST 2d FAILED: operando en A ve %s locations de B', v_b);
  RAISE NOTICE 'TEST 2 PASSED: opera como admin de A, no ve B';
END $$;

-- TEST 3: super_admin operando en A PUEDE insertar en A, NO en B
DO $$
DECLARE v_failed BOOLEAN := false;
BEGIN
  INSERT INTO locations (organization_id, name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Sede A2');
  RAISE NOTICE 'TEST 3a PASSED: insert en A permitido';
  BEGIN
    INSERT INTO locations (organization_id, name) VALUES ('00000000-0000-0000-0000-0000000000b2', 'Hack B');
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN v_failed := true;
  END;
  ASSERT v_failed = true, 'TEST 3b FAILED: insert en B NO fue bloqueado';
  RAISE NOTICE 'TEST 3b PASSED: insert en B bloqueado';
END $$;

-- TEST 4: usuario normal (admin-a) sin cambios
SET LOCAL "request.jwt.claim.sub" TO 'aaaaaaaa-0000-0000-0000-000000000001';
DO $$
DECLARE v_super BOOLEAN; v_org UUID; v_role TEXT;
BEGIN
  SELECT public.is_super_admin() INTO v_super;
  ASSERT v_super = false, 'TEST 4a FAILED';
  SELECT public.get_user_org_id() INTO v_org;
  ASSERT v_org = '00000000-0000-0000-0000-0000000000a1', 'TEST 4b FAILED';
  SELECT public.get_user_role() INTO v_role;
  ASSERT v_role = 'admin', 'TEST 4c FAILED';
  RAISE NOTICE 'TEST 4 PASSED: usuario normal intacto';
END $$;

-- TEST 5: set_active_org por no-super_admin falla
DO $$
DECLARE v_failed BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.set_active_org('00000000-0000-0000-0000-0000000000b2');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  ASSERT v_failed = true, 'TEST 5 FAILED: no-super_admin pudo set_active_org';
  RAISE NOTICE 'TEST 5 PASSED: set_active_org bloqueado para no-super_admin';
END $$;

ROLLBACK;
SELECT 'super_admin_active_org: 5 tests PASSED' AS result;
