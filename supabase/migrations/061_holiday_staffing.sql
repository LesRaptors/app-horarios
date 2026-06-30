-- Migration 061: demanda de personal para festivos (staffing)
--
-- ¿Qué hace?
--   - Agrega is_holiday a staffing_requirements (filas festivas: day_of_week=0
--     sentinela + is_holiday=true). El perfil de festivo no varía por día.
--   - Recrea el UNIQUE para incluir is_holiday (sino festiva/no-festiva colisionan).
--   - save_staffing_diff discrimina is_holiday en parseo, DELETE, INSERT y ON CONFLICT.

BEGIN;

ALTER TABLE staffing_requirements
  ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE staffing_requirements
  DROP CONSTRAINT IF EXISTS staffing_requirements_location_id_position_id_shift_templat_key;
ALTER TABLE staffing_requirements
  ADD CONSTRAINT staffing_requirements_loc_pos_shift_dow_hol_key
  UNIQUE (location_id, position_id, shift_template_id, day_of_week, is_holiday);

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
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count,
    COALESCE((r->>'is_holiday')::BOOLEAN, false) AS is_holiday
  FROM jsonb_array_elements(p_rows) r;

  WITH del AS (
    DELETE FROM staffing_requirements sr
     WHERE sr.location_id = p_location_id
       AND NOT EXISTS (
         SELECT 1 FROM _desired d
          WHERE d.position_id = sr.position_id
            AND d.shift_template_id = sr.shift_template_id
            AND d.day_of_week = sr.day_of_week
            AND d.is_holiday = sr.is_holiday
            AND d.required_count > 0
       )
     RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM del;

  WITH ups AS (
    INSERT INTO staffing_requirements
      (location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday, updated_by)
    SELECT p_location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday, user_id
      FROM _desired WHERE required_count > 0
    ON CONFLICT (location_id, position_id, shift_template_id, day_of_week, is_holiday)
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

COMMIT;
