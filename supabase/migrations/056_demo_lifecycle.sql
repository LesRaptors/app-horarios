-- =============================================================================
-- 056: Ciclo de vida de demos — updated_at + subscription al aprobar
-- =============================================================================
-- 1. demo_requests.updated_at (para dedupe de solicitudes pendientes).
-- 2. approve_demo_request ahora crea la subscription en 'trialing' (vigencia
--    real: el dunning opera sobre subscriptions, no sobre organizations).
-- =============================================================================

BEGIN;

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

COMMIT;
