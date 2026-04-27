# Payroll Sub-spec 3 (Colilla del Empleado + Advance/Settlement Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the employee-facing payroll views described in `docs/superpowers/specs/2026-04-26-payroll-employee-colilla-design.md`. Adds `/mi-pago`, `/mi-pago/historial`, `/mi-pago/glosario` routes; a dashboard card; D3 Sankey + mobile breakdown list + provisiones section + detail accordion + tooltips + glossary+FAQ; PDF export; in-app realtime notification on period approval; and the advance/settlement mode for quincenal companies.

**Architecture:** One Postgres migration (030) adds `is_advance` to `payroll_periods`, the `payment_mode` flag, the realtime publication, and a notification trigger. The pure engine in `src/lib/payroll-engine.ts` is extended with branching logic for Q1 advance vs Q2 settlement, with strict TDD around the new behavior. The builder reads `payment_mode` and orchestrates Q2 lookups of the same-month Q1 advance for subtraction. Frontend: 3 new routes + 1 dashboard card + 7 components, all reusing existing shadcn/ui patterns. The hook `useMyPayroll` follows the auth-gated realtime pattern from `useEquityRollups`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind v3, shadcn/ui, Supabase (Postgres + RLS + realtime), Vitest for pure logic, `d3-sankey` (~30KB) + `jspdf` + `jspdf-autotable` (already in repo).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/030_payroll_employee_realtime_notifs.sql` | create | `is_advance` column, payment_mode flag, realtime publication, approval notif trigger |
| `src/lib/types.ts` | modify | +`PaymentMode` type, `PayrollPeriod.is_advance` field |
| `src/lib/payroll-engine.ts` | modify | branch into advance/settlement |
| `src/lib/payroll-engine.test.ts` | modify | 6 new tests for advance/settlement logic |
| `src/lib/payroll-period-builder.ts` | modify | read payment_mode, lookup Q1 for Q2 settlement |
| `src/lib/payroll-employee-helpers.ts` | create | 4 pure helpers |
| `src/lib/payroll-employee-helpers.test.ts` | create | TDD tests |
| `src/lib/payroll-pdf.ts` | create | jspdf builder for the colilla |
| `src/hooks/use-my-payroll.ts` | create | auth-gated fetch+realtime |
| `src/components/dashboard/payroll-card.tsx` | create | dashboard card |
| `src/components/dashboard/employee-dashboard.tsx` | modify | mount `<PayrollCard />` |
| `src/components/mi-pago/payroll-header.tsx` | create | period selector + KPI |
| `src/components/mi-pago/payroll-sankey.tsx` | create | desktop d3 visual |
| `src/components/mi-pago/payroll-breakdown-list.tsx` | create | mobile alt + accessibility |
| `src/components/mi-pago/payroll-provisions-section.tsx` | create | provisiones + tooltips |
| `src/components/mi-pago/payroll-detail-accordion.tsx` | create | full breakdown |
| `src/components/mi-pago/concept-tooltip.tsx` | create | popover |
| `src/app/(authenticated)/mi-pago/page.tsx` | create | period detail orchestrator |
| `src/app/(authenticated)/mi-pago/historial/page.tsx` | create | year summary + bar chart + table |
| `src/app/(authenticated)/mi-pago/glosario/page.tsx` | create | concepts + FAQ |
| `src/components/settings/payment-frequency-selector.tsx` | modify | reveal payment_mode select when frequency=quincenal |
| `package.json` | modify | add `d3-sankey` + `@types/d3-sankey` |

---

## Convention reminders

- **Spanish UI**, normalized accents.
- **No emojis** in source files; lucide icons.
- All client data access via `createClient()` from `@/lib/supabase/client`.
- Use `useAuth()` for current profile/role.
- Money is `numeric(12,2)` in DB and `number` in JS.
- Run `npm run test` and `npm run build` before each commit.
- Follow existing migration style (Supabase MCP `apply_migration` for prod, also write SQL to `supabase/migrations/030_*.sql` to keep local in sync).
- Reuse helpers from sub-specs 1+2: `formatCOP`, `parseCOP`, `getCurrentSalary`, `getSettingsForDate`, `computeHourlyRate`, all the engine helpers (`isIncomeForConcept`, `getSolidarityRate`, `getArlRate`, `applyDayProration`, etc.).
- The engine in `payroll-engine.ts` must remain PURE — no Supabase calls. The builder is the orchestrator that fetches and feeds it.

---

## Task 1: Migration 030

**Files:**
- Create: `supabase/migrations/030_payroll_employee_realtime_notifs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 030: Payroll employee colilla — realtime + notifications + advance flag + payment_mode.

-- 1. Mark Q1 advance periods (model B).
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS is_advance BOOLEAN NOT NULL DEFAULT false;

