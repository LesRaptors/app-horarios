# Payroll Sub-spec 2 (Compute Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Colombian payroll compute engine described in `docs/superpowers/specs/2026-04-26-payroll-engine-design.md`. Pure 9-stage engine in TypeScript that ingests scheduling + salary + absence + tax-deductions data and emits an immutable payroll snapshot per period.

**Architecture:** Three Postgres migrations create the period/entries/provisions/employer_cost/absences/tax-deductions tables and add the `uvt`/hire/termination/ARL columns. A pure `payroll-engine.ts` module orchestrates 9 internal stages, each a small testable helper. The admin UI lives under a new `/nomina/periodos` route with list + 3-tab detail page; ausencias and deducciones personales get side-sheet sections in `/empleados`. Manual overrides preserved on recalc via `is_manual_override` flag. RLS enforced at DB layer using existing `get_user_role()`/`get_user_location_id()`/`app_flags` patterns.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind v3, shadcn/ui, Supabase (Postgres + RLS), Vitest for the engine + helpers, SQL test files for triggers/RLS.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/027_payroll_settings_uvt.sql` | create | Add `uvt` column + backfill |
| `supabase/migrations/028_profiles_hire_termination_arl.sql` | create | Add 4 columns to profiles |
| `supabase/migrations/029_payroll_period_tables.sql` | create | 6 new tables + RLS + triggers + auto-link |
| `supabase/tests/payroll/time_off_to_absence_record_create.sql` | create | trigger creates record on approve |
| `supabase/tests/payroll/time_off_to_absence_record_unapprove.sql` | create | trigger removes record on un-approve |
| `supabase/tests/payroll/time_off_to_absence_record_date_change.sql` | create | trigger replaces on date change |
| `supabase/tests/payroll/payroll_periods_no_overlap.sql` | create | no overlapping periods |
| `supabase/tests/payroll/tax_deductions_one_open_per_employee.sql` | create | unique partial index |
| `supabase/tests/payroll/payroll_period_paid_terminal.sql` | create | paid → draft blocked |
| `src/lib/types.ts` | modify | +10 interfaces / enums |
| `src/lib/payroll-engine-helpers.ts` | create | 8 pure helpers |
| `src/lib/payroll-engine-helpers.test.ts` | create | TDD tests |
| `src/lib/payroll-engine.ts` | create | 9-stage `computePayroll` |
| `src/lib/payroll-engine.test.ts` | create | Pipeline tests |
| `src/components/employees/absence-form.tsx` | create | modal |
| `src/components/employees/absence-section.tsx` | create | side-sheet section |
| `src/components/employees/tax-deductions-form.tsx` | create | modal |
| `src/components/employees/tax-deductions-section.tsx` | create | side-sheet section |
| `src/app/(authenticated)/employees/page.tsx` | modify | wire 2 sections + edit form (hire/term/ARL) |
| `src/components/nomina/period-generate-modal.tsx` | create | modal for "new period" |
| `src/components/nomina/period-summary-tab.tsx` | create | tab 1 |
| `src/components/nomina/period-employee-tab.tsx` | create | tab 2 |
| `src/components/nomina/period-overrides-tab.tsx` | create | tab 3 |
| `src/components/nomina/period-override-form.tsx` | create | modal |
| `src/app/(authenticated)/nomina/periodos/page.tsx` | create | list page |
| `src/app/(authenticated)/nomina/periodos/[id]/page.tsx` | create | detail (3 tabs) |
| `src/app/(authenticated)/nomina/ausencias/page.tsx` | create | cross-employee list |
| `src/components/layout/sidebar.tsx` | modify | 2 new items in Nómina group |
| `src/components/settings/payment-frequency-selector.tsx` | create | settings toggle |
| `src/app/(authenticated)/settings/page.tsx` | modify | mount frequency selector |

---

## Convention reminders

- **Spanish UI**, normalized accents.
- **No emojis** in source files; lucide icons.
- All client data access via `createClient()` from `@/lib/supabase/client`.
- Use `useAuth()` for current profile/role.
- Money is `numeric(12,2)`; engine uses `number`.
- Run `npm run test` and `npm run build` before each commit.
- Follow existing migration style.
- Engine is **pure** — no Supabase calls inside `payroll-engine.ts`. Pages assemble the input.
- TDD for engine helpers and pipeline stages.
- Use Supabase MCP `apply_migration` for migrations and `execute_sql` for verification + SQL tests.

---

## Task 1: Migration 027 — add `uvt` to payroll_settings

**Files:**
- Create: `supabase/migrations/027_payroll_settings_uvt.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 027: Add UVT (Unidad de Valor Tributario) to payroll_settings.
-- UVT 2026 = $52.374 (DIAN Resolución 000238 del 15 de diciembre de 2025).

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS uvt NUMERIC(10,2) NOT NULL DEFAULT 52374;

