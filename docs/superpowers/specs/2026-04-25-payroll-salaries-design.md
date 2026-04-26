# Payroll — Sub-spec 1: Salarios, ajustes y configuración legal

**Status:** Spec
**Date:** 2026-04-25
**Owner:** Simon Urrego
**Depends on research:**
- `docs/research/2026-04-25-colombia-payroll-research.md` (lado empleador, marco legal 2026)
- `docs/research/2026-04-25-payroll-employee-transparency-research.md` (lado empleado, UX colilla)

This is the first of three sub-specs that together build the payroll module of App Horarios. This sub-spec scopes ONLY the data model and admin UI for storing salaries (with history), ad-hoc adjustments (bonuses, commissions), and Colombia-specific legal parameters by period (SMMLV, hourly divisor, surcharge percentages, night-shift threshold, transport aid).

The next sub-specs will consume this data:
- **Sub-spec 2** — engine: compute devengado del período, IBC, deducciones SS, provisiones, costo empleador.
- **Sub-spec 3** — colilla del empleado: Sankey, tooltips, historial, exportes.

DIAN nómina electrónica (CUNE / Documento Soporte) is **explicitly deferred** to a later spec.

---

## 1 — Goal

Provide a complete, audit-friendly data foundation for Colombian payroll computation. The admin can:
- Set and update each employee's monthly salary with full history and reason.
- Toggle salario integral and transport-aid override per salary record.
- Add ad-hoc adjustments (bonificaciones, comisiones, premios) with payment date, amount, label, and salary-component flag.
- Edit legal parameters (SMMLV, divisor, surcharges) when decrees change them mid-year.
- Optionally allow managers to view (not edit) salaries of their sede.

The employee will not see anything yet (their colilla lives in sub-spec 3).

---

## 2 — Audience and Access

| Role | salary_history | salary_adjustments | payroll_settings |
|---|---|---|---|
| `admin` | full read/write all employees | full read/write all employees | full read/write |
| `manager` | read employees of own sede, gated by `app_flags.managers_can_see_salaries` (default off) | same gating | read only |
| `employee` | read own (used in sub-spec 3) | read own (used in sub-spec 3) | read |

RLS is enforced at the DB layer using existing helpers `get_user_role()` and `get_user_location_id()`.

---

## 3 — Data model

### 3.1 `salary_history` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `employee_id` | `uuid` FK `profiles(id)` ON DELETE CASCADE | |
| `monthly_salary` | `numeric(12,2)` NOT NULL | COP, no decimals expected in practice |
| `is_integral_salary` | `boolean` NOT NULL DEFAULT false | |
| `transport_aux_override` | `boolean` NULL | NULL = use default rule (≤ 2 SMMLV → eligible); true/false force |
| `change_reason` | `text` NULL | "aumento legal SMMLV", "promoción"… |
| `effective_from` | `date` NOT NULL | |
| `effective_to` | `date` NULL | NULL = currently active |
| `created_by` | `uuid` FK `profiles(id)` ON DELETE SET NULL | who made this change |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Indexes:
- `(employee_id, effective_from DESC)` for "current salary at date" lookup.
- Partial unique: `(employee_id) WHERE effective_to IS NULL` ensures one open period per employee.

Trigger `salary_history_close_previous` (BEFORE INSERT):
- If a row already exists for `employee_id` with `effective_to IS NULL`, set its `effective_to = NEW.effective_from - INTERVAL '1 day'` before inserting the new one.
- Reject insert if it would create overlapping closed ranges.

### 3.2 `salary_adjustments` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `employee_id` | `uuid` FK `profiles(id)` ON DELETE CASCADE | |
| `payment_date` | `date` NOT NULL | when this should be paid |
| `concept_label` | `text` NOT NULL | free-text shown on the colilla, e.g. "Comisión febrero" |
| `amount` | `numeric(12,2)` NOT NULL | |
| `is_salary_component` | `boolean` NOT NULL | true = enters IBC + prima + cesantías + vacaciones; false = does not |
| `description` | `text` NULL | internal note |
| `created_by` | `uuid` FK `profiles(id)` ON DELETE SET NULL | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Index: `(employee_id, payment_date DESC)`.