-- 2. Realtime: subscribe to payroll_periods status changes.
ALTER PUBLICATION supabase_realtime ADD TABLE payroll_periods;
ALTER TABLE payroll_periods REPLICA IDENTITY FULL;

-- 3. Notification trigger on approval.
CREATE OR REPLACE FUNCTION notify_employees_on_period_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  emp_id UUID;
  month_label TEXT;
BEGIN
  IF NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  month_label := to_char(NEW.period_start, 'TMMonth YYYY');

  FOR emp_id IN
    SELECT DISTINCT employee_id FROM payroll_entries
    WHERE payroll_period_id = NEW.id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      emp_id,
      'general',
      'Tu pago de ' || month_label || ' está disponible',
      'Ya podés ver el detalle de tu liquidación en Mi Pago.',
      '/mi-pago?period=' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_employees_on_period_approval_trg
  AFTER UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION notify_employees_on_period_approval();

-- 4. payment_mode in app_flags (default independent for backwards compat).
UPDATE app_settings
   SET value = jsonb_set(
     COALESCE(value, '{}'::jsonb),
     '{payment_mode}',
     '"independent"'::jsonb,
     true
   )
 WHERE key = 'app_flags';
```

- [ ] **Step 2: Apply via Supabase MCP**

Tool: `apply_migration`. Args: name=`030_payroll_employee_realtime_notifs`, project_id=`ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verify**

Run via `execute_sql`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='payroll_periods' AND column_name='is_advance';
SELECT count(*) FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='payroll_periods';
SELECT (value->>'payment_mode') FROM app_settings WHERE key='app_flags';
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table='payroll_periods'
  AND trigger_name='notify_employees_on_period_approval_trg';
```

Expected: column found, 1 publication row, payment_mode='independent', trigger exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/030_payroll_employee_realtime_notifs.sql
git commit -m "feat(payroll): mig 030 — is_advance, payment_mode, realtime + approval notif"
```

---

## Task 2: Add `PaymentMode` type and `is_advance` field

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update types**

In `src/lib/types.ts`, find the `PayrollPeriod` interface (added in sub-spec 2) and add the field:

```ts
export interface PayrollPeriod {
  // ... existing fields
  is_advance: boolean;
}
```

Append at end of file:

```ts
export type PaymentMode = "independent" | "advance_settlement";
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(payroll): add PaymentMode type and is_advance field"
```

---

## Task 3: Add d3-sankey dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install d3-sankey @types/d3-sankey
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(payroll): add d3-sankey dependency"
```

---

## Task 4: Helper `aggregateEntriesForSankey` (TDD)

**Files:**
- Create: `src/lib/payroll-employee-helpers.ts`
- Create: `src/lib/payroll-employee-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/payroll-employee-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateEntriesForSankey } from "./payroll-employee-helpers";
import type { PayrollEntry } from "./types";

const mkEntry = (
  concept_type: string,
  amount: number,
  is_income: boolean
): PayrollEntry => ({
  id: concept_type,
  payroll_period_id: "p1",
  employee_id: "e1",
  concept_type: concept_type as PayrollEntry["concept_type"],
  is_income,
  base: null,
  rate: null,
  amount,
  description: null,
  is_manual_override: false,
  created_at: "2026-04-01T00:00:00Z",
});

