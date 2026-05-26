-- Migration 052: Liquidación final por terminación (payroll sub-spec 4)
--
-- ¿Qué hace?
--   - Crea 2 tablas: liquidations (1 por evento de terminación) +
--     liquidation_items (conceptos calculados, patrón payroll_entries).
--   - RLS org-scoped admin/manager (super_admin bypass) vía get_user_org_id().
--   - Trigger terminal: status='paid' no puede volver a draft/approved.
--   - Índices por organización y por liquidación.
--
-- ¿Por qué?
--   La liquidación es un evento único por empleado (no un período-mensual-de-todos),
--   con su propio cálculo legal (cesantías, intereses, prima, vacaciones,
--   indemnización Art. 64) y documento PDF. No encaja en payroll_periods.
--
-- Side effects:
--   - Regenerar src/lib/supabase/database.types.ts (vía /regen-types).
--   - src/lib/types.ts (Liquidation, LiquidationItem, etc.) — ya hecho.

BEGIN;

-- ============================================================
-- 1. liquidations
-- ============================================================
CREATE TABLE liquidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  termination_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN
    ('renuncia','mutuo_acuerdo','justa_causa','sin_justa_causa','fin_contrato')),
  contract_kind TEXT NOT NULL CHECK (contract_kind IN
    ('indefinido','fijo','obra_labor')),
  contract_end_date DATE,
  hire_date DATE NOT NULL,
  cesantias_cutoff DATE NOT NULL,
  vacations_cutoff DATE NOT NULL,
  vacation_days_pending NUMERIC(6,2) NOT NULL DEFAULT 0,
  base_salary NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  compute_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  compute_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. liquidation_items
-- ============================================================
CREATE TABLE liquidation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidation_id UUID NOT NULL REFERENCES liquidations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  concept TEXT NOT NULL CHECK (concept IN
    ('cesantias','cesantias_interest','prima','vacaciones','indemnizacion','otro')),
  base NUMERIC(12,2),
  days INT,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Índices
-- ============================================================
CREATE INDEX liquidations_org_idx ON liquidations (organization_id, termination_date DESC);
CREATE INDEX liquidations_employee_idx ON liquidations (employee_id);
CREATE INDEX liquidation_items_liq_idx ON liquidation_items (liquidation_id);

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE liquidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY liquidations_select ON liquidations FOR SELECT TO authenticated
  USING (is_super_admin() OR organization_id = get_user_org_id());
CREATE POLICY liquidations_modify ON liquidations FOR ALL TO authenticated
  USING (is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager')))
  WITH CHECK (is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager')));

CREATE POLICY liquidation_items_select ON liquidation_items FOR SELECT TO authenticated
  USING (is_super_admin() OR organization_id = get_user_org_id());
CREATE POLICY liquidation_items_modify ON liquidation_items FOR ALL TO authenticated
  USING (is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager')))
  WITH CHECK (is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager')));

-- ============================================================
-- 5. Trigger terminal (paid no vuelve a draft/approved)
-- ============================================================
CREATE OR REPLACE FUNCTION liquidations_paid_terminal()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Una liquidación pagada no puede volver a un estado anterior';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER liquidations_paid_terminal_trg
  BEFORE UPDATE ON liquidations
  FOR EACH ROW EXECUTE FUNCTION liquidations_paid_terminal();

COMMIT;