### 3.3 `payroll_settings` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `period_start` | `date` NOT NULL | |
| `period_end` | `date` NULL | NULL = open-ended |
| `smmlv` | `numeric(12,2)` NOT NULL | |
| `aux_transport` | `numeric(12,2)` NOT NULL | |
| `hourly_divisor` | `int` NOT NULL | 220 / 210 |
| `night_start_hour` | `smallint` NOT NULL | 19 (Ley 2466/2025) |
| `sunday_surcharge_pct` | `numeric(4,3)` NOT NULL | 0.800 / 0.900 (1.000 from 1-jul-2027) |
| `holiday_surcharge_pct` | `numeric(4,3)` NOT NULL | mirrors sunday |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Trigger ensures non-overlapping ranges, same shape as `salary_history`.

Pre-seed (3 rows for 2026):

| period_start | period_end | smmlv | aux_transport | divisor | night_start | sunday% | holiday% |
|---|---|---|---|---|---|---|---|
| 2026-01-01 | 2026-06-30 | 1750905 | 249095 | 220 | 19 | 0.800 | 0.800 |
| 2026-07-01 | 2026-07-14 | 1750905 | 249095 | 220 | 19 | 0.900 | 0.900 |
| 2026-07-15 | NULL       | 1750905 | 249095 | 210 | 19 | 0.900 | 0.900 |

### 3.4 `app_settings` (modify)

The migration must `INSERT … ON CONFLICT (key) DO NOTHING` a row with `key = 'app_flags'` and `value = '{"managers_can_see_salaries": false}'::jsonb`. This same row is the canonical place for any future global feature flags. The settings page toggle reads/writes `value->>'managers_can_see_salaries'`.

### 3.5 `src/lib/types.ts` (modify)

Add interfaces:

