# Payroll — Liquidación Final por Terminación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "liquidación final" (Colombian final settlement) module that computes severance, interest, proportional prima, pending vacations and severance-pay indemnization when an employee is terminated, persists it as an immutable approved snapshot, and produces a PDF.

**Architecture:** A pure calculation engine (`liquidacion-engine.ts`, TDD) computes all concepts from inputs the admin supplies in a form. An async builder (`liquidacion-builder.ts`) reads `payroll_settings` + `salary_history`, calls the engine, and persists `liquidation_items` while preserving manual overrides. A dedicated `liquidations` table (migration 052, org-scoped RLS) stores one settlement per event. Two `/nomina/liquidaciones` pages (list + detail) and a PDF generator complete the UI. Mirrors the existing monthly payroll module patterns exactly.

**Tech Stack:** Next.js 14 App Router (`"use client"` pages), Supabase (browser client singleton), TypeScript, Vitest (pure-logic tests), jspdf/jspdf-autotable, shadcn/ui, Tailwind v3.

**Spec:** `docs/superpowers/specs/2026-05-25-payroll-liquidacion-final-design.md`

**Key conventions discovered (follow exactly):**
- Org-scoped RLS helpers (migration 039): `is_super_admin()`, `get_user_org_id()`, `get_user_role()`. Pattern for an org-scoped table: SELECT = `is_super_admin() OR organization_id = get_user_org_id()`; write = `is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))`.
- Migrations wrap in `BEGIN; … COMMIT;` (see 046, 051). Highest existing migration = **051**, so this is **052**.
- `payroll_settings` is read as an array ordered `period_start DESC`; the pure helper `getSettingsForDate(settings, date)` (in `src/lib/payroll-helpers.ts`) picks the row vigente at a date.
- Builders insert `organization_id` on **every** row (NOT NULL since migration 039) and capture insert errors into `errors[]`; recalc deletes only `is_manual_override = false` rows.
- `compute_errors` / `compute_warnings` are `jsonb NOT NULL DEFAULT '[]'` columns persisted by the builder and read by the detail page.
- PDF: `jspdf` + `jspdf-autotable`, blue membrete `[37, 99, 235]`, `doc.output("blob")` (see `src/lib/payroll-pdf.ts`).
- Sidebar group "Nómina" lives in `src/components/layout/sidebar.tsx` as `payrollNavigation: NavItem[]`.
- Money rounded with `Math.round` in the engine. Day-count uses the 360-day commercial convention via a `days360` helper.

---

## Task 1: Types

**Files:**
- Modify: `src/lib/types.ts` (append a new "Liquidación final" section near the payroll types, after the `TaxPersonalDeduction` interface ~line 459)

- [ ] **Step 1: Add the liquidación types**

Append this block to `src/lib/types.ts`:

```typescript
// ─────────────────────────────────────────────────────────────
// Liquidación final (sub-spec 4) — terminación de contrato
// ─────────────────────────────────────────────────────────────

export type LiquidacionReason =
  | "renuncia"
  | "mutuo_acuerdo"
  | "justa_causa"
  | "sin_justa_causa"
  | "fin_contrato";

export type ContractKind = "indefinido" | "fijo" | "obra_labor";

export type LiquidationStatus = "draft" | "approved" | "paid";

export type LiquidacionConcept =
  | "cesantias"
  | "cesantias_interest"
  | "prima"
  | "vacaciones"
  | "indemnizacion"
  | "otro";

export interface Liquidation {
  id: string;
  organization_id: string;
  employee_id: string;
  termination_date: string; // YYYY-MM-DD
  reason: LiquidacionReason;
  contract_kind: ContractKind;
  contract_end_date: string | null;
  hire_date: string;
  cesantias_cutoff: string;
  vacations_cutoff: string;
  vacation_days_pending: number;
  base_salary: number;
  status: LiquidationStatus;
  compute_errors: string[];
  compute_warnings: string[];
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
}

export interface LiquidationItem {
  id: string;
  liquidation_id: string;
  organization_id: string;
  concept: LiquidacionConcept;
  base: number | null;
  days: number | null;
  amount: number;
  description: string | null;
  is_manual_override: boolean;
  created_at: string;
}

export interface LiquidacionInput {
  termination_date: string;
  hire_date: string;
  reason: LiquidacionReason;
  contract_kind: ContractKind;
  contract_end_date: string | null;
  cesantias_cutoff: string;
  vacations_cutoff: string;
  vacation_days_pending: number;
  base_salary: number;
  is_integral_salary: boolean;
  settings: PayrollSettings; // vigente a termination_date
}

export interface ComputedLiquidacionItem {
  concept: LiquidacionConcept;
  base: number | null;
  days: number | null;
  amount: number;
  description: string;
}

export interface LiquidacionOutput {
  items: ComputedLiquidacionItem[];
  total: number;
  errors: string[];
  warnings: string[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors referencing the new types (`PayrollSettings` is already exported above in the same file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(liquidacion): tipos de liquidación final (sub-spec 4)"
```

---

## Task 2: Day-count helper + `suggestVacationDays`

**Files:**
- Create: `src/lib/liquidacion-engine.ts`
- Create: `src/lib/liquidacion-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/liquidacion-engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { days360, suggestVacationDays } from "./liquidacion-engine";

describe("days360 (convención 360 días)", () => {
  it("un año completo (1-ene a 1-ene siguiente) = 360", () => {
    expect(days360("2026-01-01", "2027-01-01")).toBe(360);
  });
  it("medio año (1-ene a 1-jul) = 180", () => {
    expect(days360("2026-01-01", "2026-07-01")).toBe(180);
  });
  it("un trimestre (1-ene a 1-abr) = 90", () => {
    expect(days360("2026-01-01", "2026-04-01")).toBe(90);
  });
  it("misma fecha = 0", () => {
    expect(days360("2026-06-15", "2026-06-15")).toBe(0);
  });
});

describe("suggestVacationDays (15 días hábiles/año proporcional)", () => {
  it("1 año completo → 15 días", () => {
    expect(suggestVacationDays("2025-04-01", "2026-04-01")).toBe(15);
  });
  it("medio año → 7.5 días", () => {
    expect(suggestVacationDays("2026-01-01", "2026-07-01")).toBe(7.5);
  });
  it("cutoff = terminación → 0 días", () => {
    expect(suggestVacationDays("2026-06-15", "2026-06-15")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- liquidacion-engine`
Expected: FAIL — `Cannot find module './liquidacion-engine'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/liquidacion-engine.ts`:

```typescript
import type {
  LiquidacionInput,
  LiquidacionOutput,
  ComputedLiquidacionItem,
} from "./types";

const INTEREST_RATE = 0.12; // intereses sobre cesantías = 12% anual

/**
 * Días entre dos fechas bajo la convención comercial de 360 días
 * (año = 360, mes = 30). Estándar 30/360 con tope de 30 en cada día.
 */
export function days360(from: string, to: string): number {
  const [y1, m1, d1raw] = from.split("-").map(Number);
  const [y2, m2, d2raw] = to.split("-").map(Number);
  const d1 = Math.min(d1raw, 30);
  const d2 = Math.min(d2raw, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

/**
 * Propone días de vacaciones pendientes: 15 días hábiles por año,
 * proporcional al tiempo desde el último disfrute. Editable por el admin.
 */
export function suggestVacationDays(cutoff: string, termination: string): number {
  const days = days360(cutoff, termination);
  return Math.round(((days * 15) / 360) * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- liquidacion-engine`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidacion-engine.ts src/lib/liquidacion-engine.test.ts
git commit -m "feat(liquidacion): helper days360 + suggestVacationDays (TDD)"
```

---

## Task 3: Engine — cesantías, intereses, prima, vacaciones

**Files:**
- Modify: `src/lib/liquidacion-engine.ts`
- Modify: `src/lib/liquidacion-engine.test.ts`

**Salary bases (DIFERENCIADAS — error legal si se unifican):**
- `baseConAux` (cesantías, prima): `base_salary + (base_salary ≤ 2×SMMLV ? aux_transport : 0)`
- `baseSinAux` (vacaciones, indemnización): `base_salary`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/liquidacion-engine.test.ts`:

```typescript
import { computeLiquidacion } from "./liquidacion-engine";
import type { LiquidacionInput, PayrollSettings } from "./types";

const settings2026: PayrollSettings = {
  id: "s1",
  period_start: "2026-01-01",
  period_end: null,
  smmlv: 1_750_905,
  aux_transport: 249_095,
  hourly_divisor: 210,
  night_start_hour: 19,
  sunday_surcharge_pct: 0.9,
  holiday_surcharge_pct: 0.9,
  uvt: 52_374,
  updated_at: "2026-01-01",
};

// Base ≤ 2×SMMLV (3.501.810) → recibe auxilio.
// baseConAux = 2.000.000 + 249.095 = 2.249.095 ; baseSinAux = 2.000.000
function baseInput(overrides: Partial<LiquidacionInput> = {}): LiquidacionInput {
  return {
    termination_date: "2026-04-01",
    hire_date: "2024-04-01",
    reason: "renuncia",
    contract_kind: "indefinido",
    contract_end_date: null,
    cesantias_cutoff: "2026-01-01",
    vacations_cutoff: "2025-04-01",
    vacation_days_pending: 15,
    base_salary: 2_000_000,
    is_integral_salary: false,
    settings: settings2026,
    ...overrides,
  };
}

function item(out: ReturnType<typeof computeLiquidacion>, concept: string) {
  return out.items.find((i) => i.concept === concept);
}

describe("computeLiquidacion — prestaciones (renuncia, sin indemnización)", () => {
  it("cesantías = baseConAux × días/360 (90 días → 1/4)", () => {
    const out = computeLiquidacion(baseInput());
    // 2.249.095 × 90/360 = 562.273,75 → 562.274
    expect(item(out, "cesantias")!.amount).toBe(562_274);
    expect(item(out, "cesantias")!.days).toBe(90);
  });

  it("intereses cesantías = cesantías × días × 0.12 / 360", () => {
    const out = computeLiquidacion(baseInput());
    // 562.274 × 90 × 0.12 / 360 = 16.868,22 → 16.868
    expect(item(out, "cesantias_interest")!.amount).toBe(16_868);
  });

  it("prima = baseConAux × díasSemestre/360 (semestre ene-jun, 90 días)", () => {
    const out = computeLiquidacion(baseInput());
    // semestre 2026-01-01..; días360(2026-01-01,2026-04-01)=90 → 562.274
    expect(item(out, "prima")!.amount).toBe(562_274);
  });

  it("vacaciones = (baseSinAux/30) × díasPendientes", () => {
    const out = computeLiquidacion(baseInput({ vacation_days_pending: 15 }));
    // (2.000.000/30) × 15 = 1.000.000
    expect(item(out, "vacaciones")!.amount).toBe(1_000_000);
  });

  it("base salarial NO unifica auxilio: vacaciones usa baseSinAux", () => {
    const out = computeLiquidacion(baseInput());
    expect(item(out, "cesantias")!.base).toBe(2_249_095); // con auxilio
    expect(item(out, "vacaciones")!.base).toBe(2_000_000); // sin auxilio
  });

  it("total = suma de items", () => {
    const out = computeLiquidacion(baseInput());
    const sum = out.items.reduce((acc, i) => acc + i.amount, 0);
    expect(out.total).toBe(sum);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- liquidacion-engine`
Expected: FAIL — `computeLiquidacion is not a function` (not exported yet).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/liquidacion-engine.ts`:

```typescript
function round(n: number): number {
  return Math.round(n);
}

/** Inicio del semestre (ene-jun → 1-ene; jul-dic → 1-jul) que contiene `date`. */
function semesterStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return m <= 6 ? `${y}-01-01` : `${y}-07-01`;
}

