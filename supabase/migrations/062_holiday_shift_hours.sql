-- Migration 062: horario especial en festivos por turno (opcional)
-- ¿Qué hace? Agrega 3 columnas nullable a shift_templates. Cuando holiday_start_time
-- está definido, el motor de generación usa estas horas para los turnos que caen en
-- días festivos, en vez de start_time/end_time normales.
-- NULL = sin horario especial (comportamiento actual intacto). Solo ADD COLUMN: no toca RLS.

BEGIN;

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS holiday_start_time    time,
  ADD COLUMN IF NOT EXISTS holiday_end_time      time,
  ADD COLUMN IF NOT EXISTS holiday_break_minutes integer;

COMMENT ON COLUMN shift_templates.holiday_start_time IS
  'Hora de inicio cuando el turno cae en festivo. NULL = usa start_time normal.';
COMMENT ON COLUMN shift_templates.holiday_end_time IS
  'Hora de fin cuando el turno cae en festivo. NULL = usa end_time normal.';
COMMENT ON COLUMN shift_templates.holiday_break_minutes IS
  'Minutos de descanso cuando el turno cae en festivo. NULL = 0.';

-- Invariante "ambos o ninguno": el motor trata un turno como "con horario de festivo"
-- solo si inicio Y fin están presentes (calcDurationHours necesita ambos). Forzarlo en
-- el modelo de datos evita filas inconsistentes (inicio sin fin) que el motor ignoraría
-- en silencio. Idempotente vía DROP IF EXISTS.
ALTER TABLE shift_templates DROP CONSTRAINT IF EXISTS shift_templates_holiday_hours_paired;
ALTER TABLE shift_templates ADD CONSTRAINT shift_templates_holiday_hours_paired
  CHECK ((holiday_start_time IS NULL) = (holiday_end_time IS NULL));

COMMIT;