describe("aggregateEntriesForSankey", () => {
  it("standard case: 4 incomes + 2 deductions + neto", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    const r = aggregateEntriesForSankey(entries, 2_825_095);

    // Origins: salary, transport (2 nodes)
    expect(r.nodes.filter((n) => n.category === "origin")).toHaveLength(2);
    // Hub: 1
    expect(r.nodes.filter((n) => n.category === "hub")).toHaveLength(1);
    // Destinations: tu cuenta + salud + pensión (3 nodes)
    expect(r.nodes.filter((n) => n.category === "destination")).toHaveLength(3);
    // Links: 2 origins → hub + 3 hub → destinations = 5
    expect(r.links).toHaveLength(5);
  });

  it("skips $0 entries", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 0, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("solidarity_pension", 0, false),
    ];
    const r = aggregateEntriesForSankey(entries, 2_688_000);
    const labels = r.nodes.map((n) => n.label);
    expect(labels).not.toContain("Auxilio de transporte");
    expect(labels).not.toContain("Solidaridad pensional");
  });

  it("Q1 advance: only salary + transport, no destinations except 'Tu cuenta'", () => {
    const entries = [
      mkEntry("salary", 1_400_000, true),
      mkEntry("transport", 124_548, true),
    ];
    const r = aggregateEntriesForSankey(entries, 1_524_548);
    expect(r.nodes.filter((n) => n.category === "destination"))
      .toHaveLength(1); // Just Tu cuenta
  });

  it("empty entries → empty sankey", () => {
    const r = aggregateEntriesForSankey([], 0);
    expect(r.nodes).toHaveLength(0);
    expect(r.links).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run: `npm run test -- payroll-employee-helpers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/payroll-employee-helpers.ts`:

```ts
import type { PayrollEntry, PayrollProvision, PayrollConceptType } from "./types";

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  category: "origin" | "hub" | "destination";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const CONCEPT_LABELS: Record<PayrollConceptType, string> = {
  salary: "Salario base",
  transport: "Auxilio de transporte",
  surcharge_night: "Recargo nocturno",
  surcharge_sunday: "Recargo dominical",
  surcharge_holiday: "Recargo festivo",
  overtime_day: "Hora extra diurna",
  overtime_night: "Hora extra nocturna",
  bonus_salary: "Bonificación salarial",
  bonus_non_salary: "Bonificación no salarial",
  vacation_pay: "Pago de vacaciones",
  prima: "Prima",
  cesantias_interest: "Intereses cesantías",
  health_employee: "EPS Salud 4%",
  pension_employee: "Pensión 4%",
  solidarity_pension: "Solidaridad pensional",
  income_tax: "Retención en la fuente",
  embargo: "Embargo",
  libranza: "Libranza",
  voluntary_pension: "Pensión voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deducción",
};

export function aggregateEntriesForSankey(
  entries: PayrollEntry[],
  netToBank: number
): SankeyData {
  const incomes = entries.filter((e) => e.is_income && e.amount > 0);
  const deductions = entries.filter((e) => !e.is_income && e.amount > 0);

  if (incomes.length === 0 && deductions.length === 0 && netToBank === 0) {
    return { nodes: [], links: [] };
  }

  const totalDevengado = incomes.reduce((acc, e) => acc + Number(e.amount), 0);

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Origins
  for (const e of incomes) {
    nodes.push({
      id: `origin:${e.concept_type}`,
      label: CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
      value: Number(e.amount),
      category: "origin",
    });
    links.push({
      source: `origin:${e.concept_type}`,
      target: "hub",
      value: Number(e.amount),
    });
  }

  // Hub
  if (incomes.length > 0) {
    nodes.push({
      id: "hub",
      label: "Devengado total",
      value: totalDevengado,
      category: "hub",
    });
  }

  // Destinations
  if (netToBank > 0) {
    nodes.push({
      id: "dest:bank",
      label: "Tu cuenta",
      value: netToBank,
      category: "destination",
    });
    links.push({ source: "hub", target: "dest:bank", value: netToBank });
  }
  for (const d of deductions) {
    nodes.push({
      id: `dest:${d.concept_type}`,
      label: CONCEPT_LABELS[d.concept_type] ?? d.concept_type,
      value: Number(d.amount),
      category: "destination",
    });
    links.push({
      source: "hub",
      target: `dest:${d.concept_type}`,
      value: Number(d.amount),
    });
  }

  return { nodes, links };
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npm run test -- payroll-employee-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-employee-helpers.ts src/lib/payroll-employee-helpers.test.ts
git commit -m "feat(payroll): add aggregateEntriesForSankey helper"
```

---

## Task 5: Helper `computeNetToBank` + `computeYtdSummary` (TDD)

**Files:**
- Modify: `src/lib/payroll-employee-helpers.ts`
- Modify: `src/lib/payroll-employee-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Update import + append:

```ts
import { computeNetToBank, computeYtdSummary } from "./payroll-employee-helpers";
import type { PayrollProvision } from "./types";

describe("computeNetToBank", () => {
  it("devengado − deducciones", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    expect(computeNetToBank(entries)).toBe(2_825_095);
  });

  it("with retención", () => {
    const entries = [
      mkEntry("salary", 5_000_000, true),
      mkEntry("health_employee", 200_000, false),
      mkEntry("pension_employee", 200_000, false),
      mkEntry("income_tax", 100_000, false),
    ];
    expect(computeNetToBank(entries)).toBe(4_500_000);
  });

  it("empty → 0", () => {
    expect(computeNetToBank([])).toBe(0);
  });
});

const mkProvision = (
  concept: PayrollProvision["concept"],
  amount: number,
  ytd: number
): PayrollProvision => ({
  id: concept,
  payroll_period_id: "p1",
  employee_id: "e1",
  concept,
  base: amount,
  rate: 0.0833,
  amount,
  accumulated_ytd: ytd,
  created_at: "2026-04-01T00:00:00Z",
});

describe("computeYtdSummary", () => {
  it("aggregates entries + uses last accumulated_ytd from provisions", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    const provisions = [
      mkProvision("cesantias", 253_990, 1_080_000),
      mkProvision("cesantias_interest", 2_540, 12_500),
      mkProvision("prima", 253_990, 1_080_000),
      mkProvision("vacaciones", 116_760, 469_000),
    ];

    const r = computeYtdSummary(entries, provisions, 2026);
    expect(r.devengado).toBe(3_049_095);
    expect(r.deducciones).toBe(224_000);
    expect(r.neto).toBe(2_825_095);
    expect(r.cesantiasYtd).toBe(1_080_000);
    expect(r.primaYtd).toBe(1_080_000);
    expect(r.vacacionesYtd).toBe(469_000);
    expect(r.cesantiasInterestYtd).toBe(12_500);
  });

  it("empty → all zeros", () => {
    const r = computeYtdSummary([], [], 2026);
    expect(r.devengado).toBe(0);
    expect(r.deducciones).toBe(0);
    expect(r.neto).toBe(0);
    expect(r.cesantiasYtd).toBe(0);
  });
});
```

- [ ] **Step 2: Verify FAIL**

Run: `npm run test -- payroll-employee-helpers`

- [ ] **Step 3: Implement**

Append to `src/lib/payroll-employee-helpers.ts`:

```ts
import type { PayrollProvision } from "./types";