export function computeLiquidacion(input: LiquidacionInput): LiquidacionOutput {
  const items: ComputedLiquidacionItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const smmlv = input.settings.smmlv;
  const aux = input.settings.aux_transport;

  const getsAux = input.base_salary <= 2 * smmlv;
  const baseConAux = input.base_salary + (getsAux ? aux : 0);
  const baseSinAux = input.base_salary;

  // 1. Cesantías (base CON auxilio). Salario integral no genera cesantías.
  if (!input.is_integral_salary) {
    const diasCes = days360(input.cesantias_cutoff, input.termination_date);
    const cesantias = round((baseConAux * diasCes) / 360);
    items.push({
      concept: "cesantias",
      base: baseConAux,
      days: diasCes,
      amount: cesantias,
      description: `Cesantías ${diasCes} días sobre base con auxilio`,
    });

    // 2. Intereses sobre cesantías = cesantías × díasCes × 0.12 / 360
    const intereses = round((cesantias * diasCes * INTEREST_RATE) / 360);
    items.push({
      concept: "cesantias_interest",
      base: cesantias,
      days: diasCes,
      amount: intereses,
      description: `Intereses sobre cesantías (12% anual)`,
    });

    // 3. Prima del semestre (base CON auxilio)
    const semStart = semesterStart(input.termination_date);
    const primaFrom = semStart > input.hire_date ? semStart : input.hire_date;
    const diasPrima = days360(primaFrom, input.termination_date);
    const prima = round((baseConAux * diasPrima) / 360);
    items.push({
      concept: "prima",
      base: baseConAux,
      days: diasPrima,
      amount: prima,
      description: `Prima proporcional ${diasPrima} días`,
    });
  }

  // 4. Vacaciones (base SIN auxilio) = (baseSinAux/30) × díasPendientes
  const vacaciones = round((baseSinAux / 30) * input.vacation_days_pending);
  items.push({
    concept: "vacaciones",
    base: baseSinAux,
    days: Math.round(input.vacation_days_pending),
    amount: vacaciones,
    description: `Vacaciones ${input.vacation_days_pending} días pendientes`,
  });

  const total = items.reduce((acc, i) => acc + i.amount, 0);
  return { items, total, errors, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- liquidacion-engine`
Expected: PASS (all prestaciones tests + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidacion-engine.ts src/lib/liquidacion-engine.test.ts
git commit -m "feat(liquidacion): motor cesantías/intereses/prima/vacaciones (TDD)"
```

---

## Task 4: Engine — indemnización (todas las ramas)

**Files:**
- Modify: `src/lib/liquidacion-engine.ts`
- Modify: `src/lib/liquidacion-engine.test.ts`

**Rules (Art. 64 CST):** Indemnización solo si `reason === "sin_justa_causa"`; otros motivos → no item + warning. Valor del día = `baseSinAux / 30`. Servicio en años = `days360(hire, termination) / 360`.
- Indefinido, base < 10×SMMLV: ≤1 año → 30 días; >1 año → `30 + 20 × (años − 1)` proporcional.
- Indefinido, base ≥ 10×SMMLV: ≤1 año → 20 días; >1 año → `20 + 15 × (años − 1)` proporcional.
- Fijo: `baseSinAux × díasRestantes / 30` donde `díasRestantes = days360(termination, contract_end_date)`.
- Obra/labor: mínimo 15 días (V1 no estima duración) + warning.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/liquidacion-engine.test.ts`:

```typescript
describe("computeLiquidacion — indemnización (Art. 64)", () => {
  it("indefinido <10 SMMLV, 2 años, sin justa causa → 30 + 20 días", () => {
    const out = computeLiquidacion(
      baseInput({ reason: "sin_justa_causa", base_salary: 2_000_000 })
    );
    // años = días360(2024-04-01,2026-04-01)/360 = 720/360 = 2 → 30 + 20×1 = 50 días
    // valor día = 2.000.000/30 = 66.666,67 ; 50 × = 3.333.333,33 → 3.333.333
    expect(item(out, "indemnizacion")!.days).toBe(50);
    expect(item(out, "indemnizacion")!.amount).toBe(3_333_333);
  });

  it("indefinido ≥10 SMMLV (20M), 2 años → 20 + 15 días", () => {
    const out = computeLiquidacion(
      baseInput({ reason: "sin_justa_causa", base_salary: 20_000_000 })
    );
    // 20 + 15×1 = 35 días ; valor día = 20.000.000/30 ; 35 × = 23.333.333,33 → 23.333.333
    expect(item(out, "indemnizacion")!.days).toBe(35);
    expect(item(out, "indemnizacion")!.amount).toBe(23_333_333);
  });

  it("fijo → salarios del tiempo restante hasta contract_end_date", () => {
    const out = computeLiquidacion(
      baseInput({
        reason: "sin_justa_causa",
        contract_kind: "fijo",
        contract_end_date: "2026-10-01",
      })
    );
    // díasRestantes = días360(2026-04-01,2026-10-01)=180 ; 2.000.000 × 180/30 = 12.000.000
    expect(item(out, "indemnizacion")!.amount).toBe(12_000_000);
  });

  it("obra/labor → mínimo 15 días + warning", () => {
    const out = computeLiquidacion(
      baseInput({
        reason: "sin_justa_causa",
        contract_kind: "obra_labor",
        contract_end_date: "2026-12-01",
      })
    );
    // 2.000.000/30 × 15 = 1.000.000
    expect(item(out, "indemnizacion")!.amount).toBe(1_000_000);
    expect(out.warnings.some((w) => w.includes("obra"))).toBe(true);
  });

  it("renuncia → sin item de indemnización + warning", () => {
    const out = computeLiquidacion(baseInput({ reason: "renuncia" }));
    expect(item(out, "indemnizacion")).toBeUndefined();
    expect(out.warnings.some((w) => w.includes("indemnización"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- liquidacion-engine`
Expected: FAIL — indemnización item is `undefined` for `sin_justa_causa` cases.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/liquidacion-engine.ts`, insert this indemnización block **after** the vacaciones push and **before** the `const total = ...` line:

```typescript
  // 5. Indemnización por despido sin justa causa (Art. 64 CST)
  const diaIndem = baseSinAux / 30;
  if (input.reason === "sin_justa_causa") {
    let diasIndem = 0;
    if (input.contract_kind === "fijo") {
      const diasRestantes = input.contract_end_date
        ? days360(input.termination_date, input.contract_end_date)
        : 0;
      diasIndem = diasRestantes; // valor = baseSinAux × días/30 = diaIndem × días
    } else if (input.contract_kind === "obra_labor") {
      diasIndem = 15; // V1: mínimo legal; no se estima duración de la obra
      warnings.push(
        "Contrato de obra/labor: se aplicó el mínimo de 15 días. Verifique el tiempo restante estimado de la obra y ajuste con override manual si corresponde."
      );
    } else {
      // indefinido
      const aniosServicio = days360(input.hire_date, input.termination_date) / 360;
      const altaRenta = baseSinAux >= 10 * smmlv;
      const baseDias = altaRenta ? 20 : 30;
      const adicional = altaRenta ? 15 : 20;
      diasIndem =
        aniosServicio <= 1 ? baseDias : baseDias + adicional * (aniosServicio - 1);
    }
    items.push({
      concept: "indemnizacion",
      base: baseSinAux,
      days: Math.round(diasIndem),
      amount: round(diaIndem * diasIndem),
      description: `Indemnización (${input.contract_kind}, sin justa causa)`,
    });
  } else {
    warnings.push(
      `No se calcula indemnización: el motivo de terminación es "${input.reason}" (la indemnización del Art. 64 solo aplica a despido sin justa causa).`
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- liquidacion-engine`
Expected: PASS (all indemnización tests + earlier).

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidacion-engine.ts src/lib/liquidacion-engine.test.ts
git commit -m "feat(liquidacion): motor indemnización Art. 64 (todas las ramas, TDD)"
```

---

## Task 5: Engine — errors, warnings y salario integral

**Files:**
- Modify: `src/lib/liquidacion-engine.ts`
- Modify: `src/lib/liquidacion-engine.test.ts`

**Errors (bloquean aprobar):** `base_salary <= 0`; `contract_kind` fijo/obra sin `contract_end_date`, o `reason === "fin_contrato"` sin `contract_end_date`; `termination_date < hire_date`; `cesantias_cutoff > termination_date`; `vacations_cutoff > termination_date`; `vacation_days_pending < 0`.
**Warnings adicionales:** recordatorio Art. 65 (moratoria) y recordatorio de cesantías ya consignadas a fondo.
**Salario integral:** ya cubierto (Task 3 omite cesantías/prima si `is_integral_salary`); aquí se verifica explícitamente y se añade el warning correcto.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/liquidacion-engine.test.ts`:

```typescript
describe("computeLiquidacion — errors y warnings", () => {
  it("base_salary <= 0 → error", () => {
    const out = computeLiquidacion(baseInput({ base_salary: 0 }));
    expect(out.errors.some((e) => e.includes("salario"))).toBe(true);
  });

  it("fijo sin contract_end_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ contract_kind: "fijo", contract_end_date: null })
    );
    expect(out.errors.some((e) => e.includes("fecha de finalización"))).toBe(true);
  });

  it("termination_date < hire_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ hire_date: "2026-05-01", termination_date: "2026-04-01" })
    );
    expect(out.errors.some((e) => e.includes("anterior a la fecha de ingreso"))).toBe(
      true
    );
  });

  it("cesantias_cutoff > termination_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ cesantias_cutoff: "2026-05-01", termination_date: "2026-04-01" })
    );
    expect(out.errors.some((e) => e.includes("corte de cesantías"))).toBe(true);
  });

  it("vacation_days_pending < 0 → error", () => {
    const out = computeLiquidacion(baseInput({ vacation_days_pending: -1 }));
    expect(out.errors.some((e) => e.includes("días de vacaciones"))).toBe(true);
  });

  it("siempre emite recordatorio de cesantías consignadas a fondo", () => {
    const out = computeLiquidacion(baseInput());
    expect(out.warnings.some((w) => w.includes("consignad"))).toBe(true);
  });

  it("salario integral (25M ≥13 SMMLV): sin cesantías ni prima, sí vacaciones", () => {
    const out = computeLiquidacion(
      baseInput({ base_salary: 25_000_000, is_integral_salary: true, vacation_days_pending: 15 })
    );
    expect(item(out, "cesantias")).toBeUndefined();
    expect(item(out, "prima")).toBeUndefined();
    expect(item(out, "vacaciones")).toBeDefined();
    expect(out.warnings.some((w) => w.includes("integral"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- liquidacion-engine`
Expected: FAIL — no errors pushed; integral warning missing.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/liquidacion-engine.ts`, insert this validation block at the **top of `computeLiquidacion`**, right after the `const warnings: string[] = [];` declaration (so errors are collected before computation):

```typescript
  // ── Validaciones que bloquean la aprobación ──────────────────
  if (input.base_salary <= 0) {
    errors.push("Empleado sin salario vigente: no se puede calcular la liquidación.");
  }
  if (input.termination_date < input.hire_date) {
    errors.push("La fecha de terminación es anterior a la fecha de ingreso.");
  }
  if (input.cesantias_cutoff > input.termination_date) {
    errors.push("El corte de cesantías es posterior a la fecha de terminación.");
  }
  if (input.vacations_cutoff > input.termination_date) {
    errors.push("El corte de vacaciones es posterior a la fecha de terminación.");
  }
  if (input.vacation_days_pending < 0) {
    errors.push("Los días de vacaciones pendientes no pueden ser negativos.");
  }
  const needsEndDate =
    input.contract_kind === "fijo" ||
    input.contract_kind === "obra_labor" ||
    input.reason === "fin_contrato";
  if (needsEndDate && !input.contract_end_date) {
    errors.push(
      "Falta la fecha de finalización del contrato (requerida para contrato fijo/obra o motivo fin de contrato)."
    );
  }
  if (errors.length > 0) {
    return { items: [], total: 0, errors, warnings };
  }
```

Then add these warnings right **before** the final `const total = ...` line:

```typescript
  if (input.is_integral_salary) {
    warnings.push(
      "Salario integral: no genera cesantías ni prima (van incluidas en el salario)."
    );
  }
  warnings.push(
    "Recordatorio: descuente las cesantías ya consignadas al fondo. Si el corte de cesantías está bien definido, el cálculo ya refleja solo lo pendiente."
  );
  warnings.push(
    "Recordatorio: si el pago de la liquidación se demora, puede causarse indemnización moratoria (Art. 65 CST). Este motor no la calcula."
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- liquidacion-engine`
Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidacion-engine.ts src/lib/liquidacion-engine.test.ts
git commit -m "feat(liquidacion): validaciones (errors), warnings y rama salario integral (TDD)"
```

---

## Task 6: Migration 052 — tablas, RLS, trigger, índices

**Files:**
- Create: `supabase/migrations/052_liquidations.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/052_liquidations.sql`:

```sql
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
--   - Actualizar src/lib/types.ts (Liquidation, LiquidationItem, etc.) — ya hecho en Task 1.

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
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
```

- [ ] **Step 2: Apply the migration to Supabase Cloud**

> The user has pre-authorized applying migrations to cloud (project `ugkvuinkynvtuiutwlkd`). Use the Supabase MCP `apply_migration` tool with name `052_liquidations` and the SQL above (omit the leading comment block if the tool wraps its own transaction; otherwise include `BEGIN/COMMIT` as written).

Expected: success, no errors. Verify with MCP `list_tables` that `liquidations` and `liquidation_items` exist.

- [ ] **Step 3: Regenerate database types**

Run the `/regen-types` skill (or Supabase MCP `generate_typescript_types`) to refresh `src/lib/supabase/database.types.ts`.

Then verify it compiles:
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/052_liquidations.sql src/lib/supabase/database.types.ts
git commit -m "feat(liquidacion): migración 052 (liquidations + liquidation_items + RLS + trigger)"
```

---

## Task 7: SQL tests (RLS + trigger terminal)

**Files:**
- Create: `supabase/tests/payroll/liquidations_rls.sql`
- Create: `supabase/tests/payroll/liquidation_paid_terminal.sql`

- [ ] **Step 1: Write the terminal-status test**

Create `supabase/tests/payroll/liquidation_paid_terminal.sql`:

```sql
-- Test: a liquidation with status='paid' cannot transition back to draft/approved.
-- Trigger: liquidations_paid_terminal_trg (BEFORE UPDATE)
BEGIN;

DO $$
DECLARE
  v_org_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_emp_id   UUID;
  v_liq_id   UUID;
  attempted  BOOLEAN := false;
BEGIN
  -- Necesitamos un empleado de esa org para la FK employee_id.
  SELECT id INTO v_emp_id FROM profiles WHERE organization_id = v_org_id LIMIT 1;
  IF v_emp_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay profiles en la org de prueba';
    RETURN;
  END IF;

  INSERT INTO liquidations (organization_id, employee_id, termination_date, reason,
    contract_kind, hire_date, cesantias_cutoff, vacations_cutoff, base_salary, status)
  VALUES (v_org_id, v_emp_id, '2026-04-01', 'renuncia', 'indefinido',
    '2024-04-01', '2026-01-01', '2025-04-01', 2000000, 'draft')
  RETURNING id INTO v_liq_id;

  UPDATE liquidations SET status = 'approved' WHERE id = v_liq_id;
  UPDATE liquidations SET status = 'paid'     WHERE id = v_liq_id;

  BEGIN
    UPDATE liquidations SET status = 'draft' WHERE id = v_liq_id;
    attempted := true;
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  IF attempted THEN
    RAISE EXCEPTION 'TEST FAILED: paid -> draft transition was allowed';
  END IF;

  RAISE NOTICE 'OK: paid liquidation is terminal — reversion rejected';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Write the RLS isolation test**

Create `supabase/tests/payroll/liquidations_rls.sql`:

```sql
-- Test: RLS presence — liquidations/liquidation_items have RLS enabled and
-- org-scoped policies (org A cannot see org B). Verifies policy definitions exist.
BEGIN;

DO $$
DECLARE
  v_rls_liq  BOOLEAN;
  v_rls_item BOOLEAN;
  v_pol_count INT;
BEGIN
  SELECT relrowsecurity INTO v_rls_liq  FROM pg_class WHERE relname = 'liquidations';
  SELECT relrowsecurity INTO v_rls_item FROM pg_class WHERE relname = 'liquidation_items';

  IF NOT v_rls_liq THEN
    RAISE EXCEPTION 'TEST FAILED: RLS not enabled on liquidations';
  END IF;
  IF NOT v_rls_item THEN
    RAISE EXCEPTION 'TEST FAILED: RLS not enabled on liquidation_items';
  END IF;

  SELECT count(*) INTO v_pol_count FROM pg_policies
    WHERE tablename IN ('liquidations','liquidation_items');
  IF v_pol_count < 4 THEN
    RAISE EXCEPTION 'TEST FAILED: expected >=4 policies, found %', v_pol_count;
  END IF;

  RAISE NOTICE 'OK: RLS enabled + % policies present on liquidation tables', v_pol_count;
END $$;

ROLLBACK;
```

- [ ] **Step 3: Run both SQL tests against cloud**

Use Supabase MCP `execute_sql` to run each file's contents.
Expected: each emits its `OK:` NOTICE and no `TEST FAILED` exception. (The terminal test may emit `SKIP` if the test org has no profiles — acceptable.)

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/payroll/liquidation_paid_terminal.sql supabase/tests/payroll/liquidations_rls.sql
git commit -m "test(liquidacion): SQL tests trigger terminal + RLS"
```

---

## Task 8: Builder — `assembleLiquidacion`

**Files:**
- Create: `src/lib/liquidacion-builder.ts`

The builder reads the `liquidations` row, derives `is_integral_salary` from the latest `salary_history`, loads `payroll_settings` vigente, calls `computeLiquidacion`, deletes only `is_manual_override = false` items, inserts fresh items (with `organization_id`), and persists `compute_errors/compute_warnings`. Insert errors are captured into `errors[]` (lesson from the monthly engine).

- [ ] **Step 1: Write the builder**

Create `src/lib/liquidacion-builder.ts`:

```typescript
import { createClient } from "@/lib/supabase/client";
import { computeLiquidacion } from "@/lib/liquidacion-engine";
import { getSettingsForDate } from "@/lib/payroll-helpers";
import type { Liquidation, PayrollSettings, SalaryHistory } from "@/lib/types";

export interface AssembleResult {
  errors: string[];
  warnings: string[];
}

export async function assembleLiquidacion(
  liquidationId: string
): Promise<AssembleResult> {
  const supabase = createClient() as any;

  // 1. Liquidación
  const { data: liq, error: liqErr } = await supabase
    .from("liquidations")
    .select("*")
    .eq("id", liquidationId)
    .maybeSingle();
  if (liqErr || !liq) {
    return { errors: ["No se encontró la liquidación."], warnings: [] };
  }
  const liquidation = liq as Liquidation;

  // 2. Último salario (para is_integral_salary)
  const { data: salaries } = await supabase
    .from("salary_history")
    .select("*")
    .eq("employee_id", liquidation.employee_id)
    .order("effective_from", { ascending: false });
  const latestSalary = ((salaries ?? []) as SalaryHistory[])[0] ?? null;

  // 3. payroll_settings vigente a termination_date
  const { data: settingsRows } = await supabase
    .from("payroll_settings")
    .select("*")
    .lte("period_start", liquidation.termination_date)
    .order("period_start", { ascending: false });
  const settings = getSettingsForDate(
    (settingsRows ?? []) as PayrollSettings[],
    liquidation.termination_date
  );

  // 4. Pre-validaciones que el motor no puede hacer (faltan datos externos)
  const preErrors: string[] = [];
  if (!settings) {
    preErrors.push(
      "No hay configuración de nómina (payroll_settings) vigente a la fecha de terminación."
    );
  }
  if (!latestSalary) {
    preErrors.push("El empleado no tiene salario registrado (salary_history).");
  }
  if (preErrors.length > 0 || !settings) {
    await supabase
      .from("liquidations")
      .update({ compute_errors: preErrors, compute_warnings: [] })
      .eq("id", liquidationId);
    return { errors: preErrors, warnings: [] };
  }

  // 5. Motor puro
  const output = computeLiquidacion({
    termination_date: liquidation.termination_date,
    hire_date: liquidation.hire_date,
    reason: liquidation.reason,
    contract_kind: liquidation.contract_kind,
    contract_end_date: liquidation.contract_end_date,
    cesantias_cutoff: liquidation.cesantias_cutoff,
    vacations_cutoff: liquidation.vacations_cutoff,
    vacation_days_pending: Number(liquidation.vacation_days_pending),
    base_salary: Number(liquidation.base_salary),
    is_integral_salary: latestSalary?.is_integral_salary ?? false,
    settings,
  });

  // 6. Borrar items no-override y reinsertar
  await supabase
    .from("liquidation_items")
    .delete()
    .eq("liquidation_id", liquidationId)
    .eq("is_manual_override", false);

  const itemsInsert = output.items.map((it) => ({
    liquidation_id: liquidationId,
    organization_id: liquidation.organization_id,
    concept: it.concept,
    base: it.base,
    days: it.days,
    amount: it.amount,
    description: it.description,
    is_manual_override: false,
  }));

  if (itemsInsert.length > 0) {
    const { error } = await supabase.from("liquidation_items").insert(itemsInsert);
    if (error) {
      output.errors.push(
        `No se pudieron guardar los conceptos de la liquidación: ${error.message}`
      );
    }
  }

  // 7. Persistir mensajes del motor
  await supabase
    .from("liquidations")
    .update({
      compute_errors: output.errors,
      compute_warnings: output.warnings,
    })
    .eq("id", liquidationId);

  return { errors: output.errors, warnings: output.warnings };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `getSettingsForDate` is exported from `src/lib/payroll-helpers.ts` and `createClient` from `src/lib/supabase/client.ts` — both verified to exist.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/liquidacion-builder.ts
git commit -m "feat(liquidacion): builder assembleLiquidacion (persistencia + overrides)"
```

---

## Task 9: PDF generator

**Files:**
- Create: `src/lib/liquidacion-pdf.ts`

Mirrors `src/lib/payroll-pdf.ts`: blue membrete `[37, 99, 235]`, employee data, período laborado, autoTable of concepts, total, signature space, `doc.output("blob")`.

- [ ] **Step 1: Write the PDF generator**

Create `src/lib/liquidacion-pdf.ts`:

```typescript
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Liquidation, LiquidationItem } from "@/lib/types";

const CONCEPT_LABELS: Record<string, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses sobre cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
  indemnizacion: "Indemnización",
  otro: "Otro",
};

const REASON_LABELS: Record<string, string> = {
  renuncia: "Renuncia voluntaria",
  mutuo_acuerdo: "Mutuo acuerdo",
  justa_causa: "Terminación con justa causa",
  sin_justa_causa: "Despido sin justa causa",
  fin_contrato: "Terminación del contrato",
};

function formatCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export interface LiquidacionPdfData {
  liquidation: Liquidation;
  items: LiquidationItem[];
  employee: { full_name: string; document_id?: string };
  companyName?: string;
}

export function generateLiquidacionPdf(data: LiquidacionPdfData): Blob {
  const { liquidation, items, employee } = data;
  const companyName = data.companyName ?? "Liquidación de prestaciones sociales";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;

  // ── Membrete ──
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, marginLeft, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Liquidación final de contrato", marginLeft, 17);

  // ── Datos del empleado / contrato ──
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  let y = 32;
  doc.text(`Empleado: ${employee.full_name}`, marginLeft, y);
  if (employee.document_id) {
    doc.text(`Documento: ${employee.document_id}`, marginLeft, (y += 6));
  }
  doc.text(
    `Período laborado: ${liquidation.hire_date} a ${liquidation.termination_date}`,
    marginLeft,
    (y += 6)
  );
  doc.text(
    `Motivo: ${REASON_LABELS[liquidation.reason] ?? liquidation.reason}`,
    marginLeft,
    (y += 6)
  );
  y += 6;

  // ── Tabla de conceptos ──
  const total = items.reduce((acc, it) => acc + Number(it.amount), 0);
  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Base", "Días", "Valor"]],
    body: items.map((it) => [
      CONCEPT_LABELS[it.concept] ?? it.concept,
      it.base != null ? formatCOP(Number(it.base)) : "—",
      it.days != null ? String(it.days) : "—",
      formatCOP(Number(it.amount)),
    ]),
    foot: [["Total a pagar", "", "", formatCOP(total)]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [239, 246, 255], fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    theme: "striped",
    margin: { left: marginLeft, right: 14 },
  });

  // ── Espacio de firma ──
  y = (doc as any).lastAutoTable.finalY + 30;
  doc.setDrawColor(0, 0, 0);
  doc.line(marginLeft, y, marginLeft + 70, y);
  doc.setFontSize(9);
  doc.text("Firma del empleado", marginLeft, y + 5);
  doc.line(pageWidth - marginLeft - 70, y, pageWidth - marginLeft, y);
  doc.text("Firma del empleador", pageWidth - marginLeft - 70, y + 5);

  return doc.output("blob");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/liquidacion-pdf.ts
git commit -m "feat(liquidacion): generador PDF de liquidación"
```

---

## Task 10: Lista + modal "Nueva liquidación"

**Files:**
- Create: `src/components/nomina/liquidacion-form.tsx`
- Create: `src/app/(authenticated)/nomina/liquidaciones/page.tsx`

- [ ] **Step 1: Write the form modal**

Create `src/components/nomina/liquidacion-form.tsx`. Follows the `payroll-setting-form.tsx` pattern (Dialog + per-field state + validation + toast). On save: inserts a `draft` liquidation, calls `assembleLiquidacion`, then redirects to the detail page.

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { assembleLiquidacion } from "@/lib/liquidacion-builder";
import { suggestVacationDays } from "@/lib/liquidacion-engine";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmployeeOption {
  id: string;
  full_name: string;
  hire_date: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LiquidacionForm({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient() as any;

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [reason, setReason] = useState("sin_justa_causa");
  const [contractKind, setContractKind] = useState("indefinido");
  const [contractEndDate, setContractEndDate] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [cesantiasCutoff, setCesantiasCutoff] = useState("");
  const [vacationsCutoff, setVacationsCutoff] = useState("");
  const [vacationDays, setVacationDays] = useState("0");
  const [baseSalary, setBaseSalary] = useState("");
  const [saving, setSaving] = useState(false);

  // Cargar empleados activos al abrir
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, hire_date")
        .eq("is_active", true)
        .order("full_name");
      setEmployees((data ?? []) as EmployeeOption[]);
    })();
  }, [open]);

  // Prefill hire_date + base_salary al elegir empleado
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      const emp = employees.find((e) => e.id === employeeId);
      if (emp?.hire_date) setHireDate(emp.hire_date);
      const { data: salaries } = await supabase
        .from("salary_history")
        .select("monthly_salary")
        .eq("employee_id", employeeId)
        .order("effective_from", { ascending: false })
        .limit(1);
      const latest = (salaries ?? [])[0];
      if (latest) setBaseSalary(String(latest.monthly_salary));
    })();
  }, [employeeId]);

  // Prefill vacation_days al ingresar vacations_cutoff + termination_date
  useEffect(() => {
    if (vacationsCutoff && terminationDate && vacationsCutoff <= terminationDate) {
      setVacationDays(String(suggestVacationDays(vacationsCutoff, terminationDate)));
    }
  }, [vacationsCutoff, terminationDate]);

  function reset() {
    setEmployeeId("");
    setTerminationDate("");
    setReason("sin_justa_causa");
    setContractKind("indefinido");
    setContractEndDate("");
    setHireDate("");
    setCesantiasCutoff("");
    setVacationsCutoff("");
    setVacationDays("0");
    setBaseSalary("");
  }

  async function handleSave() {
    if (
      !employeeId ||
      !terminationDate ||
      !hireDate ||
      !cesantiasCutoff ||
      !vacationsCutoff ||
      !baseSalary
    ) {
      toast.error("Completa todos los campos obligatorios.");
      return;
    }
    const needsEnd =
      contractKind === "fijo" ||
      contractKind === "obra_labor" ||
      reason === "fin_contrato";
    if (needsEnd && !contractEndDate) {
      toast.error("Ingresa la fecha de finalización del contrato.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("liquidations")
      .insert({
        organization_id: profile?.organization_id ?? "",
        employee_id: employeeId,
        termination_date: terminationDate,
        reason,
        contract_kind: contractKind,
        contract_end_date: contractEndDate || null,
        hire_date: hireDate,
        cesantias_cutoff: cesantiasCutoff,
        vacations_cutoff: vacationsCutoff,
        vacation_days_pending: parseFloat(vacationDays) || 0,
        base_salary: parseFloat(baseSalary),
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      toast.error(`No se pudo crear la liquidación: ${error?.message ?? ""}`);
      return;
    }

    await assembleLiquidacion(data.id);
    setSaving(false);
    toast.success("Liquidación creada.");
    reset();
    onOpenChange(false);
    router.push(`/nomina/liquidaciones/${data.id}`);
  }

  const needsEnd =
    contractKind === "fijo" ||
    contractKind === "obra_labor" ||
    reason === "fin_contrato";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva liquidación</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Empleado</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un empleado" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hire">Fecha de ingreso</Label>
            <Input id="hire" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="term">Fecha de terminación</Label>
            <Input id="term" type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="renuncia">Renuncia</SelectItem>
                <SelectItem value="mutuo_acuerdo">Mutuo acuerdo</SelectItem>
                <SelectItem value="justa_causa">Justa causa</SelectItem>
                <SelectItem value="sin_justa_causa">Sin justa causa</SelectItem>
                <SelectItem value="fin_contrato">Fin de contrato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo de contrato</Label>
            <Select value={contractKind} onValueChange={setContractKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="indefinido">Indefinido</SelectItem>
                <SelectItem value="fijo">Término fijo</SelectItem>
                <SelectItem value="obra_labor">Obra o labor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsEnd && (
            <div className="space-y-2">
              <Label htmlFor="end">Fecha fin de contrato</Label>
              <Input id="end" type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ces">Corte de cesantías</Label>
            <Input id="ces" type="date" value={cesantiasCutoff} onChange={(e) => setCesantiasCutoff(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vac">Último disfrute de vacaciones</Label>
            <Input id="vac" type="date" value={vacationsCutoff} onChange={(e) => setVacationsCutoff(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vacdays">Días de vacaciones pendientes</Label>
            <Input id="vacdays" type="number" step="0.01" value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="base">Salario base mensual</Label>
            <Input id="base" type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Calcular y crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the list page**

Create `src/app/(authenticated)/nomina/liquidaciones/page.tsx`. Mirrors `nomina/periodos/page.tsx`: role guard, fetch list, shadcn `<Table>`, "Nueva liquidación" button → modal, row click → detail.

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { PageHeader } from "@/components/shared/page-header";
import { LiquidacionForm } from "@/components/nomina/liquidacion-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Row {
  id: string;
  termination_date: string;
  reason: string;
  status: string;
  employee: { full_name: string } | null;
}

const REASON_LABELS: Record<string, string> = {
  renuncia: "Renuncia",
  mutuo_acuerdo: "Mutuo acuerdo",
  justa_causa: "Justa causa",
  sin_justa_causa: "Sin justa causa",
  fin_contrato: "Fin de contrato",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  paid: "Pagada",
};

export default function LiquidacionesPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient() as any;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (profile && profile.role !== "admin" && profile.role !== "super_admin") {
      router.replace("/dashboard");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("liquidations")
      .select("id, termination_date, reason, status, employee:profiles(full_name)")
      .order("termination_date", { ascending: false });
    const list = (data ?? []) as Row[];
    setRows(list);

    // Totales por liquidación (suma de items)
    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("liquidation_items")
        .select("liquidation_id, amount")
        .in("liquidation_id", ids);
      const t: Record<string, number> = {};
      for (const it of (items ?? []) as { liquidation_id: string; amount: number }[]) {
        t[it.liquidation_id] = (t[it.liquidation_id] ?? 0) + Number(it.amount);
      }
      setTotals(t);
    }
    setLoading(false);
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquidaciones"
        description="Liquidación final de prestaciones por terminación de contrato"
        action={{ label: "Nueva liquidación", onClick: () => setModalOpen(true) }}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empleado</TableHead>
            <TableHead>Fecha terminación</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Cargando…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No hay liquidaciones.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => router.push(`/nomina/liquidaciones/${r.id}`)}
              >
                <TableCell>{r.employee?.full_name ?? "—"}</TableCell>
                <TableCell>{r.termination_date}</TableCell>
                <TableCell>{REASON_LABELS[r.reason] ?? r.reason}</TableCell>
                <TableCell className="text-right">{fmt(totals[r.id] ?? 0)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "paid" ? "default" : "secondary"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <LiquidacionForm open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) void load(); }} />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `PageHeader` accepts `title`, `description`, `action={{label,onClick}}` — per CLAUDE.md it does.)

- [ ] **Step 4: Commit**

```bash
git add src/components/nomina/liquidacion-form.tsx "src/app/(authenticated)/nomina/liquidaciones/page.tsx"
git commit -m "feat(liquidacion): lista + modal nueva liquidación"
```

---

## Task 11: Detail page (desglose, errores/warnings, acciones de estado, PDF)

**Files:**
- Create: `src/app/(authenticated)/nomina/liquidaciones/[id]/page.tsx`

Shows concept breakdown, total, errors/warnings panel, and status-driven buttons:
- `draft`: **Recalcular** + **Aprobar** (disabled if `compute_errors.length > 0`)
- `approved`: **Reabrir** (→ draft) + **Marcar pagada** (→ paid)
- `paid`: read-only
- All states: **Descargar PDF**

- [ ] **Step 1: Write the detail page**

Create `src/app/(authenticated)/nomina/liquidaciones/[id]/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { assembleLiquidacion } from "@/lib/liquidacion-builder";
import { generateLiquidacionPdf } from "@/lib/liquidacion-pdf";
import type { Liquidation, LiquidationItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CONCEPT_LABELS: Record<string, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses sobre cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
  indemnizacion: "Indemnización",
  otro: "Otro",
};

export default function LiquidacionDetailPage() {
  const params = useParams<{ id: string }>();
  const liqId = params.id;
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient() as any;

  const [liq, setLiq] = useState<Liquidation | null>(null);
  const [items, setItems] = useState<LiquidationItem[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liqId]);

  async function load() {
    setLoading(true);
    const [{ data: liqData }, { data: itemsData }] = await Promise.all([
      supabase.from("liquidations").select("*, employee:profiles(full_name)").eq("id", liqId).maybeSingle(),
      supabase.from("liquidation_items").select("*").eq("liquidation_id", liqId).order("concept"),
    ]);
    if (liqData) {
      setLiq(liqData as Liquidation);
      setEmployeeName((liqData as any).employee?.full_name ?? "");
    }
    setItems((itemsData ?? []) as LiquidationItem[]);
    setLoading(false);
  }

  const errors: string[] = Array.isArray(liq?.compute_errors) ? (liq!.compute_errors as string[]) : [];
  const warnings: string[] = Array.isArray(liq?.compute_warnings) ? (liq!.compute_warnings as string[]) : [];
  const total = items.reduce((acc, it) => acc + Number(it.amount), 0);
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  async function handleRecalc() {
    setBusy(true);
    await assembleLiquidacion(liqId);
    await load();
    setBusy(false);
    toast.success("Liquidación recalculada.");
  }

  async function handleApprove() {
    if (errors.length > 0) {
      toast.error("Corrige los errores antes de aprobar.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: profile?.id ?? null })
      .eq("id", liqId);
    setBusy(false);
    if (error) { toast.error(`No se pudo aprobar: ${error.message}`); return; }
    await load();
    toast.success("Liquidación aprobada.");
  }

  async function handleReopen() {
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({ status: "draft", approved_at: null, approved_by: null })
      .eq("id", liqId);
    setBusy(false);
    if (error) { toast.error(`No se pudo reabrir: ${error.message}`); return; }
    await load();
    toast.success("Liquidación reabierta.");
  }

  async function handleMarkPaid() {
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: profile?.id ?? null })
      .eq("id", liqId);
    setBusy(false);
    if (error) { toast.error(`No se pudo marcar como pagada: ${error.message}`); return; }
    await load();
    toast.success("Liquidación marcada como pagada.");
  }

  function handlePdf() {
    if (!liq) return;
    const blob = generateLiquidacionPdf({
      liquidation: liq,
      items,
      employee: { full_name: employeeName },
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liquidacion-${employeeName.replace(/\s+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!liq) return <p className="text-muted-foreground">No se encontró la liquidación.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title={`Liquidación — ${employeeName}`} description={`Terminación ${liq.termination_date}`} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={liq.status === "paid" ? "default" : "secondary"}>
          {liq.status === "draft" ? "Borrador" : liq.status === "approved" ? "Aprobada" : "Pagada"}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {liq.status === "draft" && (
            <>
              <Button variant="outline" onClick={handleRecalc} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Recalcular
              </Button>
              <Button onClick={handleApprove} disabled={busy || errors.length > 0}>
                Aprobar
              </Button>
            </>
          )}
          {liq.status === "approved" && (
            <>
              <Button variant="outline" onClick={handleReopen} disabled={busy}>Reabrir</Button>
              <Button onClick={handleMarkPaid} disabled={busy}>Marcar pagada</Button>
            </>
          )}
          <Button variant="outline" onClick={handlePdf}>
            <Download className="mr-2 h-4 w-4" />
            Descargar PDF
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="mb-2 flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> Errores ({errors.length}) — bloquean la aprobación
          </p>
          <ul className="list-disc pl-6 text-sm text-red-700 dark:text-red-300">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="mb-2 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Advertencias ({warnings.length})
          </p>
          <ul className="list-disc pl-6 text-sm text-amber-700 dark:text-amber-300">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Días</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell>
                {CONCEPT_LABELS[it.concept] ?? it.concept}
                {it.is_manual_override && <Badge variant="outline" className="ml-2">Manual</Badge>}
              </TableCell>
              <TableCell className="text-right">{it.base != null ? fmt(Number(it.base)) : "—"}</TableCell>
              <TableCell className="text-right">{it.days ?? "—"}</TableCell>
              <TableCell className="text-right">{fmt(Number(it.amount))}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell colSpan={3}>Total a pagar</TableCell>
            <TableCell className="text-right">{fmt(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authenticated)/nomina/liquidaciones/[id]/page.tsx"
git commit -m "feat(liquidacion): página de detalle (desglose, estados, PDF)"
```

---

## Task 12: Sidebar item

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add the nav item**

In `src/components/layout/sidebar.tsx`, find the `payrollNavigation` array and add the Liquidaciones entry (after "Períodos"). Reuse an already-imported lucide icon to avoid touching the import list — use `FileText` (already imported) or, if available, `Receipt`. To be safe, reuse `FileText`:

```typescript
const payrollNavigation: NavItem[] = [
  { name: "Configuración", href: "/nomina/configuracion", icon: Wallet, roles: ["super_admin", "admin"] },
  { name: "Períodos",      href: "/nomina/periodos",      icon: FileText, roles: ["super_admin", "admin"] },
  { name: "Liquidaciones", href: "/nomina/liquidaciones", icon: FileText, roles: ["super_admin", "admin"] },
  { name: "Ausencias",     href: "/nomina/ausencias",     icon: CalendarDays, roles: ["super_admin", "admin", "manager"] },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(liquidacion): item Liquidaciones en sidebar de Nómina"
```

---

## Task 13: Full verification + lint + build

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS — all prior tests + the new liquidación engine tests (~21 new).

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 3: Manual smoke test (dev)**

Start dev (`npm run dev`), log in as admin, navigate to **Nómina → Liquidaciones**. Create a liquidación for a test employee that has a `salary_history` row:
- Verify the modal prefills `hire_date`, `base_salary`, and `vacation_days_pending` after entering `vacations_cutoff`.
- Verify the detail page shows concept breakdown + total.
- Verify a `renuncia` shows no indemnización but a warning; a `sin_justa_causa` shows indemnización.
- Verify **Aprobar** is disabled when there are errors (test by creating one for an employee with no salary_history → "sin salario" error).
- Verify **Recalcular** preserves a manually-overridden item (set one row `is_manual_override = true` directly in the DB, recalc, confirm it survives).
- Verify **Descargar PDF** downloads a well-formed PDF.
- Verify state flow: draft → approved → paid; confirm a paid liquidación can't be reopened (trigger blocks it).

- [ ] **Step 4: Final commit (if smoke fixes needed) + branch wrap-up**

If smoke testing surfaced fixes, commit them. Then this branch is ready for PR.

```bash
git log --oneline main..HEAD
```

Hand off to `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- §4 schema (liquidations + liquidation_items + RLS + terminal trigger + índices) → Task 6. ✓
- §5 engine (bases diferenciadas, cesantías, intereses, prima, vacaciones, indemnización all branches, errors, warnings, integral, `suggestVacationDays`) → Tasks 2–5. ✓
- §5 builder (`assembleLiquidacion`, org_id on inserts, capture insert errors, preserve overrides, persist compute msgs) → Task 8. ✓
- §6 UI (list page, modal with prefills, detail with breakdown/errors/warnings/status buttons, PDF, sidebar) → Tasks 10, 11, 12, 9. ✓
- §7 edge cases (no salary, missing end date, invalid dates, integral, settings-by-date, motivo≠sin_justa_causa, reopen with overrides, cesantías consignadas warning) → covered across Tasks 5, 8, 11. ✓
- §8 testing (Vitest vectors + 2 SQL tests) → Tasks 2–5, 7. ✓
- §9 deliverables (migration 052, ~9 new files, ~3 modified, 2 SQL tests) → all tasks. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" — all steps have concrete code/commands. ✓

**3. Type consistency:** `computeLiquidacion`, `suggestVacationDays`, `days360`, `assembleLiquidacion`, `generateLiquidacionPdf`, `LiquidacionInput/Output`, `ComputedLiquidacionItem`, `Liquidation`, `LiquidationItem`, `LiquidacionConcept` used consistently across tasks. Builder maps engine `ComputedLiquidacionItem` → DB rows with matching column names (`concept/base/days/amount/description/is_manual_override`). Detail/PDF read the same columns. ✓

**Note for executor:** the spec lists `is_integral_salary` as an engine input but the `liquidations` table (§4) has no such column — by design the **builder derives it from the latest `salary_history` row** (Task 8, Step 1). This is intentional and faithful to D4.
