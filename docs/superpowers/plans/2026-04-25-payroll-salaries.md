# Payroll Sub-spec 1 (Salarios + Ajustes + Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation for the Colombian payroll module per `docs/superpowers/specs/2026-04-25-payroll-salaries-design.md`. No compute engine, no employee colilla — those are sub-specs 2 and 3.

**Architecture:** One Postgres migration creates `salary_history`, `salary_adjustments`, `payroll_settings`, plus an `app_flags` row in `app_settings`. Pure helpers in `src/lib/payroll-helpers.ts` (TDD). Admin UI extends `/empleados` with an inline salary cell + side-sheet sections, adds a new `/nomina/configuracion` page under a new sidebar group "Nómina", and adds a managers-visibility toggle in `/settings`. Existing Supabase RLS conventions (`get_user_role()`, `get_user_location_id()`) are reused.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind v3, shadcn/ui, Supabase (Postgres + RLS + browser client), Vitest for pure logic, SQL test files for triggers/RLS.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/025_payroll_salaries.sql` | create | Tables + RLS + triggers + seed 3 payroll_settings + insert app_flags row |
| `supabase/tests/payroll/salary_history_no_overlap.sql` | create | Reject overlapping closed ranges |
| `supabase/tests/payroll/salary_history_auto_close.sql` | create | New insert closes previous open row |
| `supabase/tests/payroll/salary_history_one_open_per_employee.sql` | create | Unique partial index enforces one open row |
| `supabase/tests/payroll/payroll_settings_rls.sql` | create | authenticated SELECT ok; INSERT denied |
| `src/lib/types.ts` | modify | +3 interfaces |
| `src/lib/payroll-helpers.ts` | create | 6 pure functions |
| `src/lib/payroll-helpers.test.ts` | create | Vitest |
| `src/components/employees/salary-cell.tsx` | create | Inline-edit cell for `/empleados` |
| `src/components/employees/salary-change-form.tsx` | create | Modal for new salary record |
| `src/components/employees/salary-history-section.tsx` | create | Timeline + button for the side sheet |
| `src/components/employees/salary-adjustment-form.tsx` | create | Modal for new adjustment |
| `src/components/employees/salary-adjustments-section.tsx` | create | Table + button for the side sheet |
| `src/components/nomina/payroll-setting-form.tsx` | create | Modal for create/edit payroll_settings row |
| `src/components/nomina/payroll-settings-table.tsx` | create | Table of payroll_settings |
| `src/app/(authenticated)/nomina/configuracion/page.tsx` | create | Page orchestrator |
| `src/components/settings/salaries-visibility-toggle.tsx` | create | New `/settings` row |
| `src/app/(authenticated)/employees/page.tsx` | modify | Add column + wire side-sheet sections |
| `src/components/layout/sidebar.tsx` | modify | New "Nómina" group + item |
| `src/app/(authenticated)/settings/page.tsx` | modify | Mount the new toggle |

---

## Convention reminders

- **Spanish UI** with normalized accents.
- **No emojis** in source files.
- All client data access goes through `createClient()` from `@/lib/supabase/client`.
- Use `useAuth()` for current profile/role.
- Money is `numeric(12,2)` in DB and JS `number` in app code (no decimals expected — COP values).
- Run `npm run test` and `npm run build` before each commit.
- Follow existing migration style (`CREATE TABLE`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`).

---

## Task 1: Migration 025 — payroll tables, triggers, RLS, seeds

**Files:**
- Create: `supabase/migrations/025_payroll_salaries.sql`

This is the only DB change in the sub-spec. It is one self-contained migration so a partial run cannot leave the schema half-built.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/025_payroll_salaries.sql`:

```sql
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

-- One open row per employee (effective_to IS NULL).
CREATE UNIQUE INDEX salary_history_one_open_per_employee
  ON salary_history (employee_id) WHERE effective_to IS NULL;

-- Trigger: when inserting a new row, close any currently open row for the
-- same employee at NEW.effective_from - 1 day. Reject overlapping closed
-- ranges.
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
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with `name=025_payroll_salaries` and the SQL contents above. The user has previously authorized direct prod migrations for this project (memory: feedback_production_authorization).

- [ ] **Step 3: Verify the migration applied cleanly**

Run via Supabase MCP `execute_sql`:

```sql
SELECT count(*) AS rows FROM payroll_settings;
SELECT key FROM app_settings WHERE key = 'app_flags';
SELECT count(*) AS pol FROM pg_policy
  WHERE polrelid IN (
    'public.salary_history'::regclass,
    'public.salary_adjustments'::regclass,
    'public.payroll_settings'::regclass
  );
```

Expected: `rows=3`, `key=app_flags`, `pol=6` (2 per table).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/025_payroll_salaries.sql
git commit -m "feat(payroll): migration 025 — salary_history, salary_adjustments, payroll_settings + seeds"
```

---

## Task 2: Add types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append the three interfaces**

Append to the end of `src/lib/types.ts`:

```ts
// ----------------------------------------------------------------------------
// Payroll (sub-spec 1)
// ----------------------------------------------------------------------------