export function computeNetToBank(entries: PayrollEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.is_income) total += Number(e.amount);
    else total -= Number(e.amount);
  }
  return Math.max(0, total);
}

export interface YtdSummary {
  devengado: number;
  deducciones: number;
  neto: number;
  cesantiasYtd: number;
  primaYtd: number;
  vacacionesYtd: number;
  cesantiasInterestYtd: number;
}

export function computeYtdSummary(
  entries: PayrollEntry[],
  provisions: PayrollProvision[],
  year: number
): YtdSummary {
  let devengado = 0;
  let deducciones = 0;
  for (const e of entries) {
    if (e.is_income) devengado += Number(e.amount);
    else deducciones += Number(e.amount);
  }

  const lastByConcept: Record<string, number> = {};
  for (const p of provisions) {
    if (Number(p.accumulated_ytd) >= (lastByConcept[p.concept] ?? 0)) {
      lastByConcept[p.concept] = Number(p.accumulated_ytd);
    }
  }

  return {
    devengado,
    deducciones,
    neto: devengado - deducciones,
    cesantiasYtd: lastByConcept["cesantias"] ?? 0,
    primaYtd: lastByConcept["prima"] ?? 0,
    vacacionesYtd: lastByConcept["vacaciones"] ?? 0,
    cesantiasInterestYtd: lastByConcept["cesantias_interest"] ?? 0,
  };
}
```

- [ ] **Step 4: Verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll-employee-helpers.ts src/lib/payroll-employee-helpers.test.ts
git commit -m "feat(payroll): add computeNetToBank and computeYtdSummary helpers"
```

---

## Task 6: Engine extension — Q1 advance behavior (TDD)

**Files:**
- Modify: `src/lib/payroll-engine.ts`
- Modify: `src/lib/payroll-engine.test.ts`

Refer to spec §4.4 for the exact behavior. The engine accepts a new `paymentMode` field in `input.period`. When the period qualifies as Q1 advance (`paymentMode='advance_settlement'`, `frequency='quincenal'`, day-1-to-15 of month), only stages 1-3 run; stages 4-9 are skipped.

- [ ] **Step 1: Write failing tests**

In `src/lib/payroll-engine.test.ts`, append:

```ts
describe("computePayroll — advance/settlement mode", () => {
  it("Q1 advance emits only salary + transport, no SS deductions", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({ period, monthlySalary: 2_800_000 });
    const out = computePayroll(input);

    const concepts = out.entries.map((e) => e.concept_type).sort();
    expect(concepts).toEqual(["salary", "transport"]);
    expect(out.provisions).toHaveLength(0);
    expect(out.employer_cost.total).toBe(0);
    expect(out.warnings).toContain(
      "Anticipo de Q1 — la liquidación completa llega en la segunda quincena"
    );
  });

  it("Q1 advance with hire mid-Q1: prorrateo correcto", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 3_000_000,
      hireDate: "2026-04-08",  // 8 days worked in Q1
    });
    const out = computePayroll(input);
    const salary = out.entries.find((e) => e.concept_type === "salary");
    // 8 days × 3M / 30 = 800K
    expect(salary?.amount).toBe(800_000);
  });

  it("Q1 fallback when termination ∈ Q1: full calc, is_advance=false", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 2_800_000,
      terminationDate: "2026-04-10",  // termination during Q1
    });
    const out = computePayroll(input);
    // Full calculation should run (deducciones present)
    const concepts = out.entries.map((e) => e.concept_type);
    expect(concepts).toContain("salary");
    expect(concepts).toContain("health_employee");
    expect(concepts).toContain("pension_employee");
  });

  it("independent mode quincenal: full calc per period", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "independent" as const,
    };
    const input = makeInput({ period, monthlySalary: 2_800_000 });
    const out = computePayroll(input);
    const concepts = out.entries.map((e) => e.concept_type);
    expect(concepts).toContain("salary");
    expect(concepts).toContain("health_employee");
  });
});
```

