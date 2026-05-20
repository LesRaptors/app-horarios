-- Migration 041: Reforzar RPCs con org check interno (defense in depth)
--
-- ¿Qué hace?
--   - approve_shift_swap y convert_demo_to_real verifican que el caller
--     pertenezca al mismo org que el recurso ANTES de mutar.
--   - Lanzan insufficient_privilege si hay mismatch (super_admin bypassea).
--
-- ¿Por qué?
--   Las RPCs son SECURITY DEFINER y bypassean RLS. Si un caller llamara
--   approve_shift_swap('<uuid-otra-org>') la mutación pasaría aunque RLS
--   no le dejaría leer ese row. Esta es la última línea de defensa
--   contra cross-tenant injection.
--
-- Side effects:
--   - approve_shift_swap fue ya reescrita en 039 (para escribir
--     organization_id en notifications); acá se reescribe con el check de org.
--   - convert_demo_to_real no fue tocada por 039.

BEGIN;

CREATE OR REPLACE FUNCTION public.approve_shift_swap(p_swap_id UUID, p_reviewer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $approve$
DECLARE
  v_swap RECORD;
  v_caller_org UUID;
BEGIN
  SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud de intercambio no encontrada', 'code', 'NOT_FOUND');
  END IF;

  v_caller_org := get_user_org_id();
  IF NOT is_super_admin() AND v_swap.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Forbidden: cross-tenant access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_swap.status != 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden aprobar intercambios aceptados', 'code', 'INVALID_STATUS');
  END IF;

  UPDATE schedule_entries SET employee_id = v_swap.target_id    WHERE id = v_swap.requester_entry_id;
  UPDATE schedule_entries SET employee_id = v_swap.requester_id WHERE id = v_swap.target_entry_id;

  UPDATE shift_swap_requests
     SET status = 'approved', reviewed_by = p_reviewer_id
   WHERE id = p_swap_id;

  INSERT INTO notifications (user_id, organization_id, title, message, type, link)
  VALUES
    (v_swap.requester_id, v_swap.organization_id, 'Intercambio aprobado',
     'Tu solicitud de intercambio de turno ha sido aprobada.', 'swap_request', '/requests'),
    (v_swap.target_id, v_swap.organization_id, 'Intercambio aprobado',
     'El intercambio de turno ha sido aprobado por el manager.', 'swap_request', '/requests');

  RETURN jsonb_build_object('success', true);
END;
$approve$;

CREATE OR REPLACE FUNCTION public.convert_demo_to_real(p_demo_id UUID, p_real_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $convert$
DECLARE
  v_demo RECORD;
  v_real RECORD;
  v_entries_count INT;
  v_caller_org UUID;
BEGIN
  SELECT * INTO v_demo FROM profiles WHERE id = p_demo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empleado demo no encontrado');
  END IF;
  IF NOT v_demo.is_demo THEN
    RETURN jsonb_build_object('success', false, 'error', 'El empleado no es un demo');
  END IF;

  SELECT * INTO v_real FROM profiles WHERE id = p_real_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empleado destino no encontrado');
  END IF;

  -- Defense in depth: ambos empleados deben pertenecer al org del caller (o super_admin bypass).
  v_caller_org := get_user_org_id();
  IF NOT is_super_admin() AND (
    v_demo.organization_id != v_caller_org OR
    v_real.organization_id != v_caller_org
  ) THEN
    RAISE EXCEPTION 'Forbidden: cross-tenant access' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE schedule_entries SET employee_id = p_real_id WHERE employee_id = p_demo_id;
  GET DIAGNOSTICS v_entries_count = ROW_COUNT;

  UPDATE employee_secondary_positions SET employee_id = p_real_id WHERE employee_id = p_demo_id;

  UPDATE profiles SET
    position_id = COALESCE(v_demo.position_id, position_id),
    location_id = COALESCE(v_demo.location_id, location_id),
    max_hours_per_week = v_demo.max_hours_per_week
  WHERE id = p_real_id;

  DELETE FROM profiles WHERE id = p_demo_id;

  RETURN jsonb_build_object('success', true, 'entries_migrated', v_entries_count);
END;
$convert$;

COMMIT;
