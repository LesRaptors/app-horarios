-- Migration 043: approve_demo_request acepta p_approver_id explícito
--
-- ¿Qué hace?
--   - Reescribe RPC approve_demo_request para aceptar p_approver_id UUID en
--     vez de depender de auth.uid().
--   - Valida que p_approver_id corresponde a un super_admin activo.
--   - Drops la signature anterior (7 params).
--
-- ¿Por qué?
--   El API route /api/admin/demo-requests/approve invoca este RPC con
--   service_role (createAdminClient), donde auth.uid() retorna NULL.
--   Resultado: organizations.approved_by y demo_requests.approved_by
--   quedaban NULL → audit trail perdido.
--   El API route ya verifica super_admin antes de llamar; pasar p_approver_id
--   permite registrar el audit correctamente.

BEGIN;

-- Drop signature vieja (sin p_approver_id)
DROP FUNCTION IF EXISTS public.approve_demo_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
  v_new_org_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_approver_id AND role = 'super_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden: approver must be active super_admin'
      USING ERRCODE = 'insufficient_privilege';
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
