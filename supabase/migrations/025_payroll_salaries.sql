-- Migration 025: Payroll foundation — salary history, adjustments, settings.
-- Sub-spec 1 of payroll module. No compute engine; only data + RLS.

-- =============================================================================
-- 1. salary_history
-- =============================================================================
CREATE TABLE IF NOT EXISTS salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(12,2) NOT NULL CHECK (monthly_salary >= 0),
  is_integral_salary BOOLEAN NOT NULL DEFAULT false,
  transport_aux_override BOOLEAN NULL,
  change_reason TEXT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX salary_history_emp_from_idx
  ON salary_history (employee_id, effective_from DESC);

CREATE UNIQUE INDEX salary_history_one_open_per_employee
  ON salary_history (employee_id) WHERE effective_to IS NULL;

CREATE OR REPLACE FUNCTION salary_history_close_previous()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM salary_history
    WHERE employee_id = NEW.employee_id
      AND effective_to IS NOT NULL
      AND effective_from <= NEW.effective_from
      AND effective_to   >= NEW.effective_from
  ) THEN
    RAISE EXCEPTION 'Solapamiento con un período salarial cerrado';
  END IF;

  UPDATE salary_history
     SET effective_to = (NEW.effective_from - INTERVAL '1 day')::date
   WHERE employee_id = NEW.employee_id
     AND effective_to IS NULL
     AND effective_from < NEW.effective_from;

  RETURN NEW;
END;
$$;

CREATE TRIGGER salary_history_close_previous_trg
  BEFORE INSERT ON salary_history
  FOR EACH ROW EXECUTE FUNCTION salary_history_close_previous();

-- =============================================================================
-- 2. salary_adjustments
-- =============================================================================
CREATE TABLE IF NOT EXISTS salary_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  concept_label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  is_salary_component BOOLEAN NOT NULL,
  description TEXT NULL,
  created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX salary_adjustments_emp_date_idx
  ON salary_adjustments (employee_id, payment_date DESC);

-- =============================================================================
-- 3. payroll_settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NULL,
  smmlv NUMERIC(12,2) NOT NULL,
  aux_transport NUMERIC(12,2) NOT NULL,
  hourly_divisor INT NOT NULL CHECK (hourly_divisor > 0),
  night_start_hour SMALLINT NOT NULL CHECK (night_start_hour BETWEEN 0 AND 23),
  sunday_surcharge_pct NUMERIC(4,3) NOT NULL,
  holiday_surcharge_pct NUMERIC(4,3) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end IS NULL OR period_end >= period_start)
);

CREATE INDEX payroll_settings_period_idx
  ON payroll_settings (period_start);

-- =============================================================================
-- 4. RLS — salary_history
-- =============================================================================
ALTER TABLE salary_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY salary_history_select ON salary_history FOR SELECT
USING (
  get_user_role() = 'admin'::user_role
  OR (
    get_user_role() = 'manager'::user_role
    AND employee_id IN (
      SELECT id FROM profiles WHERE location_id = get_user_location_id()
    )
    AND COALESCE(
      (SELECT (value->>'managers_can_see_salaries')::bool
         FROM app_settings WHERE key = 'app_flags'),
      false
    ) = true
  )
  OR employee_id = auth.uid()
);

CREATE POLICY salary_history_admin_all ON salary_history FOR ALL
USING (get_user_role() = 'admin'::user_role)
WITH CHECK (get_user_role() = 'admin'::user_role);

-- =============================================================================
-- 5. RLS — salary_adjustments
-- =============================================================================
ALTER TABLE salary_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY salary_adjustments_select ON salary_adjustments FOR SELECT
USING (
  get_user_role() = 'admin'::user_role
  OR (
    get_user_role() = 'manager'::user_role
    AND employee_id IN (
      SELECT id FROM profiles WHERE location_id = get_user_location_id()
    )
    AND COALESCE(
      (SELECT (value->>'managers_can_see_salaries')::bool
         FROM app_settings WHERE key = 'app_flags'),
      false
    ) = true
  )
  OR employee_id = auth.uid()
);

CREATE POLICY salary_adjustments_admin_all ON salary_adjustments FOR ALL
USING (get_user_role() = 'admin'::user_role)
WITH CHECK (get_user_role() = 'admin'::user_role);

-- =============================================================================
-- 6. RLS — payroll_settings
-- =============================================================================
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_settings_select ON payroll_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY payroll_settings_admin_all ON payroll_settings FOR ALL
USING (get_user_role() = 'admin'::user_role)
WITH CHECK (get_user_role() = 'admin'::user_role);

-- =============================================================================
-- 7. Seed payroll_settings — 3 sub-períodos de 2026
-- =============================================================================
INSERT INTO payroll_settings
  (period_start, period_end, smmlv, aux_transport, hourly_divisor,
   night_start_hour, sunday_surcharge_pct, holiday_surcharge_pct)
VALUES
  ('2026-01-01', '2026-06-30', 1750905, 249095, 220, 19, 0.800, 0.800),
  ('2026-07-01', '2026-07-14', 1750905, 249095, 220, 19, 0.900, 0.900),
  ('2026-07-15', NULL,         1750905, 249095, 210, 19, 0.900, 0.900)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 8. Seed app_flags row in app_settings
-- =============================================================================
INSERT INTO app_settings (key, value) VALUES (
  'app_flags',
  '{"managers_can_see_salaries": false}'::jsonb
) ON CONFLICT (key) DO NOTHING;
