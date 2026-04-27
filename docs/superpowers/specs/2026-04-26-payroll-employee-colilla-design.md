# Payroll — Sub-spec 3: Colilla del empleado + modelo de anticipo quincenal

**Status:** Spec
**Date:** 2026-04-26
**Owner:** Simon Urrego
**Depends on:**
- Sub-spec 1 (`docs/superpowers/specs/2026-04-25-payroll-salaries-design.md`) — shipped.
- Sub-spec 2 (`docs/superpowers/specs/2026-04-26-payroll-engine-design.md`) — shipped.
- Research (`docs/research/2026-04-25-payroll-employee-transparency-research.md`) — autoritativo para UX.

This sub-spec exposes the immutable payroll snapshots produced by sub-spec 2 to the employee through `/mi-pago`, with a desktop Sankey + mobile breakdown list, tooltips, glossary+FAQ, PDF download, in-app realtime notification, and history. It also extends the engine with a Colombian-standard "advance + settlement" mode for quincenal-paid companies.

DIAN nómina electrónica, transactional email, and liquidación final remain explicitly deferred.

---

## 1 — Goal

A logged-in employee opens `/dashboard` and sees a card with their last paid period at a glance. Clicking goes to `/mi-pago` where they understand:
- **What** they earned (salario, recargos, horas extras, bonos)
- **What** was deducted (salud, pensión, retención si aplica)
- **What** was provisioned for them (cesantías, prima, vacaciones)
- **How much** actually arrived in their bank account
- **Why** each line is what it is (tooltips + glossary + FAQ)

For companies paying quincenal with the advance-settlement convention (the dominant Colombian pattern), the engine knows that Q1 is a partial advance and Q2 is the full monthly settlement minus what Q1 already paid.

Out of scope:
- Employee dispute / correction workflow.
- Email notifications (deferred to sub-spec 4 — needs Resend setup).
- DIAN CUNE / DSPNE.
- Liquidación final por terminación.
- PILA file generation.

---

## 2 — Audience and Access

| Role | Read | Write |
|---|---|---|
| `employee` | Own approved/paid periods + entries + provisions | None |
| `admin` | All periods (full visibility for support) | None new (admin write happens in sub-spec 2 flows) |
| `manager` | Own approved/paid periods (their personal pay) | None |

RLS already in place from sub-spec 2 — `payroll_entries` / `payroll_provisions` / `payroll_employer_cost` allow `employee_id = auth.uid()` SELECT. The `/mi-pago` page filters at the query level to `status ∈ ('approved','paid')` so employees never see drafts.

---

## 3 — Data model changes

### 3.1 Migration 030 — realtime, notification trigger, advance flag, payment_mode

```sql
-- Migration 030: payroll publication realtime, notification trigger, advance flag, payment_mode.

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

### 3.2 `src/lib/types.ts` — extend types

```ts
export type PaymentMode = "independent" | "advance_settlement";

