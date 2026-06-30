-- Migration 063: persistir el carácter nocturno efectivo en schedule_entries (retrocompatible)
-- ¿Qué hace? Agrega schedule_entries.is_night (boolean NULLABLE) como fuente del carácter
-- nocturno EFECTIVO de un turno asignado, derivado de sus horas reales (incluido el horario
-- especial de festivo). El motor y el diálogo de asignación lo setean al crear el entry.
--
-- Retrocompatibilidad / desacople de deploy: la columna es NULLABLE y el trigger usa
-- COALESCE(se.is_night, st.is_night). NULL = "la app no computó el valor" → el conteo de
-- noches cae al flag de la plantilla (comportamiento histórico). Así, aplicar esta migración
-- con el código viejo en prod NO regresiona (sigue contando por el flag); con el código nuevo
-- que escribe is_night, el conteo refleja el carácter efectivo (p.ej. festivo en horas nocturnas
-- sobre una plantilla diurna). Solo ADD COLUMN + CREATE OR REPLACE FUNCTION: no toca RLS.

BEGIN;

ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS is_night boolean;

COMMENT ON COLUMN schedule_entries.is_night IS
  'Carácter nocturno EFECTIVO del turno (derivado de sus horas reales, incl. horario de festivo). '
  'NULL = no computado por la app → el rollup cae al flag shift_templates.is_night. Lo setea el motor/diálogo.';

-- Reescribe el trigger para contar noches desde el carácter efectivo del entry, con fallback
-- al flag de la plantilla vía COALESCE (entries históricos o creados por código viejo → NULL).
-- Se preserva el resto de la definición vigente (organization_id, holidays, total_hours,
-- ON CONFLICT, SECURITY DEFINER, search_path) verbatim. El LEFT JOIN a shift_templates se
-- conserva porque alimenta el fallback del COALESCE.
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
