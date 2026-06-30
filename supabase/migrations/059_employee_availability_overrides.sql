-- Migration 059: override de disponibilidad por empleado
--
-- ¿Qué hace?
--   - Agrega available_sundays/holidays/nights (BOOLEAN NULL) a profiles.
--   - NULL = hereda del contract_type; true/false = override del empleado.
--
-- ¿Por qué?
--   Hoy la disponibilidad solo vive en contract_types; no se puede expresar
--   "este empleado puntual no trabaja festivos" sin crear un contrato dedicado.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS available_sundays  BOOLEAN,
  ADD COLUMN IF NOT EXISTS available_holidays BOOLEAN,
  ADD COLUMN IF NOT EXISTS available_nights   BOOLEAN;

COMMENT ON COLUMN profiles.available_holidays IS
  'NULL = hereda del contract_type; true/false = override individual.';

COMMIT;
