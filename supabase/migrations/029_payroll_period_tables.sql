-- Migration 029: Payroll period tables, RLS, triggers, time_off auto-link.

-- =============================================================================
-- 1. app_settings.app_flags — extend with payment_frequency
-- =============================================================================
UPDATE app_settings
   SET value = jsonb_set(
     COALESCE(value, '{}'::jsonb),
     '{payment_frequency}',
     '"mensual"'::jsonb,
     true
   )
 WHERE key = 'app_flags';

-- =============================================================================
-- 2. payroll_periods
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('mensual','quincenal')),
  status TEXT NOT NULL CHECK (status IN ('draft','approved','paid')) DEFAULT 'draft',
  approved_at TIMESTAMPTZ NULL,
  approved_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NULL,
  paid_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX payroll_periods_start_idx ON payroll_periods (period_start DESC);

-- Reject overlapping periods.
CREATE OR REPLACE FUNCTION payroll_periods_reject_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payroll_periods
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND period_start <= NEW.period_end
      AND period_end >= NEW.period_start
  ) THEN
    RAISE EXCEPTION 'El período se solapa con otro período de nómina existente';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_periods_reject_overlap_trg
  BEFORE INSERT OR UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION payroll_periods_reject_overlap();

-- paid is terminal: cannot move back to draft.
CREATE OR REPLACE FUNCTION payroll_periods_paid_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Un período pagado no puede volver a estado anterior';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_periods_paid_terminal_trg
  BEFORE UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION payroll_periods_paid_terminal();

-- =============================================================================
-- 3. payroll_entries
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  concept_type TEXT NOT NULL,
  is_income BOOLEAN NOT NULL,
  base NUMERIC(12,2) NULL,
  rate NUMERIC(8,5) NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NULL,
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payroll_entries_period_emp_idx
  ON payroll_entries (payroll_period_id, employee_id);

-- =============================================================================
-- 4. payroll_provisions
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  concept TEXT NOT NULL CHECK (concept IN ('cesantias','cesantias_interest','prima','vacaciones')),
  base NUMERIC(12,2) NOT NULL,
  rate NUMERIC(8,5) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  accumulated_ytd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payroll_provisions_period_emp_idx
  ON payroll_provisions (payroll_period_id, employee_id);

-- =============================================================================
-- 5. payroll_employer_cost
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll_employer_cost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  health_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  arl_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  parafiscales_caja NUMERIC(12,2) NOT NULL DEFAULT 0,
  parafiscales_sena NUMERIC(12,2) NOT NULL DEFAULT 0,
  parafiscales_icbf NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) GENERATED ALWAYS AS
    (health_employer + pension_employer + arl_employer
     + parafiscales_caja + parafiscales_sena + parafiscales_icbf) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id, employee_id)
);