(Note: `makeInput` is the existing fixture helper from sub-spec 2's tests. Extend its signature to optionally accept `period` overrides. If it doesn't already accept `paymentMode`, add it.)

- [ ] **Step 2: Verify FAIL**

Run: `npm run test -- payroll-engine`
Expected: FAIL.

- [ ] **Step 3: Implement Q1 detection helper**

In `src/lib/payroll-engine.ts`, near the top:

```ts
function isFirstDayOfMonth(dateStr: string): boolean {
  return dateStr.endsWith("-01");
}

function isFifteenthOfMonth(dateStr: string): boolean {
  return dateStr.endsWith("-15");
}

function isLastDayOfMonth(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const next = new Date(d);
  next.setDate(d.getDate() + 1);
  return next.getMonth() !== d.getMonth();
}

function isQ1Advance(period: { start: string; end: string; frequency: string; paymentMode?: string }): boolean {
  return (
    period.paymentMode === "advance_settlement" &&
    period.frequency === "quincenal" &&
    isFirstDayOfMonth(period.start) &&
    isFifteenthOfMonth(period.end)
  );
}

function isQ2Settlement(period: { start: string; end: string; frequency: string; paymentMode?: string }): boolean {
  return (
    period.paymentMode === "advance_settlement" &&
    period.frequency === "quincenal" &&
    period.start.endsWith("-16") &&
    isLastDayOfMonth(period.end)
  );
}
```

- [ ] **Step 4: Branch in `computePayroll`**

In `computePayroll`, after computing worked days, add the Q1 advance branch:

```ts
// Detect advance/settlement Q1 — emit only salary+transport, skip the rest.
if (isQ1Advance(input.period)) {
  // But fallback to full calc if termination ∈ Q1 (no Q2 to settle).
  const termInQ1 =
    input.employee.termination_date &&
    input.employee.termination_date >= input.period.start &&
    input.employee.termination_date <= input.period.end;

  if (!termInQ1) {
    const baseSalaryEntries = computeBaseSalary(input, workedDays);
    const transportEntry = computeTransportAux(input, workedDays, baseSalaryEntries[0]);
    const advanceEntries = [...baseSalaryEntries];
    if (transportEntry) advanceEntries.push(transportEntry);

    return {
      entries: advanceEntries,
      provisions: [],
      employer_cost: emptyEmployerCost(),
      warnings: ["Anticipo de Q1 — la liquidación completa llega en la segunda quincena"],
      errors: errors,  // any errors from earlier stages (e.g., no salary)
    };
  }
}
```

Where `emptyEmployerCost()` returns a zero-valued `ComputedEmployerCost`.

- [ ] **Step 5: Verify PASS**

