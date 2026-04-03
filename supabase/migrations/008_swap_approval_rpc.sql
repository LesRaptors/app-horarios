-- ============================================
-- RPC: Atomic shift swap approval
-- ============================================
-- Atomically swaps employee_id in both schedule_entries,
-- updates the swap status to 'approved', and inserts
-- notifications for both parties — all in a single transaction.

CREATE OR REPLACE FUNCTION approve_shift_swap(
  p_swap_id UUID,
  p_reviewer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap RECORD;
BEGIN
  -- 1. Fetch the swap request
  SELECT *
    INTO v_swap
    FROM shift_swap_requests
   WHERE id = p_swap_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Solicitud de intercambio no encontrada',
      'code',    'NOT_FOUND'
    );
  END IF;

  -- 2. Check status is 'accepted'
  IF v_swap.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Solo se pueden aprobar intercambios aceptados',
      'code',    'INVALID_STATUS'
    );
  END IF;

  -- 3. Atomically swap employee_id in both schedule entries
  UPDATE schedule_entries
     SET employee_id = v_swap.target_id
   WHERE id = v_swap.requester_entry_id;

  UPDATE schedule_entries
     SET employee_id = v_swap.requester_id
   WHERE id = v_swap.target_entry_id;

  -- 4. Update swap status to 'approved' with reviewer
  UPDATE shift_swap_requests
     SET status      = 'approved',
         reviewed_by = p_reviewer_id
   WHERE id = p_swap_id;

  -- 5. Insert notifications for both parties
  INSERT INTO notifications (user_id, title, message, type, link)
  VALUES
    (v_swap.requester_id,
     'Intercambio aprobado',
     'Tu solicitud de intercambio de turno ha sido aprobada.',
     'swap_request',
     '/requests'),
    (v_swap.target_id,
     'Intercambio aprobado',
     'El intercambio de turno ha sido aprobado por el manager.',
     'swap_request',
     '/requests');

  -- 6. Return success
  RETURN jsonb_build_object('success', true);
END;
$$;