// Update PayrollComputeInput in payroll-engine.ts to include paymentMode.
```

The existing `PayrollPeriod` interface gains an `is_advance: boolean` field (already nullable-ok from migration default).

---

## 4 — Engine extension (advance_settlement mode)

### 4.1 Behavior switch

`computePayroll(input)` accepts a new `paymentMode` from `input.period.paymentMode` (snapshotted at period creation time, like `frequency`).

```ts
input.period: { start, end, frequency, paymentMode };
```

### 4.2 Q1 detection

A period is a Q1 advance when:
- `paymentMode === 'advance_settlement'`
- `frequency === 'quincenal'`
- `period_start === firstDayOfMonth(period_start)` and `period_end === firstDayOfMonth(period_start) + 14 days`

### 4.3 Q2 detection

A period is a Q2 settlement when:
- `paymentMode === 'advance_settlement'`
- `frequency === 'quincenal'`
- `period_start === firstDayOfMonth(period_start) + 15 days` and `period_end === lastDayOfMonth(period_start)`

### 4.4 Q1 advance behavior

If Q1 advance:
- `computeWorkedDays`: 15 days (or fewer if hire/term mid-Q1).
- Stages 2 and 3 emit `salary` (prorrateado a 15/30) and `transport` (prorrateado).
- Stages 4-9 are SKIPPED (no surcharges, no overtime, no adjustments, no IBC, no deductions, no provisiones, no employer cost).
- Output: `entries = [salary_q1, transport_q1]`, `provisions = []`, `employer_cost = zero`, `warnings = ['Anticipo de Q1 — la liquidación completa llega en la segunda quincena']`.
- The builder sets `payroll_periods.is_advance = true` when persisting.

**Fallback for terminations during Q1**: if `termination_date ∈ Q1`, the engine treats the period as Q1-as-final (full calculation, not advance) — there will be no Q2 to settle. Set `is_advance = false`. Emit a warning.

### 4.5 Q2 settlement behavior

If Q2 settlement:
- The engine internally computes the **full month** (period_start = first day of month, period_end = last day) running stages 1-9.
- After computation, the engine looks up the employee's Q1 advance for the same month (`SELECT … FROM payroll_entries WHERE payroll_period_id IN (Q1 of same month) AND employee_id = me`) and **subtracts** the `salary` and `transport` amounts from the Q2 entries.
- Net result: Q2 emits the full monthly entries, but the `salary` line shows `(monthly_salary − advance_salary_q1)` and `transport` similarly. Provisiones, deducciones SS, retención, costo empleador siempre se calculan sobre el mes completo y se cargan TODOS al Q2.
- Warnings: `'Liquidación mensual: descontado anticipo Q1 de $X.XXX'`.

**Fallback for hires during Q2**: if `hire_date ∈ Q2` (no Q1 existed for this employee), Q2 acts as a normal Q2 from hire_date to end of month, no Q1 subtraction needed.

### 4.6 Builder responsibilities

`payroll-period-builder.ts` (sub-spec 2) gains:
- Read `app_flags.payment_mode`. Snapshot into the `PayrollComputeInput.period.paymentMode`.
- For Q2 periods in advance_settlement mode: lookup the Q1 period of the same month and pass its `payroll_entries` to the engine for the subtraction step.
- Set `payroll_periods.is_advance` based on the engine output.

### 4.7 Engine tests (extension)

In `src/lib/payroll-engine.test.ts` (extend the existing suite):
- Q1 advance: emits only salary + transport, no SS deductions.
- Q1 advance with hire mid-Q1: prorrateo correcto.
- Q1 fallback when termination ∈ Q1: full calculation, is_advance=false.
- Q2 settlement subtracts Q1 advance correctly.
- Q2 settlement with hire mid-Q2 (no Q1): no subtraction, normal calc.
- End-to-end: a complete month with Q1 + Q2 sums to the same totals as a single mensual period.

---

## 5 — Frontend: routes and components

### 5.1 New routes

| Route | Description |
|---|---|
| `/mi-pago` | Current period (selectable) with Sankey + breakdown |
| `/mi-pago/historial` | Year summary + chart + table |
| `/mi-pago/glosario` | Concept explanations + FAQ |

### 5.2 `/dashboard` modification (employee variant)

Insert a new card `<PayrollCard />` between the existing 5 KPI cards and "Mi equidad — últimos 3 meses".

`PayrollCard` props: `{ period: PayrollPeriod | null, totals: { devengado, deducciones, neto, provisiones } | null }`. Behavior:

- If `period === null`: empty state "Tu pago de [mes corriente] está siendo preparado." (gray card, no CTA).
- If `period.status === 'paid'`: "Te depositamos $X" (large, blue), 3 sub-numbers (devengado, deducciones, provisiones), button "Ver detalle" → `/mi-pago?period=<id>`.
- If `period.status === 'approved'` (not yet paid): "Tu pago está aprobado, esperando depósito" (green), same numbers, same CTA.
- If `period.is_advance === true` (Q1 advance): "Anticipo de Q1: $X. Liquidación completa en Q2." (light blue), CTA "Ver anticipo".

### 5.3 `/mi-pago` layout

```
┌─ Header (Card) ──────────────────────────────────────────┐
│ Mi pago — [Período: Abril 2026 ▾]   [⬇ Descargar PDF]   │
│ Período: 1 abr – 30 abr 2026 · Mensual · Pagado el 30 abr│
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Te depositamos en tu cuenta:    $2.825.095          │ │
│ │ [Devengado $3.049K] − [Deducciones $224K] = [Neto]  │ │
│ └──────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ Componentes (Card + visualización dual)                  │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Desktop (md+):  <PayrollSankey />                    │ │
│ │ Mobile  (md-):  <PayrollBreakdownList />             │ │
│ └──────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ Provisiones: "Lo que también ganaste este mes"           │
│ <PayrollProvisionsSection />                             │
├──────────────────────────────────────────────────────────┤
│ Detalle completo (acordeón)                              │
│ <PayrollDetailAccordion /> con todos los entries+rates   │
├──────────────────────────────────────────────────────────┤
│ Footer: aviso legal + link a glosario+FAQ                │
└──────────────────────────────────────────────────────────┘
```

**Selector de período** (dropdown del header): default = último período `paid` o `approved`. Las opciones incluyen los últimos 12 períodos visibles para este empleado. URL refleja con `?period=<id>`.

**Q1 advance variant**: si `is_advance=true`, el layout simplifica:
- Header: "Anticipo de la primera quincena — Abril 2026"
- Card: "Te depositamos $1.400.000 — Total devengado en este anticipo"
- Sin Sankey, sin provisiones, sin deducciones (porque no hubo).
- Mensaje: "Esto es un anticipo. Tu liquidación mensual completa, con recargos y deducciones, llegará en la segunda quincena (el 30 de abril)."

**Q2 settlement variant**: si `payment_mode='advance_settlement'` y este es un Q2:
- Header: "Liquidación de Abril 2026 — Segunda quincena"
- Sub-línea: "Anticipo Q1 ya pagado: −$1.400.000"
- El Sankey se construye sobre los TOTALES MENSUALES (Q1 + Q2 combinados), pero el "Te depositamos" muestra solo el neto Q2.

### 5.4 `<PayrollSankey />` (D3)

- Library: `d3-sankey` + `@types/d3-sankey`. ~30KB.
- 3 columnas:
  1. **Orígenes** (devengados): salary, transport, surcharge_*, overtime_*, bonus_*.
  2. **Hub** (devengado total): un solo nodo central.
  3. **Destinos**: cuenta del empleado (neto), salud, pensión, solidarity_pension, income_tax, otros descuentos.
- Cada nodo etiquetado con concepto + monto + porcentaje.
- Click en nodo → abre `<ConceptTooltip />` con la explicación + link "Aprende más" → `/mi-pago/glosario#<concept>`.
- Conceptos con monto $0 NO se renderizan (evita visual ruido).
- Aria labels para accesibilidad.