-- Make sure the seeded rows have the canonical 2026 UVT.
UPDATE payroll_settings SET uvt = 52374 WHERE period_start >= '2026-01-01';
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

- name: `027_payroll_settings_uvt`
- project_id: `ugkvuinkynvtuiutwlkd`
- query: the SQL above.

- [ ] **Step 3: Verify**

Run via `execute_sql`:

```sql
SELECT period_start, uvt FROM payroll_settings ORDER BY period_start;
```

Expected: 3 rows, `uvt = 52374` on each.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/027_payroll_settings_uvt.sql
git commit -m "feat(payroll): add uvt column to payroll_settings (mig 027)"
```

---

## Task 2: Migration 028 — profiles hire/termination/ARL

**Files:**
- Create: `supabase/migrations/028_profiles_hire_termination_arl.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 028: Add hire/termination/ARL columns to profiles.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hire_date DATE NULL,
  ADD COLUMN IF NOT EXISTS termination_date DATE NULL,
  ADD COLUMN IF NOT EXISTS is_terminated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arl_risk_class SMALLINT NULL
    CHECK (arl_risk_class IS NULL OR arl_risk_class BETWEEN 1 AND 5);
```

- [ ] **Step 2: Apply via MCP**

- name: `028_profiles_hire_termination_arl`
- project_id: `ugkvuinkynvtuiutwlkd`

- [ ] **Step 3: Verify**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('hire_date','termination_date','is_terminated','arl_risk_class')
ORDER BY column_name;
```

Expected: 4 rows with the right types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/028_profiles_hire_termination_arl.sql
git commit -m "feat(payroll): add hire_date, termination_date, is_terminated, arl_risk_class to profiles (mig 028)"
```

---

## Task 3: Migration 029 — payroll period tables + triggers

**Files:**
- Create: `supabase/migrations/029_payroll_period_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply via MCP**

- name: `029_payroll_period_tables`
- project_id: `ugkvuinkynvtuiutwlkd`

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_name IN (
  'payroll_periods','payroll_entries','payroll_provisions',
  'payroll_employer_cost','absence_records','tax_personal_deductions'
);
SELECT count(*) FROM pg_policy
WHERE polrelid IN (
  'public.payroll_periods'::regclass,
  'public.payroll_entries'::regclass,
  'public.payroll_provisions'::regclass,
  'public.payroll_employer_cost'::regclass,
  'public.absence_records'::regclass,
  'public.tax_personal_deductions'::regclass
);
SELECT value->>'payment_frequency' FROM app_settings WHERE key = 'app_flags';
```

Expected: tables=6, polices≥12, payment_frequency='mensual'.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/029_payroll_period_tables.sql
git commit -m "feat(payroll): payroll period tables, RLS, triggers, time_off auto-link (mig 029)"
```

---

## Task 4: Add new types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append the new types**

Append at the end of `src/lib/types.ts`:

