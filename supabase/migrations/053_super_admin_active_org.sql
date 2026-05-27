-- =============================================================================
-- 053: Tenant activo del super_admin (panel + modo operación)
-- =============================================================================
-- Objetivo: permitir que un super_admin "entre" a una organización y opere como
-- su admin, SIN reescribir las 116 policies multi-tenant. Se logra haciendo que
-- 3 funciones helper de RLS sean conscientes de un "tenant activo" guardado en
-- super_admin_active_org.
--
-- Tabla de verdad (con el patrón de policy existente intacto):
--   super_admin SIN tenant activo  -> is_super_admin()=true  (modo panel, ve todo)
--   super_admin CON tenant activo  -> is_super_admin()=false, get_user_org_id()=tenant,
--                                     get_user_role()='admin' (opera como admin del tenant)
--   usuario normal                 -> sin cambios
-- =============================================================================

BEGIN;

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

COMMIT;