Run: `npm run test -- payroll-engine`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll-engine.ts src/lib/payroll-engine.test.ts
git commit -m "feat(payroll): engine — Q1 advance branch for advance_settlement mode"
```

---

## Task 7: Engine extension — Q2 settlement subtraction (TDD)

**Files:**
- Modify: `src/lib/payroll-engine.ts`
- Modify: `src/lib/payroll-engine.test.ts`

In Q2 settlement, the engine internally treats the **full month** as the calculation window (overrides the Q2 dates), then subtracts the Q1 advance entries the builder passes via `input.q1AdvanceEntries`.

- [ ] **Step 1: Extend `PayrollComputeInput`**

Add to the interface in `src/lib/payroll-engine.ts`:

```ts
export interface PayrollComputeInput {
  // ... existing fields
  /**
   * For Q2 settlement only: the salary+transport entries already paid in the Q1 advance
   * of the same month. Engine subtracts them from the corresponding Q2 entries.
   */
  q1AdvanceEntries?: ComputedEntry[];
}
```

- [ ] **Step 2: Write failing tests**

Append to `src/lib/payroll-engine.test.ts`:

```ts
describe("computePayroll — Q2 settlement", () => {
  it("Q2 settlement subtracts Q1 advance from salary and transport", () => {
    const period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q1Advance: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: 1_400_000, rate: null, amount: 1_400_000, description: null },
      { concept_type: "transport", is_income: true, base: 124_548, rate: null, amount: 124_548, description: null },
    ];
    const input = makeInput({
      period,
      monthlySalary: 2_800_000,
      q1AdvanceEntries: q1Advance,
    });
    const out = computePayroll(input);

    const salary = out.entries.find((e) => e.concept_type === "salary");
    const transport = out.entries.find((e) => e.concept_type === "transport");
    expect(salary?.amount).toBe(1_400_000);  // 2_800_000 − 1_400_000
    expect(transport?.amount).toBe(124_547);  // 249_095 − 124_548 (close)
    expect(out.warnings.some((w) => w.includes("Anticipo Q1 ya pagado"))).toBe(true);
  });

  it("Q2 settlement without Q1 (employee hired mid-Q2): no subtraction", () => {
    const period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 3_000_000,
      hireDate: "2026-04-20",
      // no q1AdvanceEntries
    });
    const out = computePayroll(input);
    const salary = out.entries.find((e) => e.concept_type === "salary");
    // hire 2026-04-20, period_end 2026-04-30 → 11 days
    expect(salary?.amount).toBe(1_100_000);
  });

  it("Q1 advance + Q2 settlement sum to full mensual", () => {
    // Run Q1
    const q1Period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q1Out = computePayroll(makeInput({ period: q1Period, monthlySalary: 2_800_000 }));
    const q1Advance = q1Out.entries;

    // Run Q2 with Q1 reference
    const q2Period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q2Out = computePayroll(makeInput({
      period: q2Period,
      monthlySalary: 2_800_000,
      q1AdvanceEntries: q1Advance,
    }));

    // Suma de Q1+Q2 salary = 2_800_000
    const totalSalary = (q1Out.entries.find((e) => e.concept_type === "salary")?.amount ?? 0)
      + (q2Out.entries.find((e) => e.concept_type === "salary")?.amount ?? 0);
    expect(totalSalary).toBe(2_800_000);

    const totalTransport = (q1Out.entries.find((e) => e.concept_type === "transport")?.amount ?? 0)
      + (q2Out.entries.find((e) => e.concept_type === "transport")?.amount ?? 0);
    expect(totalTransport).toBeCloseTo(249_095, -1);  // ±10 rounding
  });
});
```

- [ ] **Step 3: Verify FAIL**

Run: `npm run test -- payroll-engine`

- [ ] **Step 4: Implement Q2 settlement branch**

In `computePayroll`, after the Q1 advance branch and before the normal flow, add Q2 detection. Q2 settlement should:
1. Internally override `input.period` to the full month (start = first day, end = last day) before running stages 1-9.
2. After stages, subtract Q1 amounts from the salary and transport entries.

```ts
// Q2 settlement: compute on full month, then subtract Q1 advance.
if (isQ2Settlement(input.period)) {
  const monthStart = input.period.start.slice(0, 7) + "-01";
  const monthEndDate = new Date(input.period.end + "T00:00:00");
  const monthEnd = monthEndDate.toISOString().split("T")[0];

  const fullMonthInput = {
    ...input,
    period: { ...input.period, start: monthStart, end: monthEnd },
  };

  // Run all stages on the full month.
  // (Reuse the existing pipeline by recursively calling with mutated period
  //  but with a guard to avoid infinite recursion — easier: extract
  //  `runFullPipeline(input)` and call it here directly.)
  const monthlyOutput = runFullPipeline(fullMonthInput);

  // Subtract Q1 advance from salary and transport entries.
  if (input.q1AdvanceEntries && input.q1AdvanceEntries.length > 0) {
    const q1Salary = input.q1AdvanceEntries.find((e) => e.concept_type === "salary")?.amount ?? 0;
    const q1Transport = input.q1AdvanceEntries.find((e) => e.concept_type === "transport")?.amount ?? 0;

    monthlyOutput.entries = monthlyOutput.entries.map((e) => {
      if (e.concept_type === "salary") {
        return { ...e, amount: e.amount - q1Salary };
      }
      if (e.concept_type === "transport") {
        return { ...e, amount: e.amount - q1Transport };
      }
      return e;
    });

    monthlyOutput.warnings.push(`Anticipo Q1 ya pagado: ${q1Salary + q1Transport} restado`);
  }

  return monthlyOutput;
}
```

(Refactor: extract the existing pipeline body of `computePayroll` into an internal `runFullPipeline` so it can be called from the Q2 branch without recursion.)

- [ ] **Step 5: Verify PASS**

Run: `npm run test -- payroll-engine`

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll-engine.ts src/lib/payroll-engine.test.ts
git commit -m "feat(payroll): engine — Q2 settlement subtracts Q1 advance"
```

---

## Task 8: Builder reads payment_mode and orchestrates Q1/Q2 lookup

**Files:**
- Modify: `src/lib/payroll-period-builder.ts`

