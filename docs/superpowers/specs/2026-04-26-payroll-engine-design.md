# Payroll — Sub-spec 2: Motor de cálculo

**Status:** Spec
**Date:** 2026-04-26
**Owner:** Simon Urrego
**Depends on:**
- Sub-spec 1 (`docs/superpowers/specs/2026-04-25-payroll-salaries-design.md`) — already shipped
- Research (`docs/research/2026-04-25-colombia-payroll-research.md`, `2026-04-25-payroll-employee-transparency-research.md`)
**Followed by:** Sub-spec 3 (colilla del empleado con Sankey).

This sub-spec adds the compute engine that turns scheduling data + salary data into a Colombian-law-compliant payroll snapshot per period. No employee-facing colilla here (that's sub-spec 3); this delivers the admin-side flow to generate, review, adjust, approve, and mark periods as paid. DIAN nómina electrónica remains explicitly deferred.

---

## 1 — Goal

The admin can:
- Generate a payroll period (mensual or quincenal per company toggle).
- See the calculated devengado, deducciones, IBC, provisiones, and costo empleador per employee, computed from `schedule_entries`, `salary_history`, `salary_adjustments`, `absence_records`, `tax_personal_deductions`, and `payroll_settings`.
- Apply manual overrides (e.g. retention from external accountant) without losing them on recalc.
- Approve the period (immutable snapshot) → mark as paid.
- Reopen approved periods (back to draft) before they're paid.

Out of scope:
- Employee-facing colilla / Sankey → sub-spec 3.
- Liquidación final by termination → sub-spec 4.
- DIAN electronic invoice / CUNE → deferred.
- PILA file generation → deferred.

---

## 2 — Audience and Access

| Role | Read | Write |
|---|---|---|
| `admin` | All payroll tables | Full |
| `manager` | Own sede, gated by `app_flags.managers_can_see_salaries` | None |
| `employee` | Only own rows (used in sub-spec 3) | None |

RLS at the DB layer using existing helpers (`get_user_role()`, `get_user_location_id()`).

---

## 3 — Data model

### 3.1 `payroll_settings` — add `uvt` (migration 027)

`ALTER TABLE payroll_settings ADD COLUMN uvt NUMERIC(10,2) NOT NULL DEFAULT 52374;` then `UPDATE payroll_settings SET uvt = 52374` for the seeded rows. UVT 2026 from DIAN Resolución 000238/2025.

### 3.2 `profiles` — add hire/termination/ARL (migration 028)

Add to `profiles`:
- `hire_date DATE NULL` — when null, motor uses `created_at::date` as fallback.
- `termination_date DATE NULL`.
- `is_terminated BOOLEAN NOT NULL DEFAULT false`.
- `arl_risk_class SMALLINT NULL CHECK (arl_risk_class BETWEEN 1 AND 5)` — null = clase I (0.522%).

`/empleados` editor adds 4 inputs in the existing edit form.

### 3.3 New tables (migration 029)

#### `app_settings` — add payment_frequency

Insert (or update if `app_flags` exists) a row with `key='app_flags'` containing `{"payment_frequency": "mensual", "managers_can_see_salaries": false}`. Settings page gains a `<select>` to switch frequency.

#### `payroll_periods`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `period_start` | date NOT NULL | |
| `period_end` | date NOT NULL | |
| `frequency` | text NOT NULL CHECK IN ('mensual','quincenal') | snapshot of company setting at gen time |
| `status` | text NOT NULL CHECK IN ('draft','approved','paid') DEFAULT 'draft' | |
| `approved_at` | timestamptz NULL | |
| `approved_by` | uuid NULL FK profiles | |
| `paid_at` | timestamptz NULL | |
| `paid_by` | uuid NULL FK profiles | |
| `created_at` | timestamptz default now() | |

Unique partial index `(period_start, period_end)` to prevent duplicates. Trigger reject overlapping ranges.

#### `payroll_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `payroll_period_id` | uuid FK | ON DELETE CASCADE |
| `employee_id` | uuid FK profiles | |
| `concept_type` | text NOT NULL | enum DIAN-aligned (see §3.5) |
| `is_income` | boolean NOT NULL | true = devengado, false = deducción |
| `base` | numeric(12,2) NULL | base de cálculo |
| `rate` | numeric(8,5) NULL | factor / pct |
| `amount` | numeric(12,2) NOT NULL | |
| `description` | text NULL | render-friendly label |
| `is_manual_override` | boolean NOT NULL DEFAULT false | true = preservar en recalc |
| `created_at` | timestamptz default now() | |

Index `(payroll_period_id, employee_id)`.

#### `payroll_provisions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `payroll_period_id` | uuid FK | ON DELETE CASCADE |
| `employee_id` | uuid FK profiles | |
| `concept` | text CHECK IN ('cesantias','cesantias_interest','prima','vacaciones') | |
| `base` | numeric(12,2) | |
| `rate` | numeric(8,5) | |
| `amount` | numeric(12,2) | |
| `accumulated_ytd` | numeric(12,2) | acumulado al cierre del período |
| `created_at` | timestamptz | |

#### `payroll_employer_cost`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `payroll_period_id` | uuid FK |
| `employee_id` | uuid FK profiles |
| `health_employer` | numeric(12,2) |
| `pension_employer` | numeric(12,2) |
| `arl_employer` | numeric(12,2) |
| `parafiscales_caja` | numeric(12,2) |
| `parafiscales_sena` | numeric(12,2) |
| `parafiscales_icbf` | numeric(12,2) |
| `total` | numeric(12,2) generated stored |

#### `absence_records`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK profiles ON DELETE CASCADE | |
| `start_date` | date NOT NULL | |
| `end_date` | date NOT NULL | |
| `type` | text CHECK IN ('sick_eps','sick_arl','maternity','paternity','vacation','paid_leave','unpaid_leave','suspension') | |
| `paid_pct` | numeric(4,3) NOT NULL | 0..1.0 |
| `payer` | text CHECK IN ('employer','eps','arl','none') NOT NULL | |
| `notes` | text NULL | |
| `source_request_id` | uuid NULL FK time_off_requests | trazabilidad |
| `created_by` | uuid NULL FK profiles | |
| `created_at` | timestamptz | |

Index `(employee_id, start_date)`.

Trigger `time_off_to_absence_record` on `time_off_requests`:
- AFTER UPDATE: if `OLD.status <> 'approved'` and `NEW.status = 'approved'` → insert an `absence_record` with computed `type/paid_pct/payer` from `time_off_requests.type` and `source_request_id = NEW.id`.
- AFTER UPDATE: if `OLD.status = 'approved'` and `NEW.status <> 'approved'` → delete absences with `source_request_id = NEW.id`.
- AFTER UPDATE: if both are 'approved' but date range changed → delete + reinsert.

#### `tax_personal_deductions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid FK profiles ON DELETE CASCADE | |
| `dependents_count` | smallint NOT NULL DEFAULT 0 | |
| `mortgage_interest_monthly` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `prepaid_health_monthly` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `voluntary_pension_monthly` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `afc_monthly` | numeric(12,2) NOT NULL DEFAULT 0 | |
| `effective_from` | date NOT NULL | |
| `effective_to` | date NULL | |
| `created_by` | uuid NULL FK profiles | |
| `created_at` | timestamptz | |

Same trigger pattern as `salary_history` (auto-close on insert; partial unique index for one open row per employee). Helper `getCurrentTaxDeductions(history, employeeId, date)` mirrors `getCurrentSalary`.

### 3.4 RLS

All 5 new tables follow the same pattern as sub-spec 1:
- admin: full access.
- manager: SELECT only on rows joining to employees of own sede, gated by `app_flags.managers_can_see_salaries`.
- employee: SELECT only own rows.

### 3.5 Concept enum (DIAN-aligned)

Single enum used in `payroll_entries.concept_type`. Each concept has `is_income` predetermined:

| concept_type | is_income | category |
|---|---|---|
| `salary` | true | base salary (prorrateado) |
| `transport` | true | auxilio de transporte |
| `surcharge_night` | true | hora nocturna 35% |
| `surcharge_sunday` | true | dominical recargo |
| `surcharge_holiday` | true | festivo recargo |
| `overtime_day` | true | hora extra diurna |
| `overtime_night` | true | hora extra nocturna |
| `bonus_salary` | true | salary_adjustments con is_salary_component=true |
| `bonus_non_salary` | true | salary_adjustments con is_salary_component=false |
| `vacation_pay` | true | pago directo cuando se toman vacaciones |
| `prima` | true | pago directo en jun/dic |
| `cesantias_interest` | true | pago directo en enero |
| `health_employee` | false | 4% sobre IBC |
| `pension_employee` | false | 4% sobre IBC |
| `solidarity_pension` | false | 1-2% si IBC ≥ 4 SMMLV |
| `income_tax` | false | retención en la fuente |
| `embargo` | false | embargo judicial (manual) |
| `libranza` | false | libranza/préstamo (manual) |
| `voluntary_pension` | false | aporte voluntario empleado |
| `afc` | false | ahorro fomento construcción |
| `union_fee` | false | cuota sindical |
| `other_deduction` | false | otros (manual) |

Helper: `isIncomeForConcept(concept_type) → boolean`, derived from a constant map.

---

## 4 — Engine (`src/lib/payroll-engine.ts`)

Pure function `computePayroll(input): output`. 9 ordered stages, each an internal helper.

```ts
export interface PayrollComputeInput {
  employee: Profile & { hire_date: string | null; termination_date: string | null; arl_risk_class: number | null };
  period: { start: string; end: string; frequency: PaymentFrequency };
  salaryHistory: SalaryHistory[];
  scheduleEntries: ScheduleEntry[];        // status='published', overtime_status != 'rejected'
  shiftTemplates: ShiftTemplate[];
  holidays: HolidayDate[];                 // del período (nacional + sede)
  absences: AbsenceRecord[];               // del período
  adjustments: SalaryAdjustment[];         // payment_date ∈ [start,end]
  taxDeductions: TaxPersonalDeduction | null;
  settings: PayrollSettings[];
  ytdProvisionsBefore: { cesantias: number; cesantias_interest: number; prima: number; vacaciones: number };
}

export interface PayrollComputeOutput {
  entries: ComputedEntry[];                  // payroll_entries to write
  provisions: ComputedProvision[];           // payroll_provisions to write
  employer_cost: ComputedEmployerCost;       // payroll_employer_cost row
  warnings: string[];                        // soft messages, do not block approve
  errors: string[];                          // hard errors, block approve
}
```

### 4.1 Pipeline stages

1. **`computeWorkedDays(input) → { totalDays, paidDaysByPayer }`**
   - Convención 30 días/mes. Lo usado para prorrateo.
   - Resta días de absences `payer in ('eps','arl','none')` del bucket "empleador paga".
   - Si `hire_date` cae en el período, cuenta desde hire_date. Si `termination_date`, hasta termination_date.

2. **`computeBaseSalary(input, workedDays) → entry[]`**
   - Si `is_integral_salary`: emite `salary` con valor `monthly_salary × workedDays / 30` y marca para usar IBC=70% más adelante.
   - Si normal: emite `salary` con valor `monthly_salary × workedDays / 30`.

3. **`computeTransportAux(input, workedDays) → entry|null`**
   - Si `monthly_salary ≤ 2 × SMMLV` y `transport_aux_override !== false`: emite `transport` con `aux_transport × workedDays / 30`.
   - Si `transport_aux_override === false`, omite.
   - Si `transport_aux_override === true`, emite siempre.

4. **`computeSurcharges(input) → entry[]`**
   - Para cada `schedule_entry` no-overtime:
     - Descomponer en horas (decimales si necesario).
     - Para cada hora, clasificar:
       - **¿es nocturna?** = hora ∈ `[settings.night_start_hour .. 06)`.
       - **¿es dominical?** = `dayOfWeek(date) === 0`.
       - **¿es festiva?** = `isHoliday(date, location_id, holidays)`.
     - Aplicar recargos (suma aritmética):
       - Nocturna ordinaria: 35% sobre `valor_hora`.
       - Dominical/Festiva: `settings.sunday_surcharge_pct` (o `holiday_surcharge_pct`) × `valor_hora`.
       - Nocturna+dominical/festiva: ambos recargos sumados.
   - Agrupa por concepto y emite `surcharge_night`, `surcharge_sunday`, `surcharge_holiday`.

5. **`computeOvertime(input) → entry[]`**
   - Filtrar `schedule_entries` donde `overtime_status='approved'`.
   - Cada hora extra: si nocturna → `overtime_night` (75%); si diurna → `overtime_day` (25%).
   - Multiplicar por `valor_hora` y emitir.

6. **`computeAdjustments(input) → entry[]`**
   - Por cada `salary_adjustment` con `payment_date ∈ período`:
     - Si `is_salary_component`: emite `bonus_salary`.
     - Si no: emite `bonus_non_salary`.

7. **`computeIBC(input, salaryEntries) → number`**
   - Suma de conceptos `salary + surcharges + overtime + bonus_salary`. NO incluye transport ni bonus_non_salary.
   - Salario integral: usar 70% × monthly_salary (prorrateado), no la suma de devengados.
   - Topes: `max(SMMLV, min(25 × SMMLV, ibc))`.

8. **`computeEmployeeDeductions(input, ibc, taxDeductions) → entry[]`**
   - `health_employee = ibc × 0.04`.
   - `pension_employee = ibc × 0.04`.
   - `solidarity_pension`: pct escalonado según múltiplos de SMMLV (función `getSolidarityRate(ibc, smmlv)`).
   - `income_tax`: depuración paso a paso del research §8.3:
     1. Ingresos brutos del mes.
     2. Restar aportes obligatorios SS (salud + pensión empleado).
     3. Restar deducciones (intereses hipoteca tope 100 UVT/mes, dependientes 10% tope 32 UVT, salud prepagada tope 16 UVT).
     4. Restar rentas exentas (25% tope 240 UVT, AFC + AFP voluntario tope 30% del ingreso bruto).
     5. Aplicar tabla de retención por rangos UVT (Art. 383 ET). Si `base_depurada < 95 UVT` → 0.
   - Aporte voluntario / AFC / cuota sindical / embargos / libranzas: NO los calcula el motor; se gestionan como manual overrides en el tab 3 del período.

9. **`computeProvisionsAndEmployerCost(input, ibc, salaryEntries, ytdBefore) → { provisions, employer_cost }`**
   - `base_provisiones = sum(salary + transport + surcharges + overtime + bonus_salary)`. Para integral: solo factor salarial.
   - `cesantias = base × 0.0833`; acumula `accumulated_ytd = ytdBefore.cesantias + cesantias`.
   - `cesantias_interest = cesantias × 0.01` (simplificación: 1% mensual sobre la cesantía del propio mes, en lugar del 12% anual sobre el saldo acumulado de cesantías. La diferencia es despreciable para empleados estables; el cierre de año real lo calculará el contador externo. Documentado como límite explícito de v1).
   - `prima = base × 0.0833`.
   - `vacaciones = monthly_salary × 0.0417` (sobre salario neto del mes, no sobre devengado).
   - **Costo empleador**:
     - `health_employer = ibc × 0.085`.
     - `pension_employer = ibc × 0.12`.
     - `arl_employer = ibc × arl_rate(arl_risk_class)`. Tabla: I=0.00522, II=0.01044, III=0.02436, IV=0.04350, V=0.06960.
     - `parafiscales_caja = ibc × 0.04` siempre.
     - Si `monthly_salary < 10 × SMMLV`:
       - `parafiscales_sena = 0`, `parafiscales_icbf = 0` (exoneración Ley 1607/2012).
     - Si no: `sena = ibc × 0.02`, `icbf = ibc × 0.03`.

### 4.2 Multi-period split

Si el período cruza un cambio de `payroll_settings` (ej. 1–31 julio cruza el 14-15 jul con cambio de divisor 220→210), el motor splittea el período en sub-períodos según `getSettingsForDate` y aplica la fórmula por sub-período. Salario base prorrateado proporcionalmente por días en cada sub-período. Recargos calculados con el % vigente al día de cada `schedule_entry`.

### 4.3 Errors vs warnings

**Errors** (bloquean aprobar):
- "Sin salario vigente para el empleado en el período".
- "Período cruza el primer día calendario del nacimiento de la app (no hay payroll_settings que lo cubra)".

**Warnings** (no bloquean):
- "Empleado entró el [fecha], prorrateado a X días".
- "Empleado tiene N días sin ausencia registrada que el motor asume trabajados".
- "Sin tax_personal_deductions vigente, asumiendo cero deducciones (retención calculada conservadoramente)".
- "ARL clase null, asumiendo clase I".

---

## 5 — UI

### 5.1 Sidebar — `Nómina`

Items (admin only):
- "Configuración" (existente)
- **"Períodos"** → `/nomina/periodos`
- **"Ausencias"** → `/nomina/ausencias`

### 5.2 `/nomina/periodos` (lista)

- Tabla ordenada desc por `period_start`. Columnas: período, frecuencia, status (badge), # empleados, total devengado, total deducciones, total neto, fecha aprobación, acciones.
- Filtros: año, status.
- Botón "Generar nuevo período" → modal:
  - Si `payment_frequency='mensual'`: select "Mes y año" → start = primer día, end = último día.
  - Si `quincenal`: select Mes + radio Q1/Q2 → Q1 = 1–15, Q2 = 16–fin.
  - Validación: rechaza si solapa con período existente (DB trigger).
  - Botón "Calcular preview" → llama al motor para todos los empleados activos. Crea `payroll_periods` status=`draft`, persiste filas iniciales en `payroll_entries`, `payroll_provisions`, `payroll_employer_cost`. Redirige a `/nomina/periodos/[id]`.

### 5.3 `/nomina/periodos/[id]` (detalle, 3 tabs)

**Tab Resumen**:
- KPI cards: total devengado, total deducciones, total neto, costo empleador, # empleados.
- Lista de warnings agregados.
- Botones según status:
  - `draft`: "Recalcular todos", "Aprobar" (deshabilitado si hay errors duros).
  - `approved`: "Reabrir", "Marcar como pagado".
  - `paid`: solo lectura.

**Tab Por empleado**:
- Tabla expandible. Búsqueda + filtro por sede. Cada fila:
  - Empleado, devengado, deducciones, neto.
  - Click expande mostrando el desglose completo: cada `payroll_entries`, `payroll_provisions`, costo empleador.
  - Botón "Recalcular este empleado" en draft.

**Tab Ajustes manuales**:
- Lista de filas en `payroll_entries` con `is_manual_override=true`. Es la única forma de overrides en sub-spec 2; no hay tabla separada.
- Botón "Agregar override" → modal:
  - Empleado (select).
  - concept_type (select de la enum).
  - Monto.
  - Razón (text).
- Recalcular respeta `is_manual_override=true` rows (no las pisa).

### 5.4 `/empleados` side sheet — 2 secciones nuevas

**"Ausencias e incapacidades"** (debajo de "Ajustes salariales"):
- Tabla cronológica `absence_records`.
- Botón "Registrar ausencia" → modal `AbsenceForm` con auto-fill de `paid_pct/payer` por tipo:
  - `sick_eps` → días 1-2 al 0.6667/empleador, 3-90 al 0.6667/EPS, 91-180 al 0.5/EPS. Como simplificación v1, el form pregunta por una sola fila con `paid_pct/payer`; admin debe registrar dos filas si se cruzan rangos (ej. `sick_eps_employer_first_2` + `sick_eps_eps_rest`). Documentado en helper text del form.
  - `sick_arl` → 1.0 / arl.
  - `maternity` / `paternity` → 1.0 / eps.
  - `vacation` / `paid_leave` → 1.0 / employer.
  - `unpaid_leave` / `suspension` → 0 / none.
- Origen visible: si `source_request_id` está, badge "Auto desde solicitud".

**"Deducciones personales"** (debajo de ausencias):
- Mini-tabla con la fila vigente.
- Botón "Actualizar declaración" → `TaxDeductionsForm`. Mismo patrón que SalaryChangeForm.

### 5.5 `/nomina/ausencias` (vista cruzada admin)

Tabla con todas las ausencias activas/pasadas. Filtros: tipo, sede, año, empleado. "Ver en empleado" abre el side sheet.

### 5.6 `/settings`

Agregar select "Frecuencia de pago" (mensual / quincenal) → escribe en `app_settings.app_flags.payment_frequency`.

### 5.7 Edits a `/empleados` formulario edit

Agregar 4 campos opcionales al form de editar empleado:
- `hire_date` (date).
- `termination_date` (date).
- `is_terminated` (checkbox).
- `arl_risk_class` (select 1-5).

---

## 6 — Helpers (puros, en `src/lib/payroll-engine-helpers.ts`)

```ts
export function getSolidarityRate(ibc: number, smmlv: number): number;  // 0..0.02
export function getArlRate(class_: number | null): number;               // 0.00522..0.0696
export function isExonerationApplicable(monthlySalary: number, smmlv: number): boolean; // < 10×SMMLV
export function classifyHour(date: string, hour: number, holidays: HolidayDate[], settings: PayrollSettings, locationId: string): { isNight: boolean; isSunday: boolean; isHoliday: boolean };
export function applyDayProration(monthlyAmount: number, workedDays: number): number; // × workedDays/30
export function isIncomeForConcept(concept_type: string): boolean;
export function getCurrentTaxDeductions(history: TaxPersonalDeduction[], employeeId: string, date: string): TaxPersonalDeduction | null;
export function depurarBaseRetencion(input): number;  // research §8.3
export function aplicarTablaRetencion(baseDepurada: number, uvt: number): number;  // research §8.2
```

Plus the existing helpers from sub-spec 1 (`getCurrentSalary`, `getSettingsForDate`, `computeHourlyRate`, `formatCOP`, …).

---

## 7 — Testing

### 7.1 Vitest

`src/lib/payroll-engine.test.ts`:
- Worked-days prorrateo (hire mid-period, terminación, ausencias `unpaid`).
- Salario integral: IBC = 70% × monthly_salary, sin provisiones.
- Recargos:
  - Hora ordinaria nocturna: 35%.
  - Hora dominical diurna: 80% (en período pre-jul) y 90% (post-jul).
  - Hora dominical nocturna: 35% + 80% = 115%.
  - Festivo: igual a dominical.
- Sub-períodos: período cruzando 14-15 jul → divisor cambia, dominical también cambia.
- Solidaridad pensional: cada uno de los 6 escalones (4, 16, 17, 18, 19, 20 SMMLV).
- Auxilio de transporte: ≤ 2 SMMLV, > 2 SMMLV, override true/false/null.
- Retención: 3 niveles ($2M sin retención; $5M con retención normal; $12M alta retención) — comparados con valores del research §8.5.
- Provisiones + YTD acumulado.
- Costo empleador: clase ARL, exoneración SENA+ICBF si salario < 10 SMMLV.
- Empty/edge inputs: empleado sin schedule_entries (solo salario base), sin salario (errors).

### 7.2 SQL tests (`supabase/tests/payroll/`)

- `time_off_to_absence_record_create.sql`: aprobar request → crea absence_record.
- `time_off_to_absence_record_unapprove.sql`: cambiar request a rejected → borra absence_record.
- `time_off_to_absence_record_date_change.sql`: cambiar fechas en request approved → reemplaza absence_record.
- `payroll_periods_no_overlap.sql`: insertar período solapado → falla.
- `tax_deductions_one_open_per_employee.sql`: dos filas abiertas → falla.
- `payroll_period_paid_terminal.sql`: status='paid' → no permite cambiar a draft (trigger).

---

## 8 — Edge cases

| Caso | Manejo |
|---|---|
| Empleado sin `salary_history` vigente | Motor genera entries con `0` + error "Sin salario vigente". `Aprobar` deshabilitado. |
| Empleado entró mid-período | Prorrateo desde hire_date. Warning visible. |
| Empleado se retiró mid-período | Prorrateo hasta termination_date. `is_terminated=true` excluye períodos posteriores. |
| Ausencia que cruza dos períodos | Cada período cuenta sólo su porción. La fila se persiste íntegra una sola vez. |
| Salario integral | IBC = 70% × monthly_salary, sin provisiones. Recargos sí aplican. |
| Salario < SMMLV (no integral) | Warning, cálculo continúa con el valor literal. |
| ARL clase null | Default clase I. Warning. |
| Solidaridad escalonada | Tabla en `getSolidarityRate`. |
| Reapertura de período con overrides | `is_manual_override=true` se preserva en recalc. |
| `payroll_settings` cambia mid-período | Motor splittea por sub-período. |
| `time_off_request` aprobado y luego cambiado | Trigger reemplaza el `absence_record`. |
| `payroll_period.status='paid'` se intenta volver a draft | Bloqueado por trigger DB. Para corregir, generar período de "ajuste" en spec 4. |

---

## 9 — Out of scope (sub-specs futuras)

- Colilla del empleado con Sankey, tooltips, FAQ → **sub-spec 3**.
- Liquidación final por terminación → sub-spec 4.
- DIAN nómina electrónica / DSPNE → diferido.
- PILA → diferido.
- Embargos con cálculo automático (% sobre salario para alimentos, civiles) → sub-spec 4 si lo piden.
- Multi-currency → no aplica (Colombia sólo COP).

---

## 10 — Summary of deliverables

**Migrations (3):**
- `027_payroll_settings_uvt.sql` — agregar `uvt`.
- `028_profiles_hire_termination_arl.sql` — agregar 4 columnas a profiles.
- `029_payroll_period_tables.sql` — crear `payroll_periods`, `payroll_entries`, `payroll_provisions`, `payroll_employer_cost`, `absence_records`, `tax_personal_deductions` + RLS + triggers + auto-vínculo time_off → absence.

**Files to create (~13):**
- `src/lib/payroll-engine.ts` (motor puro, ~600 LOC)
- `src/lib/payroll-engine-helpers.ts` (helpers + tests)
- `src/lib/payroll-engine.test.ts`
- `src/components/employees/absence-form.tsx`
- `src/components/employees/absence-section.tsx`
- `src/components/employees/tax-deductions-form.tsx`
- `src/components/employees/tax-deductions-section.tsx`
- `src/components/nomina/period-generate-modal.tsx`
- `src/components/nomina/period-detail-summary-tab.tsx`
- `src/components/nomina/period-detail-by-employee-tab.tsx`
- `src/components/nomina/period-detail-overrides-tab.tsx`
- `src/components/nomina/period-override-form.tsx`
- `src/app/(authenticated)/nomina/periodos/page.tsx`
- `src/app/(authenticated)/nomina/periodos/[id]/page.tsx`
- `src/app/(authenticated)/nomina/ausencias/page.tsx`

**Files to modify (~5):**
- `src/lib/types.ts` (~10 interfaces nuevas)
- `src/app/(authenticated)/employees/page.tsx` (2 secciones nuevas + edición de hire/termination/ARL)
- `src/components/layout/sidebar.tsx` (2 items nuevos en grupo Nómina)
- `src/app/(authenticated)/settings/page.tsx` (frequency selector)
- `src/components/settings/labor-constraints-form.tsx` o nuevo `payment-frequency-selector.tsx`

**SQL tests (6):**
Listed in §7.2.
