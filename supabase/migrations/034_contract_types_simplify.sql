-- 034: Simplificación de contract_types.

ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS weekly_hours_mode TEXT NOT NULL DEFAULT 'full' CHECK (weekly_hours_mode IN ('full','partial')),
  ADD COLUMN IF NOT EXISTS weekly_hours INT,
  ADD COLUMN IF NOT EXISTS is_healthcare BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_sundays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_holidays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_nights BOOLEAN NOT NULL DEFAULT true;

-- Migrar valores existentes a columnas nuevas (best-effort).
UPDATE contract_types SET
  weekly_hours_mode = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN 'full'
    ELSE 'partial'
  END,
  weekly_hours = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN NULL
    ELSE target_hours_per_week
  END,
  available_sundays = (COALESCE(max_sundays_per_quarter, 999) > 0),
  available_holidays = (COALESCE(max_holidays_per_quarter, 999) > 0),
  available_nights = (COALESCE(target_nights_per_month, 1) > 0);

-- Mark old columns as deprecated.
COMMENT ON COLUMN contract_types.max_sundays_per_quarter IS 'DEPRECATED 034 — algoritmo balancea equitativamente. Mantener por compat.';
COMMENT ON COLUMN contract_types.max_holidays_per_quarter IS 'DEPRECATED 034 — idem.';
COMMENT ON COLUMN contract_types.target_saturdays_per_month IS 'DEPRECATED 034 — scoring balancea sábados.';
COMMENT ON COLUMN contract_types.target_nights_per_month IS 'DEPRECATED 034 — reemplazado por available_nights.';
COMMENT ON COLUMN contract_types.target_hours_per_week IS 'DEPRECATED 034 — usar weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_week IS 'DEPRECATED 034 — derivado de weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_day IS 'DEPRECATED 034 — derivado de is_healthcare.';