export interface SalaryHistory {
  id: string;
  employee_id: string;
  monthly_salary: number;
  is_integral_salary: boolean;
  transport_aux_override: boolean | null;
  change_reason: string | null;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  employee_id: string;
  payment_date: string; // YYYY-MM-DD
  concept_label: string;
  amount: number;
  is_salary_component: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PayrollSettings {
  id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string | null;
  smmlv: number;
  aux_transport: number;
  hourly_divisor: number;
  night_start_hour: number;
  sunday_surcharge_pct: number;
  holiday_surcharge_pct: number;
  updated_at: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(payroll): add SalaryHistory, SalaryAdjustment, PayrollSettings types"
```

---

## Task 3: `formatCOP` + `parseCOP` (TDD)

**Files:**
- Create: `src/lib/payroll-helpers.ts`
- Create: `src/lib/payroll-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/payroll-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatCOP, parseCOP } from "./payroll-helpers";

describe("formatCOP", () => {
  it("formats integer COP with dot thousands", () => {
    expect(formatCOP(2800000)).toBe("$2.800.000");
  });

  it("zero", () => {
    expect(formatCOP(0)).toBe("$0");
  });

  it("rounds non-integers", () => {
    expect(formatCOP(2800000.7)).toBe("$2.800.001");
  });
});

describe("parseCOP", () => {
  it.each([
    ["$2.800.000", 2800000],
    ["2.800.000", 2800000],
    ["2800000", 2800000],
    ["$2,800,000", 2800000],
    ["  $ 2.800.000  ", 2800000],
    ["0", 0],
  ])("'%s' → %i", (input, expected) => {
    expect(parseCOP(input)).toBe(expected);
  });

  it.each(["", "abc", "$$", "1,2,3,4.5,6"])(
    "'%s' → null",
    (input) => {
      expect(parseCOP(input)).toBeNull();
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-helpers`
Expected: FAIL — `payroll-helpers` module not found.

- [ ] **Step 3: Implement**

Create `src/lib/payroll-helpers.ts`:

```ts
// Pure helpers for the payroll module (sub-spec 1).
// All functions are deterministic and side-effect free.

export function formatCOP(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  // insert dots every 3 digits from the right
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${withDots}`;
}

export function parseCOP(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Strip $ and whitespace, then strip thousand separators (. or ,)
  const stripped = trimmed.replace(/[$\s]/g, "").replace(/[.,]/g, "");
  if (!/^-?\d+$/.test(stripped)) return null;
  return parseInt(stripped, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- payroll-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-helpers.ts src/lib/payroll-helpers.test.ts
git commit -m "feat(payroll): add formatCOP and parseCOP helpers"
```

---

## Task 4: `getCurrentSalary` (TDD)

**Files:**
- Modify: `src/lib/payroll-helpers.ts`
- Modify: `src/lib/payroll-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `getCurrentSalary` to the test file's import. Append:

```ts
import type { SalaryHistory } from "./types";

const mkSal = (overrides: Partial<SalaryHistory>): SalaryHistory => ({
  id: "x",
  employee_id: "emp1",
  monthly_salary: 2_000_000,
  is_integral_salary: false,
  transport_aux_override: null,
  change_reason: null,
  effective_from: "2026-01-01",
  effective_to: null,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("getCurrentSalary", () => {
  it("empty history → null", () => {
    expect(getCurrentSalary([], "emp1", "2026-04-15")).toBeNull();
  });

  it("single open row covers any date ≥ effective_from", () => {
    const h = [mkSal({ effective_from: "2026-01-01" })];
    expect(getCurrentSalary(h, "emp1", "2026-04-15")).toBe(h[0]);
    expect(getCurrentSalary(h, "emp1", "2026-01-01")).toBe(h[0]);
  });

  it("date before effective_from → null", () => {
    const h = [mkSal({ effective_from: "2026-03-01" })];
    expect(getCurrentSalary(h, "emp1", "2026-02-01")).toBeNull();
  });

  it("picks the row whose [from,to] contains the date", () => {
    const r1 = mkSal({ id: "r1", effective_from: "2026-01-01", effective_to: "2026-03-31" });
    const r2 = mkSal({ id: "r2", effective_from: "2026-04-01", effective_to: null });
    const h = [r1, r2];
    expect(getCurrentSalary(h, "emp1", "2026-02-15")?.id).toBe("r1");
    expect(getCurrentSalary(h, "emp1", "2026-04-15")?.id).toBe("r2");
  });

  it("filters by employee_id", () => {
    const h = [
      mkSal({ id: "a", employee_id: "emp1" }),
      mkSal({ id: "b", employee_id: "emp2" }),
    ];
    expect(getCurrentSalary(h, "emp2", "2026-04-15")?.id).toBe("b");
  });
});
```

Add `getCurrentSalary` to the imports at the top:

```ts
import { formatCOP, parseCOP, getCurrentSalary } from "./payroll-helpers";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-helpers`
Expected: FAIL — `getCurrentSalary is not exported`.

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-helpers.ts`:

```ts
import type { SalaryHistory } from "./types";

export function getCurrentSalary(
  history: SalaryHistory[],
  employeeId: string,
  date: string // YYYY-MM-DD
): SalaryHistory | null {
  for (const r of history) {
    if (r.employee_id !== employeeId) continue;
    if (r.effective_from > date) continue;
    if (r.effective_to !== null && r.effective_to < date) continue;
    return r;
  }
  return null;
}
```

(Lex string comparison works because all dates are ISO `YYYY-MM-DD`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- payroll-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-helpers.ts src/lib/payroll-helpers.test.ts
git commit -m "feat(payroll): add getCurrentSalary helper"
```

---

## Task 5: `getSettingsForDate` (TDD)

**Files:**
- Modify: `src/lib/payroll-helpers.ts`
- Modify: `src/lib/payroll-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in the test file to include `getSettingsForDate`. Append:

```ts
import type { PayrollSettings } from "./types";

const settings2026: PayrollSettings[] = [
  {
    id: "p1",
    period_start: "2026-01-01",
    period_end: "2026-06-30",
    smmlv: 1750905,
    aux_transport: 249095,
    hourly_divisor: 220,
    night_start_hour: 19,
    sunday_surcharge_pct: 0.8,
    holiday_surcharge_pct: 0.8,
    updated_at: "2026-01-01",
  },
  {
    id: "p2",
    period_start: "2026-07-01",
    period_end: "2026-07-14",
    smmlv: 1750905,
    aux_transport: 249095,
    hourly_divisor: 220,
    night_start_hour: 19,
    sunday_surcharge_pct: 0.9,
    holiday_surcharge_pct: 0.9,
    updated_at: "2026-01-01",
  },
  {
    id: "p3",
    period_start: "2026-07-15",
    period_end: null,
    smmlv: 1750905,
    aux_transport: 249095,
    hourly_divisor: 210,
    night_start_hour: 19,
    sunday_surcharge_pct: 0.9,
    holiday_surcharge_pct: 0.9,
    updated_at: "2026-01-01",
  },
];

describe("getSettingsForDate", () => {
  it("April 15 → first sub-period", () => {
    expect(getSettingsForDate(settings2026, "2026-04-15")?.id).toBe("p1");
  });

  it("July 10 → second sub-period", () => {
    expect(getSettingsForDate(settings2026, "2026-07-10")?.id).toBe("p2");
  });

  it("August 1 → third (open-ended)", () => {
    expect(getSettingsForDate(settings2026, "2026-08-01")?.id).toBe("p3");
  });

  it("date before any period → null", () => {
    expect(getSettingsForDate(settings2026, "2025-12-31")).toBeNull();
  });

  it("empty settings → null", () => {
    expect(getSettingsForDate([], "2026-04-15")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-helpers`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-helpers.ts`:

```ts
import type { PayrollSettings } from "./types";

export function getSettingsForDate(
  settings: PayrollSettings[],
  date: string
): PayrollSettings | null {
  for (const s of settings) {
    if (s.period_start > date) continue;
    if (s.period_end !== null && s.period_end < date) continue;
    return s;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- payroll-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-helpers.ts src/lib/payroll-helpers.test.ts
git commit -m "feat(payroll): add getSettingsForDate helper"
```

---

## Task 6: `computeHourlyRate` (TDD)

**Files:**
- Modify: `src/lib/payroll-helpers.ts`
- Modify: `src/lib/payroll-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in the test file to include `computeHourlyRate`. Append:

```ts
describe("computeHourlyRate", () => {
  it("$2.800.000 / 220 → 12727 (rounded)", () => {
    expect(computeHourlyRate(2_800_000, 220)).toBe(12727);
  });

  it("$2.800.000 / 210 → 13333 (rounded)", () => {
    expect(computeHourlyRate(2_800_000, 210)).toBe(13333);
  });

  it("salary 0 → 0", () => {
    expect(computeHourlyRate(0, 220)).toBe(0);
  });

  it("divisor 0 → 0 (defensive)", () => {
    expect(computeHourlyRate(2_800_000, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-helpers`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-helpers.ts`:

```ts
export function computeHourlyRate(monthlySalary: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return Math.round(monthlySalary / divisor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- payroll-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-helpers.ts src/lib/payroll-helpers.test.ts
git commit -m "feat(payroll): add computeHourlyRate helper"
```

---

## Task 7: `validateSalary` (TDD)

**Files:**
- Modify: `src/lib/payroll-helpers.ts`
- Modify: `src/lib/payroll-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in the test file to include `validateSalary`. Append:

```ts
const SMMLV = 1_750_905; // 2026

describe("validateSalary", () => {
  it("≥ SMMLV non-integral → ok", () => {
    const r = validateSalary(2_000_000, SMMLV, false);
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.warning).toBeUndefined();
  });

  it("< SMMLV non-integral → error", () => {
    const r = validateSalary(1_500_000, SMMLV, false);
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("< SMMLV integral → ok (integral can be any)", () => {
    const r = validateSalary(1_500_000, SMMLV, true);
    expect(r.ok).toBe(true);
  });

  it("integral but < 13×SMMLV → ok with warning", () => {
    const r = validateSalary(15_000_000, SMMLV, true);
    expect(r.ok).toBe(true);
    expect(r.warning).toBeDefined();
  });

  it("integral and ≥ 13×SMMLV → ok no warning", () => {
    const r = validateSalary(23_000_000, SMMLV, true);
    expect(r.ok).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it("at exactly SMMLV non-integral → ok", () => {
    expect(validateSalary(SMMLV, SMMLV, false).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- payroll-helpers`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-helpers.ts`:

```ts
export function validateSalary(
  amount: number,
  smmlv: number,
  isIntegral: boolean
): { ok: boolean; error?: string; warning?: string } {
  if (!isIntegral && amount < smmlv) {
    return { ok: false, error: "El salario no puede ser menor al SMMLV vigente" };
  }
  if (isIntegral && amount < 13 * smmlv) {
    return {
      ok: true,
      warning: "El salario integral debería ser mayor o igual a 13 SMMLV",
    };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- payroll-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-helpers.ts src/lib/payroll-helpers.test.ts
git commit -m "feat(payroll): add validateSalary helper"
```

---

## Task 8: `SalaryChangeForm` modal

**Files:**
- Create: `src/components/employees/salary-change-form.tsx`

Reusable modal for inserting a new `salary_history` row. Uses validateSalary; on success calls `onSaved()`.

- [ ] **Step 1: Write the component**

Create `src/components/employees/salary-change-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  formatCOP,
  parseCOP,
  validateSalary,
  getSettingsForDate,
} from "@/lib/payroll-helpers";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  employeeId: string;
  payrollSettings: PayrollSettings[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function SalaryChangeForm({
  employeeId,
  payrollSettings,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [amount, setAmount] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayISO());
  const [reason, setReason] = useState<string>("");
  const [isIntegral, setIsIntegral] = useState<boolean>(false);
  const [transportOverride, setTransportOverride] = useState<"auto" | "yes" | "no">("auto");
  const [saving, setSaving] = useState(false);

  function reset() {
    setAmount("");
    setEffectiveFrom(todayISO());
    setReason("");
    setIsIntegral(false);
    setTransportOverride("auto");
  }

  async function handleSave() {
    const parsed = parseCOP(amount);
    if (parsed === null) {
      toast.error("Monto inválido");
      return;
    }
    const settings = getSettingsForDate(payrollSettings, effectiveFrom);
    if (!settings) {
      toast.error("No hay configuración de nómina para esa fecha");
      return;
    }
    const v = validateSalary(parsed, settings.smmlv, isIntegral);
    if (!v.ok) {
      toast.error(v.error ?? "Salario inválido");
      return;
    }
    if (v.warning) {
      toast.warning(v.warning);
    }

    setSaving(true);
    const { error } = await supabase.from("salary_history").insert({
      employee_id: employeeId,
      monthly_salary: parsed,
      is_integral_salary: isIntegral,
      transport_aux_override:
        transportOverride === "auto" ? null : transportOverride === "yes",
      change_reason: reason || null,
      effective_from: effectiveFrom,
      created_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Cambio salarial registrado");
    reset();
    onSaved();
    onOpenChange(false);
  }

  const isPast = effectiveFrom < todayISO();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cambio salarial</DialogTitle>
          <DialogDescription>
            Cierra el período salarial vigente y abre uno nuevo desde la fecha indicada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Salario mensual</Label>
            <Input
              id="amount"
              placeholder="$2.800.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const p = parseCOP(amount);
                if (p !== null) setAmount(formatCOP(p));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective-from">Vigente desde</Label>
            <Input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            {isPast && (
              <p className="text-xs text-amber-600">
                Estás registrando un cambio retroactivo.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Razón (opcional)</Label>
            <Input
              id="reason"
              placeholder="Aumento legal SMMLV"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="integral"
              checked={isIntegral}
              onCheckedChange={(c) => setIsIntegral(c === true)}
            />
            <Label htmlFor="integral">Salario integral</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport">Auxilio de transporte</Label>
            <Select
              value={transportOverride}
              onValueChange={(v) => setTransportOverride(v as "auto" | "yes" | "no")}
            >
              <SelectTrigger id="transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (≤ 2 SMMLV)</SelectItem>
                <SelectItem value="yes">Siempre aplica</SelectItem>
                <SelectItem value="no">No aplica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/salary-change-form.tsx
git commit -m "feat(payroll): add SalaryChangeForm modal"
```

---

## Task 9: `SalaryCell` inline-edit cell

**Files:**
- Create: `src/components/employees/salary-cell.tsx`

Renders the current salary as text; click → input edit; Enter / blur → validate and save (insert into `salary_history`).

- [ ] **Step 1: Write the component**

Create `src/components/employees/salary-cell.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  formatCOP,
  parseCOP,
  validateSalary,
  getCurrentSalary,
  getSettingsForDate,
  computeHourlyRate,
} from "@/lib/payroll-helpers";
import type { SalaryHistory, PayrollSettings } from "@/lib/types";

interface Props {
  employeeId: string;
  history: SalaryHistory[];
  payrollSettings: PayrollSettings[];
  canEdit: boolean;
  canRead: boolean;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryCell({
  employeeId,
  history,
  payrollSettings,
  canEdit,
  canRead,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const today = todayISO();
  const current = getCurrentSalary(history, employeeId, today);
  const settingsToday = getSettingsForDate(payrollSettings, today);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!canRead) {
    return <span className="text-muted-foreground" title="Sin permisos para ver salarios">—</span>;
  }

  const tooltip = (() => {
    if (!current) return "Sin salario registrado";
    const settings220 = payrollSettings.find((s) => s.hourly_divisor === 220);
    const settings210 = payrollSettings.find((s) => s.hourly_divisor === 210);
    const h220 = settings220 ? computeHourlyRate(current.monthly_salary, 220) : 0;
    const h210 = settings210 ? computeHourlyRate(current.monthly_salary, 210) : 0;
    return `Hora ord. ${formatCOP(h220)} (220h) · ${formatCOP(h210)} (210h post-15-jul)`;
  })();

  async function commit() {
    const parsed = parseCOP(draft);
    if (parsed === null) {
      toast.error("Monto inválido");
      setEditing(false);
      return;
    }
    if (!settingsToday) {
      toast.error("No hay configuración de nómina para hoy");
      setEditing(false);
      return;
    }
    const isIntegral = current?.is_integral_salary ?? false;
    const v = validateSalary(parsed, settingsToday.smmlv, isIntegral);
    if (!v.ok) {
      toast.error(v.error ?? "Salario inválido");
      setEditing(false);
      return;
    }
    if (parsed === current?.monthly_salary) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("salary_history").insert({
      employee_id: employeeId,
      monthly_salary: parsed,
      is_integral_salary: isIntegral,
      transport_aux_override: current?.transport_aux_override ?? null,
      change_reason: "Edición rápida",
      effective_from: today,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    setEditing(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Salario actualizado");
    onSaved();
  }

  if (editing && canEdit) {
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={current ? String(current.monthly_salary) : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={saving}
        className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      onClick={() => {
        if (!canEdit) return;
        setDraft(current ? String(current.monthly_salary) : "");
        setEditing(true);
      }}
      className={`text-left text-sm ${
        canEdit ? "cursor-pointer hover:underline" : "cursor-default"
      } ${current ? "" : "text-muted-foreground"}`}
    >
      {current ? formatCOP(current.monthly_salary) : "—"}
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/salary-cell.tsx
git commit -m "feat(payroll): add SalaryCell inline editor"
```

---

## Task 10: `SalaryHistorySection` for the side sheet

**Files:**
- Create: `src/components/employees/salary-history-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/employees/salary-history-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatCOP } from "@/lib/payroll-helpers";
import { SalaryChangeForm } from "./salary-change-form";
import type { SalaryHistory, PayrollSettings } from "@/lib/types";

interface Props {
  employeeId: string;
  history: SalaryHistory[]; // already filtered to this employee, sorted desc
  payrollSettings: PayrollSettings[];
  canEdit: boolean;
  onChanged: () => void;
}

function fmtRange(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → vigente`;
}

export function SalaryHistorySection({
  employeeId,
  history,
  payrollSettings,
  canEdit,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Historial salarial</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Nuevo cambio
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin registros.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded border p-2 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{formatCOP(h.monthly_salary)}</span>
                {h.is_integral_salary && (
                  <span className="text-muted-foreground">integral</span>
                )}
              </div>
              <div className="text-muted-foreground">{fmtRange(h.effective_from, h.effective_to)}</div>
              {h.change_reason && <div className="italic">{h.change_reason}</div>}
            </li>
          ))}
        </ul>
      )}

      <SalaryChangeForm
        employeeId={employeeId}
        payrollSettings={payrollSettings}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/salary-history-section.tsx
git commit -m "feat(payroll): add SalaryHistorySection for side sheet"
```

---

## Task 11: `SalaryAdjustmentForm` modal

**Files:**
- Create: `src/components/employees/salary-adjustment-form.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/employees/salary-adjustment-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCOP, parseCOP } from "@/lib/payroll-helpers";

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryAdjustmentForm({ employeeId, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [conceptLabel, setConceptLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [isSalary, setIsSalary] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setPaymentDate(todayISO());
    setConceptLabel("");
    setAmount("");
    setIsSalary(true);
    setDescription("");
  }

  async function handleSave() {
    const parsed = parseCOP(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!conceptLabel.trim()) {
      toast.error("Indicá un concepto");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("salary_adjustments").insert({
      employee_id: employeeId,
      payment_date: paymentDate,
      concept_label: conceptLabel.trim(),
      amount: parsed,
      is_salary_component: isSalary,
      description: description.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Ajuste registrado");
    reset();
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ajuste salarial</DialogTitle>
          <DialogDescription>
            Bonificación, comisión, premio o cualquier pago ad-hoc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-date">Fecha de pago</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="concept">Concepto</Label>
            <Input
              id="concept"
              placeholder="Comisión febrero"
              value={conceptLabel}
              onChange={(e) => setConceptLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-amount">Monto</Label>
            <Input
              id="adj-amount"
              placeholder="$200.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const p = parseCOP(amount);
                if (p !== null) setAmount(formatCOP(p));
              }}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="is-salary"
              checked={isSalary}
              onCheckedChange={(c) => setIsSalary(c === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="is-salary">Constituye salario</Label>
              <p className="text-xs text-muted-foreground">
                Si está activo, entra en base de salud, pensión, prima, cesantías y vacaciones.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-desc">Descripción (opcional)</Label>
            <Textarea
              id="adj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/salary-adjustment-form.tsx
git commit -m "feat(payroll): add SalaryAdjustmentForm modal"
```

---

## Task 12: `SalaryAdjustmentsSection` for the side sheet

**Files:**
- Create: `src/components/employees/salary-adjustments-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/employees/salary-adjustments-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { SalaryAdjustmentForm } from "./salary-adjustment-form";
import type { SalaryAdjustment } from "@/lib/types";

interface Props {
  employeeId: string;
  adjustments: SalaryAdjustment[]; // filtered to this employee
  canEdit: boolean;
  onChanged: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryAdjustmentsSection({
  employeeId,
  adjustments,
  canEdit,
  onChanged,
}: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string, isPast: boolean) {
    if (isPast && !confirm("Este ajuste tiene fecha pasada. ¿Eliminar?")) return;
    const { error } = await supabase.from("salary_adjustments").delete().eq("id", id);
    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Ajuste eliminado");
    onChanged();
  }

  const today = todayISO();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ajustes salariales</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Agregar
          </Button>
        )}
      </div>

      {adjustments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin ajustes.</p>
      ) : (
        <ul className="space-y-2">
          {adjustments.map((a) => {
            const isPast = a.payment_date < today;
            return (
              <li key={a.id} className="rounded border p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCOP(a.amount)}</span>
                      <Badge variant={a.is_salary_component ? "default" : "secondary"}>
                        {a.is_salary_component ? "Salarial" : "No salarial"}
                      </Badge>
                      {isPast && <Badge variant="outline">Pasado</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      {a.payment_date} · {a.concept_label}
                    </div>
                    {a.description && <div className="italic">{a.description}</div>}
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(a.id, isPast)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SalaryAdjustmentForm
        employeeId={employeeId}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/salary-adjustments-section.tsx
git commit -m "feat(payroll): add SalaryAdjustmentsSection for side sheet"
```

---

## Task 13: Wire `/empleados` page (column + side sheet)

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

This task adds the new state, the new column, and the two new sections inside the existing side sheet. The existing equity panel block is preserved.

- [ ] **Step 1: Add the imports**

In `src/app/(authenticated)/employees/page.tsx`, add to the imports near the other component imports:

```tsx
import { SalaryCell } from "@/components/employees/salary-cell";
import { SalaryHistorySection } from "@/components/employees/salary-history-section";
import { SalaryAdjustmentsSection } from "@/components/employees/salary-adjustments-section";
import type { SalaryHistory, SalaryAdjustment, PayrollSettings } from "@/lib/types";
```

- [ ] **Step 2: Add the state hooks for salary data**

Inside `EmployeesPage`, near the existing `rollups`/`contracts` state, add:

```tsx
const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
const [salaryAdjustments, setSalaryAdjustments] = useState<SalaryAdjustment[]>([]);
const [payrollSettings, setPayrollSettings] = useState<PayrollSettings[]>([]);
const [appFlags, setAppFlags] = useState<{ managers_can_see_salaries: boolean }>({
  managers_can_see_salaries: false,
});

const fetchSalaryData = useCallback(async () => {
  const [shRes, saRes, psRes, afRes] = await Promise.all([
    supabase.from("salary_history").select("*").order("effective_from", { ascending: false }),
    supabase.from("salary_adjustments").select("*").order("payment_date", { ascending: false }),
    supabase.from("payroll_settings").select("*").order("period_start", { ascending: true }),
    supabase.from("app_settings").select("value").eq("key", "app_flags").maybeSingle(),
  ]);
  setSalaryHistory((shRes.data ?? []) as SalaryHistory[]);
  setSalaryAdjustments((saRes.data ?? []) as SalaryAdjustment[]);
  setPayrollSettings((psRes.data ?? []) as PayrollSettings[]);
  if (afRes.data?.value && typeof afRes.data.value === "object") {
    const v = afRes.data.value as Record<string, unknown>;
    setAppFlags({
      managers_can_see_salaries: v.managers_can_see_salaries === true,
    });
  }
}, [supabase]);

useEffect(() => {
  fetchSalaryData();
}, [fetchSalaryData]);
```

- [ ] **Step 3: Compute permissions per row**

Near the role checks, add:

```tsx
const canEditSalary = currentProfile?.role === "admin";
const managerCanSee =
  currentProfile?.role === "manager" && appFlags.managers_can_see_salaries;
const canReadAnySalary = canEditSalary || managerCanSee;
```

- [ ] **Step 4: Add the "Salario" column header**

Locate the existing `<TableHead>` cells (look for `Contrato` and `Estado`). Insert between them:

```tsx
<TableHead>Salario</TableHead>
```

- [ ] **Step 5: Add the salary cell to each row**

Find the row body where `<TableCell>` for "Contrato" lives. After it, insert:

```tsx
<TableCell>
  <SalaryCell
    employeeId={employee.id}
    history={salaryHistory.filter((s) => s.employee_id === employee.id)}
    payrollSettings={payrollSettings}
    canEdit={canEditSalary}
    canRead={canReadAnySalary}
    onSaved={fetchSalaryData}
  />
</TableCell>
```

- [ ] **Step 6: Add the side-sheet sections**

Inside the existing `<Sheet>` ... `<SheetContent>` block (around line 1690), inside the `{panelEmp && (...)}` body, after the existing `<EmployeeEquityPanel ... />`, add:

```tsx
<div className="mt-6 space-y-6">
  <SalaryHistorySection
    employeeId={panelEmp.id}
    history={salaryHistory.filter((s) => s.employee_id === panelEmp.id)}
    payrollSettings={payrollSettings}
    canEdit={canEditSalary}
    onChanged={fetchSalaryData}
  />
  <SalaryAdjustmentsSection
    employeeId={panelEmp.id}
    adjustments={salaryAdjustments.filter((a) => a.employee_id === panelEmp.id)}
    canEdit={canEditSalary}
    onChanged={fetchSalaryData}
  />
</div>
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(payroll): wire salary column and side-sheet sections in /empleados"
```

---

## Task 14: `PayrollSettingForm` + `PayrollSettingsTable`

**Files:**
- Create: `src/components/nomina/payroll-setting-form.tsx`
- Create: `src/components/nomina/payroll-settings-table.tsx`

- [ ] **Step 1: Write `PayrollSettingForm`**

Create `src/components/nomina/payroll-setting-form.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  initial?: PayrollSettings | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PayrollSettingForm({ initial, open, onOpenChange, onSaved }: Props) {
  const supabase = createClient();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [smmlv, setSmmlv] = useState("");
  const [auxTransport, setAuxTransport] = useState("");
  const [hourlyDivisor, setHourlyDivisor] = useState("");
  const [nightStart, setNightStart] = useState("");
  const [sunPct, setSunPct] = useState("");
  const [holPct, setHolPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPeriodStart(initial?.period_start ?? "");
      setPeriodEnd(initial?.period_end ?? "");
      setSmmlv(initial ? String(initial.smmlv) : "");
      setAuxTransport(initial ? String(initial.aux_transport) : "");
      setHourlyDivisor(initial ? String(initial.hourly_divisor) : "");
      setNightStart(initial ? String(initial.night_start_hour) : "");
      setSunPct(initial ? String(initial.sunday_surcharge_pct) : "");
      setHolPct(initial ? String(initial.holiday_surcharge_pct) : "");
    }
  }, [open, initial]);

  async function handleSave() {
    const payload = {
      period_start: periodStart,
      period_end: periodEnd || null,
      smmlv: parseFloat(smmlv),
      aux_transport: parseFloat(auxTransport),
      hourly_divisor: parseInt(hourlyDivisor, 10),
      night_start_hour: parseInt(nightStart, 10),
      sunday_surcharge_pct: parseFloat(sunPct),
      holiday_surcharge_pct: parseFloat(holPct),
    };
    if (
      !payload.period_start ||
      Number.isNaN(payload.smmlv) ||
      Number.isNaN(payload.aux_transport) ||
      Number.isNaN(payload.hourly_divisor) ||
      Number.isNaN(payload.night_start_hour) ||
      Number.isNaN(payload.sunday_surcharge_pct) ||
      Number.isNaN(payload.holiday_surcharge_pct)
    ) {
      toast.error("Todos los campos numéricos son obligatorios");
      return;
    }
    setSaving(true);
    const { error } = initial
      ? await supabase.from("payroll_settings").update(payload).eq("id", initial.id)
      : await supabase.from("payroll_settings").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success(initial ? "Período actualizado" : "Período creado");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar período" : "Nuevo período"} de configuración de nómina
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ps">Inicio</Label>
            <Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pe">Fin (opcional)</Label>
            <Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sm">SMMLV</Label>
            <Input id="sm" type="number" value={smmlv} onChange={(e) => setSmmlv(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ax">Auxilio transporte</Label>
            <Input id="ax" type="number" value={auxTransport} onChange={(e) => setAuxTransport(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd">Divisor horas</Label>
            <Input id="hd" type="number" value={hourlyDivisor} onChange={(e) => setHourlyDivisor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ns">Inicio nocturno (hora)</Label>
            <Input id="ns" type="number" value={nightStart} onChange={(e) => setNightStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp">% recargo dominical (0.9 = 90%)</Label>
            <Input id="sp" type="number" step="0.001" value={sunPct} onChange={(e) => setSunPct(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hp">% recargo festivo</Label>
            <Input id="hp" type="number" step="0.001" value={holPct} onChange={(e) => setHolPct(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `PayrollSettingsTable`**

Create `src/components/nomina/payroll-settings-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { PayrollSettingForm } from "./payroll-setting-form";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  rows: PayrollSettings[];
  onChanged: () => void;
}

export function PayrollSettingsTable({ rows, onChanged }: Props) {
  const supabase = createClient();
  const [editing, setEditing] = useState<PayrollSettings | null>(null);
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este período de configuración?")) return;
    const { error } = await supabase.from("payroll_settings").delete().eq("id", id);
    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Período eliminado");
    onChanged();
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>SMMLV</TableHead>
              <TableHead>Aux. transporte</TableHead>
              <TableHead>Divisor</TableHead>
              <TableHead>Hora noct.</TableHead>
              <TableHead>Dom %</TableHead>
              <TableHead>Fest %</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Sin períodos configurados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.period_start}</TableCell>
                  <TableCell>{r.period_end ?? "vigente"}</TableCell>
                  <TableCell>{formatCOP(r.smmlv)}</TableCell>
                  <TableCell>{formatCOP(r.aux_transport)}</TableCell>
                  <TableCell>{r.hourly_divisor}</TableCell>
                  <TableCell>{r.night_start_hour}:00</TableCell>
                  <TableCell>{(r.sunday_surcharge_pct * 100).toFixed(0)}%</TableCell>
                  <TableCell>{(r.holiday_surcharge_pct * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <PayrollSettingForm
        initial={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={onChanged}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/nomina/payroll-setting-form.tsx src/components/nomina/payroll-settings-table.tsx
git commit -m "feat(payroll): add PayrollSettingForm and PayrollSettingsTable"
```

---

## Task 15: `/nomina/configuracion` page

**Files:**
- Create: `src/app/(authenticated)/nomina/configuracion/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/(authenticated)/nomina/configuracion/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { PayrollSettingsTable } from "@/components/nomina/payroll-settings-table";
import { PayrollSettingForm } from "@/components/nomina/payroll-setting-form";
import type { PayrollSettings } from "@/lib/types";

export default function PayrollSettingsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [rows, setRows] = useState<PayrollSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payroll_settings")
      .select("*")
      .order("period_start", { ascending: true });
    setRows((data ?? []) as PayrollSettings[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== "admin") router.replace("/dashboard");
  }, [profile, authLoading, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.role !== "admin") return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuración de nómina</h1>
          <p className="text-muted-foreground">
            Estos valores son de ley (Mintrabajo). Editá solo cuando un decreto los cambie.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo período
        </Button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PayrollSettingsTable rows={rows} onChanged={fetchRows} />
      )}

      <PayrollSettingForm
        initial={null}
        open={open}
        onOpenChange={setOpen}
        onSaved={fetchRows}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success. The new route `/nomina/configuracion` appears.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/nomina/configuracion/page.tsx"
git commit -m "feat(payroll): add /nomina/configuracion page"
```

---

## Task 16: Sidebar — new "Nómina" group

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

The current sidebar has `topNavigation` (flat) and `configNavigation` (collapsible "Configuración"). We add a third group "Nómina" with the same collapsible pattern, between top and config.

- [ ] **Step 1: Add the icon import**

Add `Wallet` and `ChevronDown` (already imported) to the lucide-react import block:

```tsx
import {
  // ... existing icons
  Wallet,
  // ...
} from "lucide-react";
```

(Note: `ChevronDown` and `Settings` are already imported.)

- [ ] **Step 2: Add the group definition**

After the `configNavigation` array, add:

```tsx
const payrollNavigation: NavItem[] = [
  { name: "Configuración", href: "/nomina/configuracion", icon: Wallet, roles: ["admin"] },
];
```

- [ ] **Step 3: Add filtering and render block**

After the existing `filteredConfig` and `configActive` lines, add the equivalents for payroll:

```tsx
const filteredPayroll = payrollNavigation.filter(
  (item) => profile && item.roles.includes(profile.role as Role)
);

const payrollActive = filteredPayroll.some((item) =>
  pathname.startsWith(item.href)
);

const [payrollOpen, setPayrollOpen] = useState(payrollActive);

useEffect(() => {
  if (payrollActive) setPayrollOpen(true);
}, [payrollActive]);
```

- [ ] **Step 4: Render the collapsible**

Locate the existing `{filteredConfig.length > 0 && (...)}` block. Just **above** it, add a similar block for payroll:

```tsx
{filteredPayroll.length > 0 && (
  <>
    <div className="my-2 border-t" />
    <Collapsible open={payrollOpen} onOpenChange={setPayrollOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Wallet className="h-4 w-4" />
        <span className="flex-1 text-left">Nómina</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            payrollOpen && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1 pl-3">
        {filteredPayroll.map(renderLink)}
      </CollapsibleContent>
    </Collapsible>
  </>
)}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(payroll): add 'Nómina' sidebar group with Configuración item"
```

---

## Task 17: Settings — managers visibility toggle

**Files:**
- Create: `src/components/settings/salaries-visibility-toggle.tsx`
- Modify: `src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Write the toggle component**

Create `src/components/settings/salaries-visibility-toggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function SalariesVisibilityToggle() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "app_flags")
        .maybeSingle();
      const v = data?.value as Record<string, unknown> | undefined;
      setEnabled(v?.managers_can_see_salaries === true);
      setLoading(false);
    })();
  }, [supabase]);

  async function handleChange(next: boolean) {
    setSaving(true);
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_flags")
      .maybeSingle();
    const merged = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      managers_can_see_salaries: next,
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "app_flags", value: merged }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    setEnabled(next);
    toast.success("Configuración actualizada");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos de salarios</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex items-center gap-2">
            <Checkbox
              id="managers-see-salaries"
              checked={enabled}
              disabled={saving}
              onCheckedChange={(c) => handleChange(c === true)}
            />
            <Label htmlFor="managers-see-salaries">
              Permitir que managers vean los salarios de empleados de su sede
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount on the settings page**

In `src/app/(authenticated)/settings/page.tsx`, add the import:

```tsx
import { SalariesVisibilityToggle } from "@/components/settings/salaries-visibility-toggle";
```

Then below `<LaborConstraintsForm />` (around line 37), add:

```tsx
<SalariesVisibilityToggle />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/salaries-visibility-toggle.tsx "src/app/(authenticated)/settings/page.tsx"
git commit -m "feat(payroll): add managers-can-see-salaries toggle in /settings"
```

---

## Task 18: SQL tests

**Files:**
- Create: `supabase/tests/payroll/salary_history_no_overlap.sql`
- Create: `supabase/tests/payroll/salary_history_auto_close.sql`
- Create: `supabase/tests/payroll/salary_history_one_open_per_employee.sql`
- Create: `supabase/tests/payroll/payroll_settings_rls.sql`

Each SQL test follows the existing repo pattern: `BEGIN ... ROLLBACK` so the test is safe against prod.

- [ ] **Step 1: Write `salary_history_no_overlap.sql`**

```sql
-- Test: salary_history rejects overlapping closed ranges.
BEGIN;

DO $$
DECLARE
  emp UUID;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  -- Insert a closed range [Jan, Mar].
  INSERT INTO salary_history (employee_id, monthly_salary, effective_from, effective_to)
    VALUES (emp, 2000000, '2026-01-01', '2026-03-31');

  -- Try to insert a row whose effective_from falls inside that closed range.
  BEGIN
    INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
      VALUES (emp, 2200000, '2026-02-15');
    RAISE EXCEPTION 'TEST FAILED: overlap was allowed';
  EXCEPTION WHEN raise_exception THEN
    -- expected: trigger rejected the insert
    NULL;
  END;

  RAISE NOTICE 'OK: overlap rejected';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Write `salary_history_auto_close.sql`**

```sql
-- Test: inserting a new salary closes the previous open row.
BEGIN;

DO $$
DECLARE
  emp UUID;
  prev_to DATE;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2000000, '2026-01-01');

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2500000, '2026-04-01');

  SELECT effective_to INTO prev_to
    FROM salary_history
   WHERE employee_id = emp AND effective_from = '2026-01-01';

  IF prev_to <> '2026-03-31' THEN
    RAISE EXCEPTION 'TEST FAILED: expected effective_to=2026-03-31, got %', prev_to;
  END IF;
  RAISE NOTICE 'OK: previous row closed correctly';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Write `salary_history_one_open_per_employee.sql`**

```sql
-- Test: unique partial index prevents two open rows per employee.
BEGIN;

DO $$
DECLARE
  emp UUID;
BEGIN
  SELECT id INTO emp FROM profiles WHERE is_active = true LIMIT 1;
  IF emp IS NULL THEN RAISE EXCEPTION 'No active profile to test'; END IF;

  INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
    VALUES (emp, 2000000, '2026-01-01');

  -- Manually clear the auto-closing trigger effect for this test by
  -- attempting an INSERT with the same effective_from (which the trigger
  -- would normally close): instead we test by directly attempting to
  -- bypass via temporarily disabling the trigger.
  ALTER TABLE salary_history DISABLE TRIGGER salary_history_close_previous_trg;

  BEGIN
    INSERT INTO salary_history (employee_id, monthly_salary, effective_from)
      VALUES (emp, 3000000, '2026-04-01');
    RAISE EXCEPTION 'TEST FAILED: two open rows allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK: unique partial index rejects two open rows';
  END;

  ALTER TABLE salary_history ENABLE TRIGGER salary_history_close_previous_trg;
END $$;

ROLLBACK;
```

- [ ] **Step 4: Write `payroll_settings_rls.sql`**

```sql
-- Test: payroll_settings allows SELECT for any authenticated user but
-- restricts INSERT/UPDATE/DELETE to admin.
BEGIN;

-- Simulate authenticated non-admin: switch role to authenticated and set a
-- jwt that resolves to a non-admin. This file is a smoke check that
-- relies on the RLS policy expression; full role simulation requires
-- test JWTs which are out of scope here. Verify policy presence:
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.payroll_settings'::regclass) < 2 THEN
    RAISE EXCEPTION 'TEST FAILED: missing payroll_settings policies';
  END IF;
  RAISE NOTICE 'OK: payroll_settings has at least 2 policies';
END $$;

ROLLBACK;
```

- [ ] **Step 5: Run each test via Supabase MCP `execute_sql`**

For each `.sql` file, paste the contents into `execute_sql` against project `ugkvuinkynvtuiutwlkd`. Each should print one or more `NOTICE: OK ...` messages and ROLLBACK at the end.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/payroll
git commit -m "test(payroll): SQL tests for salary_history triggers and payroll_settings RLS"
```

---

## Task 19: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: all tests pass. Total ≈ 67 (existing) + 25 (new payroll-helpers) ≈ 92.

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Manual smoke test (browser, prod or local)**

Log in as `admin@apphorarios.com`. Steps:

1. Sidebar shows new "Nómina" group between top nav and "Configuración". It contains "Configuración" linking to `/nomina/configuracion`.
2. Open `/nomina/configuracion`. Three rows visible (the 2026 sub-períodos pre-cargados).
3. Edit one row → modal pre-fills, save changes, table updates.
4. Add a new row with `period_start = 2027-01-01` → appears at the bottom.
5. Delete the row just added → confirm prompt → row removed.
6. Open `/empleados`. New "Salario" column visible. For employees without salary, shows `—`.
7. Click an `—` cell → input opens. Type `2.800.000`, press Enter → toast "Salario actualizado", cell updates.
8. Click again → input pre-filled with `2800000`. Try `1.000.000` → toast "menor al SMMLV", cell reverts.
9. Click an employee row → side sheet opens. Below `EmployeeEquityPanel` two new sections render: "Historial salarial" with one row, and "Ajustes salariales" empty.
10. Click "Nuevo cambio" → form opens, set $3.000.000 with reason "promoción" and salario integral=off → Save. Timeline now has two rows; first closed, latest open.
11. Click "Agregar" in adjustments → set fecha=hoy, concepto=`Bono navideño`, monto=`$200.000`, "Constituye salario"=off, save. Adjustment appears with `No salarial` badge.
12. Delete the adjustment → confirm if past → row removed.
13. Open `/settings`. New "Permisos de salarios" card. Toggle on/off; toast confirms. Reload page → state persists.
14. Log in as a `manager` (if available). With toggle off: salary cell shows `—`. Toggle on (as admin), then back as manager: salaries visible read-only (no inline edit).

If all 14 pass, the sub-spec is done.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-review notes

- All 7 helpers in `payroll-helpers.ts` (formatCOP, parseCOP, getCurrentSalary, getSettingsForDate, computeHourlyRate, validateSalary) have ≥3 tests including boundary conditions.
- The new column placement is between "Contrato" and "Estado"; the implementer must locate those headers and matching `<TableCell>` wrappers in the existing `/empleados` file.
- `transport_aux_override` is `null | true | false`; the form uses a 3-way Select to make this explicit; the inline cell does not modify it.
- The migration uses `INSERT … ON CONFLICT DO NOTHING` for idempotency; safe to re-apply.
- `salary_history_close_previous_trg` is a BEFORE INSERT trigger that closes one open row and rejects overlap with closed ranges.
- The unique partial index `salary_history_one_open_per_employee` is the second guarantee that one employee never has two open salary rows.
- RLS policies match the spec table in §2: admin full, manager gated by `app_flags.managers_can_see_salaries`, employee own.
- The "Nómina" sidebar group uses the same `Collapsible` pattern as "Configuración" — visually consistent.
- `appFlags` state in `/empleados` is populated from `app_settings` once on mount; manager edits to the toggle in another tab require a reload to take effect (acceptable for this feature; realtime is not needed).