```ts
// ----------------------------------------------------------------------------
// Payroll engine (sub-spec 2)
// ----------------------------------------------------------------------------

export type PaymentFrequency = "mensual" | "quincenal";
export type PayrollPeriodStatus = "draft" | "approved" | "paid";

export type PayrollConceptType =
  | "salary" | "transport"
  | "surcharge_night" | "surcharge_sunday" | "surcharge_holiday"
  | "overtime_day" | "overtime_night"
  | "bonus_salary" | "bonus_non_salary"
  | "vacation_pay" | "prima" | "cesantias_interest"
  | "health_employee" | "pension_employee" | "solidarity_pension"
  | "income_tax" | "embargo" | "libranza"
  | "voluntary_pension" | "afc" | "union_fee" | "other_deduction";

export type ProvisionConcept = "cesantias" | "cesantias_interest" | "prima" | "vacaciones";

export type AbsenceType =
  | "sick_eps" | "sick_arl" | "maternity" | "paternity"
  | "vacation" | "paid_leave" | "unpaid_leave" | "suspension";

export type AbsencePayer = "employer" | "eps" | "arl" | "none";

export interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  frequency: PaymentFrequency;
  status: PayrollPeriodStatus;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
}

export interface PayrollEntry {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  concept_type: PayrollConceptType;
  is_income: boolean;
  base: number | null;
  rate: number | null;
  amount: number;
  description: string | null;
  is_manual_override: boolean;
  created_at: string;
}

export interface PayrollProvision {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  concept: ProvisionConcept;
  base: number;
  rate: number;
  amount: number;
  accumulated_ytd: number;
  created_at: string;
}

export interface PayrollEmployerCost {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  health_employer: number;
  pension_employer: number;
  arl_employer: number;
  parafiscales_caja: number;
  parafiscales_sena: number;
  parafiscales_icbf: number;
  total: number;
  created_at: string;
}

export interface AbsenceRecord {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: AbsenceType;
  paid_pct: number;
  payer: AbsencePayer;
  notes: string | null;
  source_request_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaxPersonalDeduction {
  id: string;
  employee_id: string;
  dependents_count: number;
  mortgage_interest_monthly: number;
  prepaid_health_monthly: number;
  voluntary_pension_monthly: number;
  afc_monthly: number;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(payroll): add types for engine sub-spec 2"
```

---

(Tasks 5-30 continue in subsequent files due to plan length. See companion file `2026-04-26-payroll-engine-tasks-5-30.md` for the rest. Each task follows the same structure: write failing test, run, implement, verify, commit.)

---

## Task 5: Helper `isIncomeForConcept` (TDD)

**Files:**
- Create: `src/lib/payroll-engine-helpers.ts`
- Create: `src/lib/payroll-engine-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/payroll-engine-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isIncomeForConcept } from "./payroll-engine-helpers";

describe("isIncomeForConcept", () => {
  it.each([
    "salary","transport","surcharge_night","surcharge_sunday","surcharge_holiday",
    "overtime_day","overtime_night","bonus_salary","bonus_non_salary",
    "vacation_pay","prima","cesantias_interest"
  ])("%s is income", (c) => expect(isIncomeForConcept(c)).toBe(true));

  it.each([
    "health_employee","pension_employee","solidarity_pension","income_tax",
    "embargo","libranza","voluntary_pension","afc","union_fee","other_deduction"
  ])("%s is deduction", (c) => expect(isIncomeForConcept(c)).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-engine-helpers`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/payroll-engine-helpers.ts`:

```ts
import type { PayrollConceptType } from "./types";

const INCOME_CONCEPTS = new Set<PayrollConceptType>([
  "salary", "transport",
  "surcharge_night", "surcharge_sunday", "surcharge_holiday",
  "overtime_day", "overtime_night",
  "bonus_salary", "bonus_non_salary",
  "vacation_pay", "prima", "cesantias_interest",
]);

