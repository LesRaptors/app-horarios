-- Migración 032: audit en staffing_requirements + RPC save_staffing_diff.

-- 1. Audit column. updated_at + trigger ya existen (migración 006).
ALTER TABLE staffing_requirements
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. RPC: aplica un diff atómico contra el desired state.
CREATE OR REPLACE FUNCTION save_staffing_diff(
  p_location_id UUID,
  p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
  updated_count INT := 0;
  deleted_count INT := 0;
  user_id UUID := auth.uid();
BEGIN
  -- Permission gate.
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Desired state en tabla temporal.
  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count
  FROM jsonb_array_elements(p_rows) r;

  -- DELETE: filas existentes que no estan en el desired (o estan con count=0).
  WITH del AS (
    DELETE FROM staffing_requirements sr
     WHERE sr.location_id = p_location_id
       AND NOT EXISTS (
         SELECT 1 FROM _desired d
          WHERE d.position_id = sr.position_id
            AND d.shift_template_id = sr.shift_template_id
            AND d.day_of_week = sr.day_of_week
            AND d.required_count > 0
       )
     RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM del;

  -- UPSERT: count > 0.
  WITH ups AS (
    INSERT INTO staffing_requirements
      (location_id, position_id, shift_template_id, day_of_week, required_count, updated_by)
    SELECT p_location_id, position_id, shift_template_id, day_of_week, required_count, user_id
      FROM _desired WHERE required_count > 0
    ON CONFLICT (location_id, position_id, shift_template_id, day_of_week)
    DO UPDATE SET
      required_count = EXCLUDED.required_count,
      updated_by = user_id
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO inserted_count, updated_count
  FROM ups;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'deleted', deleted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_staffing_diff(UUID, JSONB) TO authenticated;
