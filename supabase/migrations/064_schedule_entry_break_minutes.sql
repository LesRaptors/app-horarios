-- Migration 064: horas laboradas netas del descanso en equidad
-- Agrega schedule_entries.break_minutes (nullable) = descanso efectivo del turno asignado.
-- El trigger de equidad resta COALESCE(se.break_minutes,0)/60 de total_hours. NULL = 0
-- (histórico/bruto), retrocompatible y desacopla el deploy. Solo ADD COLUMN + CREATE OR REPLACE:
-- no toca RLS. Parte de la versión vigente en cloud (migración 063, con el COALESCE de is_night).

BEGIN;

ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS break_minutes integer;

COMMENT ON COLUMN schedule_entries.break_minutes IS
  'Descanso efectivo (min) del turno asignado. NULL = no computado → 0 descuento. Lo setea el motor/diálogo.';

-- Un descanso negativo SUMARÍA horas en el trigger (COALESCE(...,0) resta break/60). Forzar >= 0.
-- Idempotente vía DROP IF EXISTS.
ALTER TABLE schedule_entries DROP CONSTRAINT IF EXISTS schedule_entries_break_minutes_nonneg;
ALTER TABLE schedule_entries ADD CONSTRAINT schedule_entries_break_minutes_nonneg
  CHECK (break_minutes IS NULL OR break_minutes >= 0);

CREATE OR REPLACE FUNCTION public.recompute_equity_rollup(p_employee_id uuid, p_year integer, p_month integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_org UUID;
BEGIN
  SELECT organization_id INTO emp_org FROM profiles WHERE id = p_employee_id;
  IF emp_org IS NULL THEN
    RETURN;  -- empleado no existe o super_admin (no aplica)
  END IF;

  INSERT INTO employee_equity_rollups (
    employee_id, organization_id, year, month,
    sundays_worked, saturdays_worked, nights_worked, holidays_worked, total_hours
  )
  SELECT
    p_employee_id, emp_org, p_year, p_month,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 0)::INT,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 6)::INT,
    COUNT(*) FILTER (WHERE COALESCE(se.is_night, st.is_night, false) = true)::INT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.date = se.date
        AND (h.location_id IS NULL OR h.location_id = (
          SELECT s.location_id FROM schedules s WHERE s.id = se.schedule_id
        ))
    ))::INT,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        (se.date + se.end_time) +
          CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
        - (se.date + se.start_time)
      )) / 3600
      - COALESCE(se.break_minutes, 0) / 60.0
    ), 0)::NUMERIC(6,2)
  FROM schedule_entries se
  LEFT JOIN shift_templates st ON st.id = se.shift_template_id
  WHERE se.employee_id = p_employee_id
    AND EXTRACT(YEAR FROM se.date) = p_year
    AND EXTRACT(MONTH FROM se.date) = p_month
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    sundays_worked   = EXCLUDED.sundays_worked,
    saturdays_worked = EXCLUDED.saturdays_worked,
    nights_worked    = EXCLUDED.nights_worked,
    holidays_worked  = EXCLUDED.holidays_worked,
    total_hours      = EXCLUDED.total_hours,
    updated_at       = now();
END;
$function$;

COMMIT;