```ts
export interface SalaryHistory {
  id: string;
  employee_id: string;
  monthly_salary: number;
  is_integral_salary: boolean;
  transport_aux_override: boolean | null;
  change_reason: string | null;
  effective_from: string;       // YYYY-MM-DD
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  employee_id: string;
  payment_date: string;
  concept_label: string;
  amount: number;
  is_salary_component: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PayrollSettings {
  id: string;
  period_start: string;
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

---

## 4 — UI

### 4.1 `/empleados` (admin) — new column "Salario"

Inserted between "Contrato" and "Estado".

- Read mode: shows `formatCOP(salary)` (e.g. `$2.800.000`) or `—` if no record. Hover tooltip: `Hora ord. $X (220h) · $Y desde 15-jul (210h)`.
- Click → inline numeric input, autoselect.
- On Enter / blur:
  - Validate via `validateSalary(amount, smmlv_vigente, isIntegral)`. If `< SMMLV` and not integral → toast error, revert.
  - On valid: insert into `salary_history` with `effective_from = today`, the trigger closes the previous open row.
- Visibility: admin always; manager only when `managers_can_see_salaries=true`; otherwise the cell shows `—` with tooltip "Sin permisos".

### 4.2 Side sheet del empleado — two new sections

The existing side sheet (which already shows `EmployeeEquityPanel`) gains:

**Sección "Historial salarial"**:
- Vertical timeline ordered by `effective_from DESC`. Each row: `effective_from – effective_to | $monto | reason | autor`.
- Button "Nuevo cambio salarial" → modal `<SalaryChangeForm>`:
  - Date picker (defaults to today; allows past dates with warning).
  - Numeric input for amount with COP formatting on blur.
  - Text input for `change_reason` (optional).
  - Checkbox "Salario integral" — warning visible if salary `< 13 × SMMLV`.
  - Select "Auxilio de transporte": auto / siempre / nunca → maps to `transport_aux_override` (null / true / false).

**Sección "Ajustes salariales"**:
- Cronological table (asc by `payment_date`) with: fecha, concepto, monto, badge "Salarial" / "No salarial".
- Button "Agregar ajuste" → modal `<SalaryAdjustmentForm>`:
  - Date picker for `payment_date`.
  - Text input for `concept_label`.
  - Numeric input for `amount`.
  - Switch "Constituye salario" (default ON, with helper text).
  - Optional `description` textarea.
- Each row has an inline delete (with confirm if `payment_date` is in the past).

### 4.3 New sidebar group "Nómina" (admin only)

Collapsible, between "Configuración" and the bottom (or wherever ordering looks best). Initial item:
- **Configuración de nómina** → `/nomina/configuracion`

Sub-specs 2 and 3 will add more items.

### 4.4 `/nomina/configuracion` (admin only)

- Heading + brief explanation: "Estos valores son de ley (Mintrabajo). Editá solo cuando un decreto los cambie."
- Link "Ver fuentes" opens a modal listing the legal references from the research docs.
- Table of `payroll_settings` rows ordered by `period_start ASC`. Columns: período, SMMLV, aux. transporte, divisor, hora nocturna, dominical %, festivo %.
- Buttons per row: "Editar" (modal `<PayrollSettingForm>`), "Eliminar" (with confirm).
- Top action: "Nuevo período" (same form). Trigger validates that ranges don't overlap.

### 4.5 `/settings` (admin only) — new toggle

In the "Ajustes" page, add a row in the existing form:
- "Permitir que managers vean salarios" — switch. Reads/writes `app_settings.app_flags.managers_can_see_salaries`.

---

## 5 — Helpers (`src/lib/payroll-helpers.ts`)

Pure functions, all unit-tested.

```ts
export function getCurrentSalary(
  history: SalaryHistory[],
  employeeId: string,
  date: string                                  // YYYY-MM-DD
): SalaryHistory | null;

export function getSettingsForDate(
  settings: PayrollSettings[],
  date: string
): PayrollSettings | null;

export function computeHourlyRate(
  monthlySalary: number,
  divisor: number
): number;                                      // Math.round(salary/divisor)

export function formatCOP(value: number): string;  // 2800000 → "$2.800.000"

export function parseCOP(input: string): number | null;
// admite "$2.800.000", "2.800.000", "2800000", "$2,800,000"