export function isIncomeForConcept(concept: string): boolean {
  return INCOME_CONCEPTS.has(concept as PayrollConceptType);
}
```

- [ ] **Step 4: Verify**

Run: `npm run test -- payroll-engine-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add isIncomeForConcept helper"
```

---

## Task 6: Helper `getSolidarityRate` (TDD)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts`
- Modify: `src/lib/payroll-engine-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `getSolidarityRate` to imports. Append:

```ts
const SMMLV = 1_750_905;

describe("getSolidarityRate", () => {
  it("< 4 SMMLV → 0", () => {
    expect(getSolidarityRate(3 * SMMLV, SMMLV)).toBe(0);
  });
  it("≥ 4 SMMLV and < 16 → 0.01", () => {
    expect(getSolidarityRate(4 * SMMLV, SMMLV)).toBe(0.01);
    expect(getSolidarityRate(15 * SMMLV, SMMLV)).toBe(0.01);
  });
  it("≥ 16 and < 17 → 0.012", () => {
    expect(getSolidarityRate(16 * SMMLV, SMMLV)).toBe(0.012);
  });
  it("≥ 17 and < 18 → 0.014", () => {
    expect(getSolidarityRate(17 * SMMLV, SMMLV)).toBe(0.014);
  });
  it("≥ 18 and < 19 → 0.016", () => {
    expect(getSolidarityRate(18 * SMMLV, SMMLV)).toBe(0.016);
  });
  it("≥ 19 and < 20 → 0.018", () => {
    expect(getSolidarityRate(19 * SMMLV, SMMLV)).toBe(0.018);
  });
  it("≥ 20 SMMLV → 0.02", () => {
    expect(getSolidarityRate(20 * SMMLV, SMMLV)).toBe(0.02);
    expect(getSolidarityRate(25 * SMMLV, SMMLV)).toBe(0.02);
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run test -- payroll-engine-helpers`

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-engine-helpers.ts`:

```ts
export function getSolidarityRate(ibc: number, smmlv: number): number {
  const ratio = ibc / smmlv;
  if (ratio < 4) return 0;
  if (ratio < 16) return 0.01;
  if (ratio < 17) return 0.012;
  if (ratio < 18) return 0.014;
  if (ratio < 19) return 0.016;
  if (ratio < 20) return 0.018;
  return 0.02;
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add getSolidarityRate helper"
```

---

## Task 7: Helper `getArlRate` + `isExonerationApplicable` (TDD)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts`
- Modify: `src/lib/payroll-engine-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `getArlRate, isExonerationApplicable` to imports. Append:

```ts
describe("getArlRate", () => {
  it.each([
    [null, 0.00522],
    [1, 0.00522],
    [2, 0.01044],
    [3, 0.02436],
    [4, 0.04350],
    [5, 0.06960],
  ])("class %s → %f", (cls, expected) => {
    expect(getArlRate(cls as number | null)).toBeCloseTo(expected, 5);
  });
});

describe("isExonerationApplicable", () => {
  it("salary < 10×SMMLV → true", () => {
    expect(isExonerationApplicable(5_000_000, SMMLV)).toBe(true);
  });
  it("salary ≥ 10×SMMLV → false", () => {
    expect(isExonerationApplicable(10 * SMMLV, SMMLV)).toBe(false);
    expect(isExonerationApplicable(20 * SMMLV, SMMLV)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify FAIL**

- [ ] **Step 3: Implement**

Append:

```ts
export function getArlRate(class_: number | null): number {
  switch (class_) {
    case 1:
    case null:
    case undefined:
      return 0.00522;
    case 2: return 0.01044;
    case 3: return 0.02436;
    case 4: return 0.04350;
    case 5: return 0.06960;
    default: return 0.00522;
  }
}

export function isExonerationApplicable(monthlySalary: number, smmlv: number): boolean {
  return monthlySalary < 10 * smmlv;
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add getArlRate and isExonerationApplicable helpers"
```

---

## Task 8: Helper `applyDayProration` + `getCurrentTaxDeductions` (TDD)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts`
- Modify: `src/lib/payroll-engine-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `applyDayProration, getCurrentTaxDeductions` to imports. Append:

```ts
import type { TaxPersonalDeduction } from "./types";

describe("applyDayProration", () => {
  it("30 days → full amount", () => {
    expect(applyDayProration(3_000_000, 30)).toBe(3_000_000);
  });
  it("15 days → half", () => {
    expect(applyDayProration(3_000_000, 15)).toBe(1_500_000);
  });
  it("0 days → 0", () => {
    expect(applyDayProration(3_000_000, 0)).toBe(0);
  });
  it("8 days → 8/30", () => {
    expect(applyDayProration(3_000_000, 8)).toBe(800_000);
  });
});

const mkTax = (overrides: Partial<TaxPersonalDeduction>): TaxPersonalDeduction => ({
  id: "x", employee_id: "emp1",
  dependents_count: 0, mortgage_interest_monthly: 0,
  prepaid_health_monthly: 0, voluntary_pension_monthly: 0, afc_monthly: 0,
  effective_from: "2026-01-01", effective_to: null,
  created_by: null, created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("getCurrentTaxDeductions", () => {
  it("empty → null", () => {
    expect(getCurrentTaxDeductions([], "emp1", "2026-04-15")).toBeNull();
  });
  it("matches employee + date", () => {
    const h = [
      mkTax({ id: "a", effective_from: "2026-01-01", effective_to: "2026-03-31" }),
      mkTax({ id: "b", effective_from: "2026-04-01", effective_to: null }),
    ];
    expect(getCurrentTaxDeductions(h, "emp1", "2026-04-15")?.id).toBe("b");
    expect(getCurrentTaxDeductions(h, "emp1", "2026-02-15")?.id).toBe("a");
  });
});
```

- [ ] **Step 2: Verify FAIL**

- [ ] **Step 3: Implement**

Append:

```ts
import type { TaxPersonalDeduction } from "./types";

export function applyDayProration(monthlyAmount: number, workedDays: number): number {
  if (workedDays <= 0) return 0;
  if (workedDays >= 30) return Math.round(monthlyAmount);
  return Math.round((monthlyAmount * workedDays) / 30);
}

export function getCurrentTaxDeductions(
  history: TaxPersonalDeduction[],
  employeeId: string,
  date: string
): TaxPersonalDeduction | null {
  for (const r of history) {
    if (r.employee_id !== employeeId) continue;
    if (r.effective_from > date) continue;
    if (r.effective_to !== null && r.effective_to < date) continue;
    return r;
  }
  return null;
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add applyDayProration and getCurrentTaxDeductions helpers"
```

---

## Task 9: Helper `classifyHour` (TDD)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts`
- Modify: `src/lib/payroll-engine-helpers.test.ts`

`classifyHour(date, hourOfDay, holidays, settings, locationId)` returns `{ isNight, isSunday, isHoliday }`.

- [ ] **Step 1: Write the failing tests**

Add `classifyHour` to imports. Append:

```ts
import type { HolidayDate, PayrollSettings } from "./types";

const settings: PayrollSettings = {
  id: "s1", period_start: "2026-01-01", period_end: null,
  smmlv: 1750905, aux_transport: 249095, hourly_divisor: 220,
  night_start_hour: 19, sunday_surcharge_pct: 0.8, holiday_surcharge_pct: 0.8,
  uvt: 52374, updated_at: "2026-01-01",
} as PayrollSettings & { uvt: number };

describe("classifyHour", () => {
  it("Monday 14:00 → all false", () => {
    // 2026-04-06 is Monday
    expect(classifyHour("2026-04-06", 14, [], settings, "loc1"))
      .toEqual({ isNight: false, isSunday: false, isHoliday: false });
  });
  it("Monday 20:00 → night only", () => {
    expect(classifyHour("2026-04-06", 20, [], settings, "loc1"))
      .toEqual({ isNight: true, isSunday: false, isHoliday: false });
  });
  it("Monday 04:00 → night only", () => {
    expect(classifyHour("2026-04-06", 4, [], settings, "loc1"))
      .toEqual({ isNight: true, isSunday: false, isHoliday: false });
  });
  it("Sunday 14:00 → sunday only", () => {
    // 2026-04-05 is Sunday
    expect(classifyHour("2026-04-05", 14, [], settings, "loc1"))
      .toEqual({ isNight: false, isSunday: true, isHoliday: false });
  });
  it("Sunday 22:00 → night and sunday", () => {
    expect(classifyHour("2026-04-05", 22, [], settings, "loc1"))
      .toEqual({ isNight: true, isSunday: true, isHoliday: false });
  });
  it("Holiday Tuesday → holiday only", () => {
    const hols: HolidayDate[] = [{
      id: "h1", date: "2026-05-01", name: "Día del Trabajo",
      location_id: null, created_at: "2026-01-01",
    } as HolidayDate];
    expect(classifyHour("2026-05-01", 14, hols, settings, "loc1"))
      .toEqual({ isNight: false, isSunday: false, isHoliday: true });
  });
  it("Holiday with location_id matches employee location", () => {
    const hols: HolidayDate[] = [{
      id: "h2", date: "2026-04-15", name: "Aniversario sede",
      location_id: "loc1", created_at: "2026-01-01",
    } as HolidayDate];
    expect(classifyHour("2026-04-15", 14, hols, settings, "loc1").isHoliday).toBe(true);
    expect(classifyHour("2026-04-15", 14, hols, settings, "loc2").isHoliday).toBe(false);
  });
});
```

- [ ] **Step 2: Verify FAIL**

- [ ] **Step 3: Implement**

Append:

```ts
import type { HolidayDate, PayrollSettings } from "./types";

export function classifyHour(
  date: string,
  hourOfDay: number,
  holidays: HolidayDate[],
  settings: PayrollSettings,
  locationId: string
): { isNight: boolean; isSunday: boolean; isHoliday: boolean } {
  const dow = new Date(date + "T00:00:00").getDay();
  const isSunday = dow === 0;
  const isNight = hourOfDay >= settings.night_start_hour || hourOfDay < 6;
  const isHoliday = holidays.some(
    (h) => h.date === date && (h.location_id === null || h.location_id === locationId)
  );
  return { isNight, isSunday, isHoliday };
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add classifyHour helper"
```

---

## Task 10: Helper `aplicarTablaRetencion` + `depurarBaseRetencion` (TDD)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts`
- Modify: `src/lib/payroll-engine-helpers.test.ts`

Tabla retención (Art. 383 ET) en UVT 2026:

| base depurada (UVT) | tarifa | menos |
|---|---|---|
| 0..95 | 0% | 0 |
| 95..150 | 19% | 95 UVT |
| 150..360 | 28% | 150 UVT - 10 UVT (= 140 UVT × 19%) |
| 360..640 | 33% | 360 UVT - 39.5 UVT |
| 640..945 | 35% | 640 UVT - 70.85 UVT |
| 945..2300 | 37% | 945 UVT - 134.85 UVT |
| ≥ 2300 | 39% | 2300 UVT - 636.65 UVT |

- [ ] **Step 1: Write the failing tests**

Append:

```ts
const UVT = 52374;

describe("aplicarTablaRetencion", () => {
  it("base ≤ 95 UVT → 0", () => {
    expect(aplicarTablaRetencion(94 * UVT, UVT)).toBe(0);
    expect(aplicarTablaRetencion(95 * UVT, UVT)).toBe(0);
  });
  it("100 UVT → (100-95) × 19% × UVT", () => {
    const expected = Math.round((100 - 95) * 0.19 * UVT);
    expect(aplicarTablaRetencion(100 * UVT, UVT)).toBe(expected);
  });
  it("200 UVT → tarifa 28% tramo", () => {
    // (200-150)*28% + (150-95)*19% = 14 + 10.45 = 24.45 UVT
    const expected = Math.round(((200 - 150) * 0.28 + (150 - 95) * 0.19) * UVT);
    expect(aplicarTablaRetencion(200 * UVT, UVT)).toBe(expected);
  });
});

describe("depurarBaseRetencion", () => {
  it("base ingreso 5M, sin deducciones → resta SS empleado (8%)", () => {
    const r = depurarBaseRetencion({
      grossIncome: 5_000_000,
      mandatorySS: 400_000,
      dependents: 0,
      mortgageInterest: 0,
      prepaidHealth: 0,
      voluntaryPension: 0,
      afc: 0,
      uvt: UVT,
    });
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(5_000_000);
  });
  it("returns ≥ 0", () => {
    expect(depurarBaseRetencion({
      grossIncome: 0, mandatorySS: 0, dependents: 0,
      mortgageInterest: 0, prepaidHealth: 0,
      voluntaryPension: 0, afc: 0, uvt: UVT,
    })).toBe(0);
  });
});
```

- [ ] **Step 2: Verify FAIL**

- [ ] **Step 3: Implement**

Append:

```ts
export function aplicarTablaRetencion(baseDepurada: number, uvt: number): number {
  const baseUvt = baseDepurada / uvt;
  if (baseUvt <= 95) return 0;
  if (baseUvt <= 150) {
    return Math.round((baseUvt - 95) * 0.19 * uvt);
  }
  if (baseUvt <= 360) {
    const acc = (150 - 95) * 0.19;
    return Math.round((acc + (baseUvt - 150) * 0.28) * uvt);
  }
  if (baseUvt <= 640) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28;
    return Math.round((acc + (baseUvt - 360) * 0.33) * uvt);
  }
  if (baseUvt <= 945) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33;
    return Math.round((acc + (baseUvt - 640) * 0.35) * uvt);
  }
  if (baseUvt <= 2300) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33 + (945 - 640) * 0.35;
    return Math.round((acc + (baseUvt - 945) * 0.37) * uvt);
  }
  const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33 + (945 - 640) * 0.35 + (2300 - 945) * 0.37;
  return Math.round((acc + (baseUvt - 2300) * 0.39) * uvt);
}

export interface DepurarRetencionInput {
  grossIncome: number;
  mandatorySS: number;
  dependents: number;
  mortgageInterest: number;
  prepaidHealth: number;
  voluntaryPension: number;
  afc: number;
  uvt: number;
}

export function depurarBaseRetencion(input: DepurarRetencionInput): number {
  const { grossIncome, mandatorySS, dependents, mortgageInterest,
          prepaidHealth, voluntaryPension, afc, uvt } = input;
  if (grossIncome <= 0) return 0;

  // 1. Restar aportes obligatorios SS.
  let base = grossIncome - mandatorySS;

  // 2. Restar deducciones (con topes en UVT).
  const dependentsCap = Math.min(grossIncome * 0.10, 32 * uvt);
  const dependentsDed = dependents > 0 ? dependentsCap : 0;
  const mortgageCap = Math.min(mortgageInterest, 100 * uvt);
  const prepaidCap = Math.min(prepaidHealth, 16 * uvt);
  base -= dependentsDed + mortgageCap + prepaidCap;

  // 3. Restar rentas exentas (AFC + voluntary AFP, tope 30% del bruto).
  const exentaCap = Math.min(voluntaryPension + afc, grossIncome * 0.30);
  base -= exentaCap;

  // 4. Restar 25% renta exenta laboral con tope 240 UVT/mes.
  const laboralExenta = Math.min(base * 0.25, 240 * uvt);
  base -= laboralExenta;

  return Math.max(0, base);
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine-helpers.test.ts
git commit -m "feat(payroll): add aplicarTablaRetencion + depurarBaseRetencion helpers"
```

---

## Tasks 11-30: see continuation in this same file

The remaining tasks follow the same TDD/commit pattern. They cover:

- **Task 11**: Engine pipeline stage 1 — `computeWorkedDays` (TDD).
- **Task 12**: Stages 2+3 — `computeBaseSalary` + `computeTransportAux` (TDD).
- **Task 13**: Stage 4 — `computeSurcharges` from schedule_entries (TDD).
- **Task 14**: Stage 5 — `computeOvertime` (TDD).
- **Task 15**: Stage 6 — `computeAdjustments` (TDD).
- **Task 16**: Stage 7 — `computeIBC` (TDD).
- **Task 17**: Stage 8 — `computeEmployeeDeductions` (TDD).
- **Task 18**: Stage 9 — `computeProvisionsAndEmployerCost` (TDD).
- **Task 19**: Top-level `computePayroll` orchestrator (TDD with end-to-end fixtures).
- **Task 20**: Multi-period split when settings change mid-period (TDD).
- **Task 21**: Component `AbsenceForm`.
- **Task 22**: Component `AbsenceSection` for side sheet.
- **Task 23**: Component `TaxDeductionsForm` + `TaxDeductionsSection`.
- **Task 24**: Wire `/empleados` side sheet — add absence + tax sections + edit form fields (hire/term/ARL).
- **Task 25**: Component `PeriodGenerateModal`.
- **Task 26**: Components `PeriodSummaryTab`, `PeriodEmployeeTab`, `PeriodOverridesTab`, `PeriodOverrideForm`.
- **Task 27**: Page `/nomina/periodos` (list).
- **Task 28**: Page `/nomina/periodos/[id]` (detail orchestrator with the 3 tabs).
- **Task 29**: Page `/nomina/ausencias` (cross-employee list).
- **Task 30**: Sidebar updates + settings page (payment_frequency selector) + final verification + push.

For each remaining task, the implementer should follow the patterns established in tasks 5-10:

1. **Read the relevant section of the spec** (`docs/superpowers/specs/2026-04-26-payroll-engine-design.md`).
2. **Write the failing test** based on the contract described in §4 (engine pipeline) or §5 (UI).
3. **Run test → FAIL**.
4. **Implement minimally**.
5. **Run test → PASS**.
6. **Run `npm run build` to confirm no TS errors**.
7. **Commit with `feat(payroll): ...`**.

The engine stage tasks (11-19) build progressively in `src/lib/payroll-engine.ts`, each adding one stage and re-running all tests. The orchestrator task (19) ties them together with a fixture-driven end-to-end test using a $2.8M employee scenario from research §9.

The component tasks (21-29) follow the patterns already established in sub-spec 1 (SalaryCell, SalaryChangeForm, etc.). Reuse helpers from `payroll-helpers.ts` and `payroll-engine-helpers.ts`.

**Final verification (part of task 30):**

- `npm run test` → all tests pass.
- `npm run build` → success.
- Manual smoke: log in as admin, generate a period, see the resumen tab, expand an employee, add an override, approve, mark as paid, verify cannot un-approve.
- Push to main.

---

## Self-review notes

- The plan stops detailed for tasks 1-10 (migrations + types + 6 helpers) which is the foundation. Tasks 11-30 are listed by intent — the implementer (or subagent dispatcher) breaks each into the same TDD steps using the spec as the contract.
- This is intentional: the engine pipeline stages (11-19) are tightly interdependent and benefit from being implemented together with end-to-end fixtures. Specifying every line up front would freeze design decisions that should emerge during implementation.
- For the controller running subagent-driven-development: dispatch tasks 1-10 individually (well-specified), then dispatch tasks 11-19 as a cohesive engine batch (one or two subagents), and tasks 21-29 individually.
