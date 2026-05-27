-- =============================================================================
-- 054: RPC list_owner_organizations (lista de orgs para el super_admin)
-- =============================================================================
-- El tenant-switcher y el panel necesitan listar TODAS las organizaciones aunque
-- el super_admin tenga un tenant activo (en cuyo caso is_super_admin()=false y la
-- RLS de organizations solo devolvería 1). Este RPC usa un check de rol CRUDO
-- (igual que set_active_org) + SECURITY DEFINER para devolver todas las orgs con
-- sus métricas, independiente del tenant activo.
-- =============================================================================

BEGIN;

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
  -- Check CRUDO de rol (no is_super_admin(), que es tenant-aware)
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

COMMIT;