- [ ] **Step 1: Read app_flags.payment_mode at start of builder**

Add near the start of the main builder function:

```ts
const { data: flagsRow } = await supabase
  .from("app_settings")
  .select("value")
  .eq("key", "app_flags")
  .maybeSingle();

const paymentMode: "independent" | "advance_settlement" =
  ((flagsRow?.value as Record<string, unknown>)?.payment_mode as string) === "advance_settlement"
    ? "advance_settlement"
    : "independent";
```

- [ ] **Step 2: Detect Q2 and lookup Q1**

After fetching the period from DB, detect if it's a Q2 in advance_settlement mode. If so, lookup Q1:

```ts
const isQ2 =
  paymentMode === "advance_settlement" &&
  period.frequency === "quincenal" &&
  period.period_start.endsWith("-16");

let q1Entries: ComputedEntry[] | undefined;
if (isQ2) {
  const monthStart = period.period_start.slice(0, 7) + "-01";
  const q1End = period.period_start.slice(0, 7) + "-15";
  const { data: q1Period } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("period_start", monthStart)
    .eq("period_end", q1End)
    .eq("is_advance", true)
    .maybeSingle();

  if (q1Period?.id) {
    const { data: q1Rows } = await supabase
      .from("payroll_entries")
      .select("concept_type, amount, is_income, base, rate, description")
      .eq("payroll_period_id", q1Period.id)
      .eq("employee_id", employeeId)
      .in("concept_type", ["salary", "transport"]);
    q1Entries = (q1Rows ?? []) as ComputedEntry[];
  }
}
```

- [ ] **Step 3: Pass `paymentMode` and `q1AdvanceEntries` to engine input**

When constructing the `PayrollComputeInput`:

```ts
const input: PayrollComputeInput = {
  // ... existing
  period: { ...period, paymentMode },
  q1AdvanceEntries: q1Entries,
};
```

- [ ] **Step 4: Set `is_advance` flag on persisting**

After the engine runs, if `isQ1Advance(period)` was true and the engine actually emitted advance-shaped output (only salary+transport, no provisions, no employer cost), update the period:

```ts
const wasAdvance = output.warnings.some((w) =>
  w.includes("Anticipo de Q1")
);
if (wasAdvance) {
  await supabase
    .from("payroll_periods")
    .update({ is_advance: true })
    .eq("id", period.id);
}
```

- [ ] **Step 5: Verify build + tests**

Run: `npm run build && npm run test`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payroll-period-builder.ts
git commit -m "feat(payroll): builder reads payment_mode and orchestrates Q1/Q2 settlement"
```

---

## Task 9: `useMyPayroll` hook

**Files:**
- Create: `src/hooks/use-my-payroll.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-my-payroll.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollProvision,
  PayrollEmployerCost,
} from "@/lib/types";

export interface UseMyPayrollResult {
  loading: boolean;
  period: PayrollPeriod | null;
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
  availablePeriods: PayrollPeriod[];
  refetch: () => void;
}

