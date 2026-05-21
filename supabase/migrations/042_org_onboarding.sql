-- Migration 042: Org onboarding tracking + approve_demo_request RPC
--
-- ¿Qué hace?
--   - organizations: onboarding_completed_at, onboarding_step, welcome_email_sent_at,
--     approved_by, approved_from_demo_request_id
--   - demo_requests: approved_org_id, approved_at, approved_by + status='approved'
--   - RPC approve_demo_request(...) SECURITY DEFINER, atómica, super_admin guard
--
-- ¿Por qué?
--   Sub-proy 4 necesita rastrear progreso del wizard onboarding y auditar el
--   approval. La RPC garantiza atomicidad org-create + demo_request-update.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN onboarding_step TEXT
    CHECK (onboarding_step IS NULL OR onboarding_step IN
      ('empresa','sede','departments','positions','shifts','team','done')),
  ADD COLUMN welcome_email_sent_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id),
  ADD COLUMN approved_from_demo_request_id UUID REFERENCES demo_requests(id);

-- Les Raptors ya está onboarded
UPDATE organizations
  SET onboarding_completed_at = created_at, onboarding_step = 'done'
  WHERE slug = 'les-raptors';

ALTER TABLE demo_requests
  ADD COLUMN approved_org_id UUID REFERENCES organizations(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES profiles(id);

-- Backfill legacy status (migración 038 usaba 'pending'/'converted'). Idempotente.
UPDATE demo_requests SET status='new' WHERE status='pending';
UPDATE demo_requests SET status='approved' WHERE status='converted';

ALTER TABLE demo_requests ALTER COLUMN status SET DEFAULT 'new';

ALTER TABLE demo_requests DROP CONSTRAINT IF EXISTS demo_requests_status_check;
ALTER TABLE demo_requests ADD CONSTRAINT demo_requests_status_check
  CHECK (status IN ('new','contacted','scheduled','approved','rejected','spam'));

CREATE OR REPLACE FUNCTION approve_demo_request(
  p_demo_request_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan TEXT,
  p_admin_email TEXT,
  p_admin_first_name TEXT,
  p_admin_last_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_org_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can approve demo requests'
      USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO organizations (name, slug, plan, status, trial_ends_at, country)
  VALUES (p_org_name, p_org_slug, p_plan, 'trialing', now() + INTERVAL '30 days', 'CO')
  RETURNING id INTO v_new_org_id;

  UPDATE demo_requests
    SET status='approved',
        approved_org_id=v_new_org_id,
        approved_at=now(),
        approved_by=auth.uid()
  WHERE id=p_demo_request_id;

  UPDATE organizations
    SET approved_by=auth.uid(),
        approved_from_demo_request_id=p_demo_request_id
  WHERE id=v_new_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_new_org_id,
    'trial_ends_at', (SELECT trial_ends_at FROM organizations WHERE id=v_new_org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