### 5.5 `<PayrollBreakdownList />` (mobile)

- Dos secciones:
  1. "Cómo se compuso tu pago bruto" — orígenes con barras de progreso normalizadas al total devengado.
  2. "Cómo se distribuye" — destinos con barras al total devengado.
- Cada fila: label + monto + % + ícono `(i)` que abre el mismo `<ConceptTooltip />`.

### 5.6 `<PayrollProvisionsSection />`

- Card con 4 filas: cesantías, intereses, prima, vacaciones.
- Cada fila: monto del mes + acumulado YTD + tooltip explicando cuándo se recibe.
- Total apartado del mes en el footer.

### 5.7 `<PayrollDetailAccordion />`

- Colapsado por default.
- 2 sub-secciones expandibles: "Devengados" y "Deducciones".
- Cada concepto con tabla: base, rate, amount, descripción.
- Útil para empleados que quieren ver tarifas exactas.

### 5.8 `<ConceptTooltip />`

Popover (radix `<Popover>`) con:
- Título del concepto.
- 1-2 oraciones del research §10.3.
- Link "Aprende más" → `/mi-pago/glosario#<concept-anchor>`.

### 5.9 `<PayrollCard />` (dashboard)

Ver §5.2.

### 5.10 `/mi-pago/historial` layout

