-- Migration 044: Reserved slugs en DB (defense-in-depth)
--
-- ¿Qué hace?
--   - CHECK constraint en organizations.slug rechazando reserved slugs.
--   - Modifica suggest_unique_slug() para evitar generar reserved.
--   - Modifica approve_demo_request() para validar slug antes de INSERT.
--
-- ¿Por qué?
--   El middleware Next.js usa subdomains reservados (www, admin, api, app,
--   auth, mail, static) para infra y branding. Si una org se registra con
--   alguno de esos slugs, choca con el routing.
--   Defense-in-depth: validamos en (1) API layer Zod, (2) RPC SECURITY DEFINER,
--   (3) DB CHECK constraint. Cualquier vía que omita las dos primeras queda
--   bloqueada por la tercera.

BEGIN;

-- =============================================================================
-- 1. CHECK constraint en organizations.slug
-- =============================================================================
ALTER TABLE organizations
  ADD CONSTRAINT slug_not_reserved
  CHECK (lower(slug) NOT IN ('www', 'admin', 'api', 'app', 'auth', 'mail', 'static'));

-- =============================================================================
-- 2. suggest_unique_slug evita reserved
-- =============================================================================
CREATE OR REPLACE FUNCTION public.suggest_unique_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  reserved TEXT[] := ARRAY['www', 'admin', 'api', 'app', 'auth', 'mail', 'static'];
  base TEXT := slugify(p_name);
  candidate TEXT := base;
  counter INT := 2;
BEGIN
  -- Si el base es reservado o vacío, forzar sufijo desde el inicio
  IF candidate = ANY(reserved) OR candidate = '' THEN
    candidate := base || '-' || counter;
    counter := counter + 1;
  END IF;

  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate)
    OR candidate = ANY(reserved)
  LOOP
    candidate := base || '-' || counter;
    counter := counter + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- =============================================================================
-- 3. approve_demo_request valida slug reservado antes de INSERT
-- =============================================================================
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
BEGIN
  -- Guard: approver debe ser super_admin activo
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approver_id AND role = 'super_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden: approver must be active super_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Guard: slug no puede ser reservado
  IF lower(p_org_slug) = ANY(reserved) THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used', p_org_slug
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', now() + INTERVAL '30 days', 'CO')
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

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', (SELECT trial_ends_at FROM organizations WHERE id = v_new_org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMIT;