export function validateSalary(
  amount: number,
  smmlv: number,
  isIntegral: boolean
): { ok: boolean; error?: string; warning?: string };
// < SMMLV && !integral → ok=false, error="Menor al SMMLV vigente"
// integral && amount < 13×SMMLV → ok=true, warning="Salario integral debería ser ≥ 13 SMMLV"
// otherwise → ok=true
```

---

## 6 — Tests

### 6.1 Vitest (`src/lib/payroll-helpers.test.ts`)

- `getCurrentSalary`: array vacío → null; una fila vigente → la devuelve; tres filas con effective_to cerrados → la activa para esa fecha; fecha pre-primer → null.
- `getSettingsForDate`: con los 3 sub-períodos 2026, `2026-04-15` → fila 1, `2026-07-10` → fila 2, `2026-08-01` → fila 3.
- `computeHourlyRate`: $2.800.000 / 220 = 12727; / 210 = 13333.
- `formatCOP` / `parseCOP`: ida y vuelta para varios formatos.
- `validateSalary`: < SMMLV no integral → `{ok:false, error:…}`; < SMMLV integral → `{ok:true}`; ≥ SMMLV → `{ok:true}`; integral && < 13×SMMLV → `{ok:true, warning:…}`.

### 6.2 SQL tests (`supabase/tests/`)

- `salary_history_no_overlap.sql`: inserción que solape rangos cerrados → falla.
- `salary_history_auto_close.sql`: insert nuevo → cierra `effective_to` del anterior abierto.
- `salary_history_one_open_per_employee.sql`: dos filas con `effective_to IS NULL` para mismo empleado → falla por unique parcial.
- `payroll_settings_rls.sql`: como `authenticated` SELECT funciona; INSERT falla; como `admin` ambos funcionan.

---

## 7 — Edge cases

| Caso | Manejo |
|---|---|
| Empleado nuevo sin salario | Cell muestra `—`; al guardar, primer registro `effective_from = hoy` |
| Cambio retroactivo (`effective_from < today`) | Permitido; warning visual; trigger ajusta filas que se solapan |
| `payment_date` de ajuste en el pasado | Permitido (correcciones); badge "Pasado" en la tabla |
| `period_end IS NULL` en `payroll_settings` | "Vigente". Al insertar uno con `period_start` posterior se cierra automáticamente |
| Manager sin permiso (`managers_can_see_salaries=false`) | Cell salario muestra `—`; tooltip "Sin permisos"; click no abre input |
| Salario integral `< 13 × SMMLV` | Warning visible, no bloqueo (lo definen partes contractualmente) |
| Eliminación de empleado con historial salarial | CASCADE elimina ambas tablas (`salary_history`, `salary_adjustments`) |
| Eliminación de un período de `payroll_settings` que tiene salarios "vigentes" en él | Permitido; el motor (spec 2) usa el período vigente al momento del cómputo |
| Empleado demo con salario | Permitido — útil para previsualizar nómina antes de convertir a real |

---

## 8 — Out of scope (para sub-specs 2 y 3)

- Cómputo de devengado por período (recargos, horas extras desde `schedule_entries`) → sub-spec 2.
- Cómputo de IBC, deducciones SS, retención en la fuente, solidaridad pensional → sub-spec 2.
- Cómputo de provisiones (cesantías, intereses, prima, vacaciones) → sub-spec 2.
- Cómputo de costo del empleador → sub-spec 2.
- Generación de la colilla del empleado, Sankey, tooltips, FAQ → sub-spec 3.
- Generación de PDF / DSPNE / nómina electrónica DIAN → diferido (post sub-spec 3).
- Quincenas vs mensual: la lógica de cómo "cortar" el período vive en sub-spec 2.
- Persistencia de períodos liquidados (`payroll_periods`, `payroll_entries`) → sub-spec 2.

---

## 9 — Summary of deliverables

**Migrations (1):**
- `025_payroll_salaries.sql` — crea las 3 tablas, sus RLS, triggers, índices, y pre-carga 3 filas en `payroll_settings`.

**Files to create (10):**
- `src/lib/payroll-helpers.ts`
- `src/lib/payroll-helpers.test.ts`
- `src/components/employees/salary-cell.tsx`
- `src/components/employees/salary-history-section.tsx`
- `src/components/employees/salary-change-form.tsx`
- `src/components/employees/salary-adjustments-section.tsx`
- `src/components/employees/salary-adjustment-form.tsx`
- `src/app/(authenticated)/nomina/configuracion/page.tsx`
- `src/components/nomina/payroll-settings-table.tsx`
- `src/components/nomina/payroll-setting-form.tsx`

**Files to modify (4):**
- `src/lib/types.ts` (3 new interfaces)
- `src/app/(authenticated)/employees/page.tsx` (new column + side-sheet expansion)
- `src/components/layout/sidebar.tsx` (new "Nómina" group)
- `src/app/(authenticated)/settings/page.tsx` (new toggle)

**SQL tests (4):**
- `supabase/tests/payroll/salary_history_no_overlap.sql`
- `supabase/tests/payroll/salary_history_auto_close.sql`
- `supabase/tests/payroll/salary_history_one_open_per_employee.sql`
- `supabase/tests/payroll/payroll_settings_rls.sql`