```
┌─ Historial de pagos ─────────────────────────────────────┐
│ Año: [2026 ▾]                                            │
│ ┌─ Resumen YTD ──────────────────────────────────────┐  │
│ │ Devengado YTD · Deducciones YTD · Neto YTD         │  │
│ │ Provisiones acumuladas (cesantías/prima/vacaciones)│  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─ Bar chart: devengado mensual ─────────────────────┐  │
│ │  E F M A M J J A S O N D                            │  │
│ │  - - - ▰ - - - - - - - -                            │  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─ Tabla de períodos pagados ─────────────────────────┐  │
│ │ Período │ Frec │ Devengado │ Deducciones │ Neto │ →  │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

YTD computed from `payroll_entries` filtered to the year. Provisiones acumuladas: lee `accumulated_ytd` del último período del año.

### 5.11 `/mi-pago/glosario` layout

```
┌─ Glosario y preguntas frecuentes ────────────────────────┐
│ Conceptos                                                │
│ # Auxilio de transporte                                  │
│   Tooltip largo del research §10.3.                      │
│ # Salud 4%                                               │
│   ...                                                    │
│ # Cesantías                                              │
│   ...                                                    │
│ (9 conceptos del research §10.3)                         │
│                                                          │
│ Preguntas frecuentes                                     │
│ <Accordion> con las 7 preguntas del research §7         │
└──────────────────────────────────────────────────────────┘
```

Anchor links para que `<ConceptTooltip />` pueda linkear a la sección correcta (`#salud-4`, `#cesantias`, etc.).

---

## 6 — Hook `useMyPayroll`

`src/hooks/use-my-payroll.ts`:

```ts
export interface UseMyPayrollResult {
  loading: boolean;
  period: PayrollPeriod | null;
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
  availablePeriods: PayrollPeriod[];   // for dropdown
  refetch: () => void;
}

export function useMyPayroll(periodId?: string): UseMyPayrollResult;
```

Internally:
1. Fetch `availablePeriods` for the user (`status ∈ ('approved','paid')` ordered desc).
2. Resolve `periodId` (default = first available).
3. Parallel fetch of `payroll_entries`, `payroll_provisions`, `payroll_employer_cost` for that period+user.
4. Subscribe to `postgres_changes` on `payroll_periods` for INSERT/UPDATE — refetch on relevant change (status changed to approved/paid for any period that contains me).
5. Authentication-gated (use `useAuth().user` like `useEquityRollups`).

---

## 7 — PDF download

`src/lib/payroll-pdf.ts`:

```ts
export function generatePayrollPdf(input: {
  employee: { first_name, last_name, email };
  period: PayrollPeriod;
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
}): Blob;
```

Uses `jspdf` + `jspdf-autotable` (already in repo).

PDF structure:
- Header: "Comprobante de pago de nómina" + nombre empresa (placeholder hardcoded "App Horarios" — TODO: configurable in sub-spec 4) + nombre empleado + período.
- Tabla "Devengados": concept, base, rate, amount.
- Tabla "Deducciones": concept, base, rate, amount.
- Subtotales: Total devengado, Total deducciones, **Neto a pagar** (en bold).
- Tabla "Provisiones del mes": concept, amount, accumulated_ytd.
- Footer (research §10.4 obligatorio):
  > "Aviso legal: Este comprobante es informativo y fue generado a partir de los datos ingresados por el empleador. El documento oficial de pago de nómina es el Documento Soporte de Pago de Nómina Electrónica emitido ante la DIAN. En caso de discrepancia, prevalece el documento DIAN."

Filename: `colilla-{first_name}-{last_name}-{period_start}.pdf`.

---

## 8 — Helpers (puros)

`src/lib/payroll-employee-helpers.ts`:

```ts
export interface SankeyData {
  nodes: Array<{ id: string; label: string; value: number; category: 'origin' | 'hub' | 'destination' }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export function aggregateEntriesForSankey(
  entries: PayrollEntry[],
  netToBank: number
): SankeyData;
// Construye 3 columnas: orígenes (devengados con monto > 0), hub central, destinos (neto + cada deducción con monto > 0).

export function computeYtdSummary(
  entries: PayrollEntry[],
  provisions: PayrollProvision[],
  year: number
): {
  devengado: number;
  deducciones: number;
  neto: number;
  cesantiasYtd: number;
  primaYtd: number;
  vacacionesYtd: number;
  cesantiasInterestYtd: number;
};

export function computeNetToBank(entries: PayrollEntry[]): number;
// devengado − deducciones.

export interface PdfPayload { /* shape passed to generatePayrollPdf */ }
export function formatPdfPayload(
  employee, period, entries, provisions
): PdfPayload;
```

All pure, all unit-tested with Vitest.

---

## 9 — Testing

### 9.1 Vitest