-- =============================================================================
-- 6. absence_records
-- =============================================================================
CREATE TABLE IF NOT EXISTS absence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sick_eps','sick_arl','maternity','paternity','vacation','paid_leave','unpaid_leave','suspension')),
  paid_pct NUMERIC(4,3) NOT NULL CHECK (paid_pct BETWEEN 0 AND 1),
  payer TEXT NOT NULL CHECK (payer IN ('employer','eps','arl','none')),
  notes TEXT NULL,
  source_request_id UUID NULL REFERENCES time_off_requests(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX absence_records_emp_start_idx
  ON absence_records (employee_id, start_date DESC);

-- Auto-link from time_off_requests approval.
CREATE OR REPLACE FUNCTION time_off_to_absence_record()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
  v_paid_pct NUMERIC(4,3);
  v_payer TEXT;
BEGIN
  -- Map time_off_request.type to absence_record.type.
  v_type := CASE
    WHEN NEW.type = 'vacation' THEN 'vacation'
    WHEN NEW.type = 'sick'     THEN 'sick_eps'
    WHEN NEW.type = 'personal' THEN 'paid_leave'
    ELSE 'paid_leave'
  END;
  v_paid_pct := CASE v_type
    WHEN 'sick_eps' THEN 0.6667
    WHEN 'unpaid_leave' THEN 0
    WHEN 'suspension' THEN 0
    ELSE 1
  END;
  v_payer := CASE v_type
    WHEN 'sick_eps' THEN 'eps'
    WHEN 'sick_arl' THEN 'arl'
    WHEN 'maternity' THEN 'eps'
    WHEN 'paternity' THEN 'eps'
    WHEN 'unpaid_leave' THEN 'none'
    WHEN 'suspension' THEN 'none'
    ELSE 'employer'
  END;

  -- 1. Approving (was not approved, now approved)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved') THEN
    INSERT INTO absence_records
      (employee_id, start_date, end_date, type, paid_pct, payer, source_request_id)
    VALUES
      (NEW.employee_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id);
    RETURN NEW;
  END IF;

  -- 2. Un-approving (was approved, now not)
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 3. Date range changed while approved: replace.
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND
     (OLD.start_date <> NEW.start_date OR OLD.end_date <> NEW.end_date) THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    INSERT INTO absence_records
      (employee_id, start_date, end_date, type, paid_pct, payer, source_request_id)
    VALUES
      (NEW.employee_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER time_off_to_absence_record_trg
  AFTER INSERT OR UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION time_off_to_absence_record();

-- =============================================================================
-- 7. tax_personal_deductions
-- =============================================================================
CREATE TABLE IF NOT EXISTS tax_personal_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dependents_count SMALLINT NOT NULL DEFAULT 0 CHECK (dependents_count >= 0),
  mortgage_interest_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  prepaid_health_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  voluntary_pension_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  afc_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX tax_deductions_emp_from_idx
  ON tax_personal_deductions (employee_id, effective_from DESC);

CREATE UNIQUE INDEX tax_deductions_one_open_per_employee
  ON tax_personal_deductions (employee_id) WHERE effective_to IS NULL;

CREATE OR REPLACE FUNCTION tax_deductions_close_previous()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE tax_personal_deductions
     SET effective_to = (NEW.effective_from - INTERVAL '1 day')::date
   WHERE employee_id = NEW.employee_id
     AND effective_to IS NULL
     AND effective_from < NEW.effective_from;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tax_deductions_close_previous_trg
  BEFORE INSERT ON tax_personal_deductions
  FOR EACH ROW EXECUTE FUNCTION tax_deductions_close_previous();

-- =============================================================================
-- 8. RLS — payroll_periods
-- =============================================================================
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_periods_select ON payroll_periods FOR SELECT
USING (
  get_user_role() = 'admin'::user_role
  OR (
    get_user_role() = 'manager'::user_role
    AND COALESCE(
      (SELECT (value->>'managers_can_see_salaries')::bool
         FROM app_settings WHERE key = 'app_flags'), false
    ) = true
  )
);

CREATE POLICY payroll_periods_admin_all ON payroll_periods FOR ALL
USING (get_user_role() = 'admin'::user_role)
WITH CHECK (get_user_role() = 'admin'::user_role);

-- =============================================================================
-- 9. RLS — payroll_entries / payroll_provisions / payroll_employer_cost
-- =============================================================================
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employer_cost ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_entries','payroll_provisions','payroll_employer_cost'] LOOP
    EXECUTE format($f$
      CREATE POLICY %I_select ON %I FOR SELECT USING (
        get_user_role() = 'admin'::user_role
        OR (
          get_user_role() = 'manager'::user_role
          AND employee_id IN (
            SELECT id FROM profiles WHERE location_id = get_user_location_id()
          )
          AND COALESCE(
            (SELECT (value->>'managers_can_see_salaries')::bool
               FROM app_settings WHERE key = 'app_flags'), false
          ) = true
        )
        OR employee_id = auth.uid()
      );
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY %I_admin_all ON %I FOR ALL
      USING (get_user_role() = 'admin'::user_role)
      WITH CHECK (get_user_role() = 'admin'::user_role);
    $f$, t, t);
  END LOOP;
END $$;

-- =============================================================================
-- 10. RLS — absence_records / tax_personal_deductions
-- =============================================================================
ALTER TABLE absence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_personal_deductions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['absence_records','tax_personal_deductions'] LOOP
    EXECUTE format($f$
      CREATE POLICY %I_select ON %I FOR SELECT USING (
        get_user_role() = 'admin'::user_role
        OR (
          get_user_role() = 'manager'::user_role
          AND employee_id IN (
            SELECT id FROM profiles WHERE location_id = get_user_location_id()
          )
        )
        OR employee_id = auth.uid()
      );
    $f$, t, t);

    EXECUTE format($f$
      CREATE POLICY %I_admin_all ON %I FOR ALL
      USING (get_user_role() = 'admin'::user_role)
      WITH CHECK (get_user_role() = 'admin'::user_role);
    $f$, t, t);
  END LOOP;
END $$;