export function useMyPayroll(periodId?: string): UseMyPayrollResult {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [provisions, setProvisions] = useState<PayrollProvision[]>([]);
  const [employerCost, setEmployerCost] = useState<PayrollEmployerCost | null>(null);
  const [availablePeriods, setAvailablePeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1. Fetch employee's available periods (only approved/paid).
      const { data: periodsData } = await supabase
        .from("payroll_periods")
        .select("*, payroll_entries!inner(employee_id)")
        .in("status", ["approved", "paid"])
        .eq("payroll_entries.employee_id", user.id)
        .order("period_start", { ascending: false });

      if (cancelled) return;
      const myPeriods = ((periodsData ?? []) as Array<PayrollPeriod & { payroll_entries: unknown }>)
        .map(({ payroll_entries: _ignore, ...rest }) => rest as PayrollPeriod);

      // dedupe by id (the inner join can return duplicates if multiple entries match)
      const seen = new Set<string>();
      const uniquePeriods = myPeriods.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      setAvailablePeriods(uniquePeriods);

      // 2. Resolve target period.
      const targetId = periodId ?? uniquePeriods[0]?.id ?? null;
      if (!targetId) {
        setPeriod(null);
        setEntries([]);
        setProvisions([]);
        setEmployerCost(null);
        setLoading(false);
        return;
      }

      const target = uniquePeriods.find((p) => p.id === targetId);
      if (!target) {
        setPeriod(null);
        setLoading(false);
        return;
      }
      setPeriod(target);

      // 3. Parallel fetch of entries / provisions / employer cost.
      const [entriesRes, provRes, costRes] = await Promise.all([
        supabase
          .from("payroll_entries")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id),
        supabase
          .from("payroll_provisions")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id),
        supabase
          .from("payroll_employer_cost")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setEntries((entriesRes.data ?? []) as PayrollEntry[]);
      setProvisions((provRes.data ?? []) as PayrollProvision[]);
      setEmployerCost((costRes.data ?? null) as PayrollEmployerCost | null);
      setLoading(false);
    })();

    // 4. Realtime subscription on payroll_periods.
    const channel = supabase
      .channel("my-payroll-periods")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payroll_periods" },
        () => setTick((t) => t + 1)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, user, periodId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return {
    loading,
    period,
    entries,
    provisions,
    employerCost,
    availablePeriods,
    refetch,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-my-payroll.ts
git commit -m "feat(payroll): add useMyPayroll hook with realtime"
```

---

## Tasks 10-22: Components, pages, PDF, settings update, smoke verification

The remaining tasks follow the same TDD/commit cadence. They cover:

- **Task 10**: `<ConceptTooltip />` component (popover with concept label + 1-2 line explanation + link to glossary anchor).
- **Task 11**: `<PayrollHeader />` component (period selector dropdown + status badges + Te depositamos + Devengado/Deducciones/Neto KPIs + PDF download button).
- **Task 12**: `<PayrollSankey />` component (D3 sankey, desktop only, click → ConceptTooltip).
- **Task 13**: `<PayrollBreakdownList />` component (mobile alternative + accessibility table).
- **Task 14**: `<PayrollProvisionsSection />` component.
- **Task 15**: `<PayrollDetailAccordion />` component.
- **Task 16**: `<PayrollCard />` for dashboard + wire into `<EmployeeDashboard />` (modify).
- **Task 17**: `payroll-pdf.ts` (jspdf builder for the colilla).
- **Task 18**: `/mi-pago/page.tsx` (orchestrator page consuming `useMyPayroll`, mounts header + sankey/list + provisions + accordion).
- **Task 19**: `/mi-pago/historial/page.tsx` (year selector + YTD summary card + bar chart + paginated table).
- **Task 20**: `/mi-pago/glosario/page.tsx` (concepts + FAQ accordion).
- **Task 21**: `<PaymentFrequencySelector />` modify — reveal `PaymentMode` selector when frequency=quincenal.
- **Task 22**: Final verification — `npm run test` (expect ~250+ total tests including the new helpers + engine extensions), `npm run build`, manual smoke (admin approves a period → employee receives in-app notification → opens `/mi-pago` → Sankey renders correctly + PDF downloads), `git push`.

Each remaining task follows the same pattern as Tasks 1-9:
1. Read relevant section of the spec for contract.
2. Write failing test (where applicable — pure helpers and engine; UI components don't get tests).
3. Implement minimally.
4. Verify build/tests.
5. Commit with `feat(payroll): …`.

For Task 22 smoke test:
- Generate a new period in `/nomina/periodos` as admin.
- Approve it.
- Log out, log in as a profile that has `role='employee'` and entries in that period (or temporarily flip admin's role to employee in the DB to preview).
- Navigate to `/dashboard` → `<PayrollCard />` shows the period.
- Click "Ver detalle" → `/mi-pago` renders Sankey + breakdown + provisiones + accordion.
- Click "Descargar PDF" → file downloads.
- Open `/mi-pago/historial` → YTD summary visible.
- Open `/mi-pago/glosario` → concepts + FAQ render.
- Verify the in-app notification appeared.

If `payment_mode='advance_settlement'`:
- Generate a Q1 period (1-15) for the same month → builder creates with `is_advance=true`, only salary+transport entries.
- Generate a Q2 period (16-30) → builder fetches Q1, engine subtracts Q1 advance from full-month calc.
- Open employee `/mi-pago?period=<q2_id>` → confirm Q2 settlement layout (header includes "Anticipo Q1 ya pagado: −$X").

---

## Self-review notes

- The first 9 tasks (migration, types, dependency, helpers, engine extensions, builder modification, hook) are fully specified. They are the most error-prone parts (engine math, realtime subscription) so the plan is dense.
- Tasks 10-22 are listed by intent. Each component follows the patterns established in sub-spec 1 (SalaryCell etc.) and sub-spec 2 (PeriodSummaryTab etc.). The implementer (or subagent) re-reads the spec section for each component and follows the same TDD/commit cadence.
- For batched execution, sensible groupings: Tasks 1-3 (foundation), Tasks 4-5 (helpers, TDD), Tasks 6-8 (engine + builder, tightly coupled), Task 9 (hook), Tasks 10-15 (components, mostly independent), Task 16 (dashboard wire-up), Task 17 (PDF), Tasks 18-20 (pages), Task 21 (settings), Task 22 (smoke + push).
- D3 Sankey is the only meaningful new dependency. The rest reuses existing infra.