`src/lib/payroll-employee-helpers.test.ts`:
- `aggregateEntriesForSankey`: standard case, Q1 advance (only salary+transport), case con $0 conceptos (no se incluyen).
- `computeYtdSummary`: año vacío, año con 4 períodos.
- `computeNetToBank`: con/sin retención.
- `formatPdfPayload`: campos esperados presentes.

`src/lib/payroll-engine.test.ts` (extend):
- Q1 advance entries.
- Q1 fallback (termination en Q1).
- Q2 subtraction.
- Hire mid-Q2 (no Q1).
- Suma Q1+Q2 = mensual completo.

### 9.2 No SQL tests nuevos

El trigger de notificación es lineal (un INSERT por empleado del período). El realtime es config. No requieren tests.

### 9.3 No tests de componentes

Consistente con el repo.

---

## 10 — Edge cases

| Caso | Manejo |
|---|---|
| Empleado sin períodos | Empty state en card + en `/mi-pago`. |
| Empleado con períodos draft | No se muestran (filtrados por status). |
| Empleado retirado | Sigue viendo histórico. Card muestra último pago + badge "Empleado retirado". |
| Período `paid` reabierto a draft | Realtime hace que la card cambie a "Tu pago está siendo revisado". |
| Conceptos $0 (retención no aplica, etc.) | No se renderizan en Sankey ni breakdown list. Sí en detalle completo. |
| Sankey en pantalla < md | Hidden, mobile breakdown list visible. |
| Q1 advance con hire/termination mid-Q1 | hire: prorrateo desde hire al fin Q1. termination: fallback a Q1 completo (no anticipo). |
| Q2 settlement sin Q1 (empleado entró mid-Q2) | No subtracción. Q2 calcula desde hire al fin del mes. |
| Q2 settlement con dos Q1s del mismo mes | Imposible: el trigger `payroll_periods_reject_overlap_trg` (sub-spec 2 mig 029) impide insertar períodos solapados. |
| Glosario referenciado por anchor inexistente | Fallback a top de la página (browser default). |
| Empleado tiene período que cambió de mensual a quincenal mid-año | Cada período guarda su `frequency` snapshot, no hay confusión. |
| Realtime no entrega evento (red) | Refetch manual al cambiar de tab del navegador (Page Visibility API), o botón de refresh en `/mi-pago`. |
| PDF descargado por empleado con dudas | El disclaimer legal cubre liability. Footer muy visible. |

---

## 11 — Out of scope (sub-specs futuras)

- Email transactional al aprobar período (sub-spec 4 — Resend setup).
- Liquidación final por terminación (sub-spec 4).
- DIAN nómina electrónica (CUNE / DSPNE).
- PILA file generation.
- Empleado puede solicitar correcciones desde `/mi-pago`.
- Multi-currency.
- Configuración de empresa en PDF (NIT, logo, dirección).

---

## 12 — Summary of deliverables

**Migrations (1):**
- `030_payroll_employee_realtime_notifs.sql` — realtime publication, notification trigger, `is_advance` column, `payment_mode` flag.

**Files to create (~14):**
- `src/lib/payroll-employee-helpers.ts` + `.test.ts`
- `src/lib/payroll-pdf.ts`
- `src/hooks/use-my-payroll.ts`
- `src/components/dashboard/payroll-card.tsx`
- `src/components/mi-pago/payroll-header.tsx`
- `src/components/mi-pago/payroll-sankey.tsx`
- `src/components/mi-pago/payroll-breakdown-list.tsx`
- `src/components/mi-pago/payroll-provisions-section.tsx`
- `src/components/mi-pago/payroll-detail-accordion.tsx`
- `src/components/mi-pago/concept-tooltip.tsx`
- `src/app/(authenticated)/mi-pago/page.tsx`
- `src/app/(authenticated)/mi-pago/historial/page.tsx`
- `src/app/(authenticated)/mi-pago/glosario/page.tsx`

**Files to modify (~4):**
- `src/lib/types.ts` (add `PaymentMode`)
- `src/lib/payroll-engine.ts` (advance/settlement logic)
- `src/lib/payroll-period-builder.ts` (read payment_mode, pass to engine, lookup Q1 for Q2)
- `src/components/dashboard/employee-dashboard.tsx` (mount `PayrollCard`)
- `src/components/settings/payment-frequency-selector.tsx` (add `payment_mode` selector when frequency=quincenal)

**New dependency:** `d3-sankey` + `@types/d3-sankey`.
