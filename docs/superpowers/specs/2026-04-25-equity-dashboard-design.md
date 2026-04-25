# Equity Dashboard — Design

**Status:** Spec
**Date:** 2026-04-25
**Owner:** Simon Urrego

This is a follow-up to `2026-04-22-schedule-equity-model-design.md` §7 item #2 ("Central equity dashboard"). The data primitives (`employee_equity_rollups`, `staffing_requirements`, contract caps) already exist; this spec defines the screen that consumes them.

---

## 1 — Goal

A single screen for admin and manager to see, for each sede, **how is current coverage going** (operational) and **how is workload distributed across employees** (equity), in a chosen month range.

Primary user question this answers: *"¿Cómo va la cobertura del mes actual por sede, y quién está cargado de más?"*

Out of scope (deferred to future specs):
- Click-to-drill in coverage heatmap.
- PDF/Excel export.
- Realtime subscription (manual refresh button instead).
- Employee self-view (`/mi-equidad`).
- Cross-sede global comparison view.

---

## 2 — Audience and Access

- **`role='admin'`**: sees a tab per sede.
- **`role='manager'`**: sees only their own sede (single tab).
- **`role='employee'`**: 404 (route guard at the page level, same pattern as `/contract-types`).

RLS already enforces this server-side: `employee_equity_rollups` allows admin (all) and manager (own sede), and `schedule_entries`/`schedules`/`staffing_requirements` are similarly restricted. No new policies.

---

## 3 — Route and Sidebar

- New top-level operational route: `/equidad`.
- Sidebar: insert between "Horarios" and "Empleados", visible to admin and manager only.
- Page file: `src/app/(authenticated)/equidad/page.tsx` (`"use client"`).

---

## 4 — Layout

```
┌──────────────────────────────────────────────────────────┐
│ Equidad                                                  │
│ Subtítulo                                                │
│ ┌─ period-range-picker ─┐  [☐ Incluir borradores] [↻]   │
│ │  Mes inicio · Mes fin │                                │
│ └───────────────────────┘                                │
├──────────────────────────────────────────────────────────┤
│ [Sede A][Sede B][Sede C]   ← tabs (admin only; manager   │
│                              sees just their sede)       │
├──────────────────────────────────────────────────────────┤
│ ┌─ Cobertura operativa ──────────────────────────────┐   │
│ │  KPI: 92%        │  Asignados 184 / Requeridos 200 │   │
│ │  ────────────────────────────────────────────────  │   │
│ │  Por posición                                      │   │
│ │  Aux. Admin (Farmacia)  84/90  93%  ▰▰▰▰▰▰▰▰▱      │   │
│ │  Aux. Admin (Recepción) 100/110 91% ▰▰▰▰▰▰▰▰▰▱     │   │
│ │  ────────────────────────────────────────────────  │   │
│ │  Heatmap día × turno                               │   │
│ │  [grid]                                            │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Carga / equidad ──────────────────────────────────┐   │
│ │  Empleado          Turnos  D    S    N    F   Hrs  │   │
│ │                            μ=2  μ=2 μ=0  μ=0 μ=160 │   │
│ │  Valentina Celis    30     4🟡  4🟡 0    2   240🔴 │   │
│ │  Por Contratar      30     4🟡  4🟡 0    2   240🔴 │   │
│ │  Sara Romero        30     4🟡  4🟡 0    2   240🔴 │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 4.1 Period range picker

Two `<Input type="month">` (start, end) plus a "Hoy" button that sets both to the current month. Default on page load: `[currentMonth, currentMonth]`. Validates `start ≤ end`; if violated, swaps silently.

### 4.2 Drafts toggle

A `<Switch>` labeled "Incluir borradores", default OFF. When ON, includes `schedules.status='draft'` in addition to `'published'` for both coverage and equity calculations.

### 4.3 Refresh button

Plain icon button (`<RefreshCw>`) next to the toggle. Re-runs all fetches. No realtime for this page.

---

## 5 — Section A: Cobertura operativa

For each sede × selected period:

### 5.1 KPI tarjeta

`% cobertura = slots_asignados / slots_requeridos`

- Color thresholds (helper `coverageColor`):
  - `≥ 95%` → green
  - `80% ≤ x < 95%` → amber
  - `< 80%` → red
- Tooltip: `"X asignados de Y requeridos"`.
- If `slots_requeridos = 0` → show `"Sin necesidades configuradas"` and hide the rest of section A.

### 5.2 Tabla por posición

Columns: Posición, Asignados, Requeridos, %, barra horizontal.

- Sorted by `%` ascending (worst first).
- Bar uses the same color gradient as the KPI.

### 5.3 Heatmap día × turno

- **When range = 1 month**: rows = `shift_templates` active in the sede; columns = days of that month (1..31). Cell = `% coverage` of `(date, shift_template)` pair, colored with `coverageColor`.
- **When range > 1 month**: rows = `shift_templates`; columns = day-of-week (L M X J V S D, JS convention 0=Sun...6=Sat → display L M X J V S D). Cell = average `% coverage` for that `(day_of_week, shift_template)` across all months in range.
- No click-to-drill (out of scope).

### 5.4 Cómputo

```
slots_requeridos = Σ over staffing_requirements where
   sr.position_id ∈ positions of sede
   AND sr.day_of_week matches a date in [periodStart..periodEnd]

slots_asignados = COUNT(schedule_entries) where
   se.schedule_id ∈ schedules of sede with status filter
   AND se.date ∈ [periodStart..periodEnd]
```

For the heatmap (single-month variant): group `schedule_entries` by `(date, shift_template_id)`; group `staffing_requirements` by matching `day_of_week`. Per-cell `% = assigned / required`.

For the heatmap (multi-month variant): group `schedule_entries` by `(EXTRACT(DOW FROM date), shift_template_id)`; group `staffing_requirements` by `(day_of_week, shift_template_id)`. Required is multiplied by `count of dates in the period that match each day_of_week`.

---

## 6 — Section B: Carga / equidad

For each sede × selected period:

### 6.1 Tabla leaderboard

Columns: Empleado, Turnos, D, S, N, F, Horas.

- One row per `profile` with `is_active=true` and `location_id = sede.id`.
- `Turnos` = count of `schedule_entries` of the employee in the period (filtered by toggle).
- `D` = `Σ sundays_worked` from `employee_equity_rollups` filtered to `(year, month) ∈ range`.
- `S` = `Σ saturdays_worked`.
- `N` = `Σ nights_worked`.
- `F` = `Σ holidays_worked`.
- `Horas` = `Σ total_hours`, rounded to integer for display.
- Header is sortable on every column. Default sort: by `Horas` desc.
- Header subtitle row shows `μ` for each numeric column (e.g. `D · μ=2.1`).

### 6.2 Coloreado por celda (D, S, N, F, Horas)

For each column:
- Compute `μ` (mean) and `σ` (stdDev) over the values present in this sede tab.
- Per-cell `z = (value - μ) / σ`; if `σ = 0`, force green for all cells in that column.
- Bands (helper `zScoreColor`), symmetric:
  - `z ≥ 1.5` → red (sobrecargado)
  - `0.5 ≤ |z| < 1.5` → yellow (algo desviado, en cualquier dirección)
  - `|z| < 0.5` → green (≈ promedio)
  - `z ≤ -1.5` → blue (subcargado)

### 6.3 Click en row

Opens the existing `<EmployeeEquityPanel>` as a `<Sheet>` (side sheet), same component already used in `/empleados` and `/schedule`.

### 6.4 Cómputo

Pure JS aggregation over the rollups fetched once for the whole page:

```ts
const sumByEmployee = rollups
  .filter(r => inRange(r.year, r.month, periodStart, periodEnd)
            && employeeIds.includes(r.employee_id))
  .reduce((acc, r) => {
    const cur = acc.get(r.employee_id) ?? blank();
    cur.D += r.sundays_worked;
    cur.S += r.saturdays_worked;
    cur.N += r.nights_worked;
    cur.F += r.holidays_worked;
    cur.Horas += Number(r.total_hours);
    return acc.set(r.employee_id, cur);
  }, new Map());
```

---

## 7 — Data fetching

A single `useEquidadDashboard(periodStart, periodEnd, includeDrafts)` hook owns all reads. Inside one `useEffect`, fetches in parallel:

| # | Table | Filter |
|---|---|---|
| 1 | `profiles` | `is_active=true` (admin: all sedes; manager: own sede via RLS) |
| 2 | `positions` | all |
| 3 | `staffing_requirements` | all (small table) |
| 4 | `shift_templates` | all |
| 5 | `schedules` | `(year, month) ∈ range` AND `status ∈ {'published'}` (or `'published','draft'` if toggle ON) |
| 6 | `schedule_entries` | `schedule_id ∈ ids from #5` |
| 7 | `employee_equity_rollups` | `(year, month) ∈ range` AND `employee_id ∈ ids from #1` |

The hook returns:

```ts
{
  loading: boolean,
  sedes: Location[],            // visible sedes given role
  byLocation: Map<sedeId, {
    coverage: { kpi, byPosition, heatmap },
    equity:   { rows, columnStats }
  }>,
  refetch: () => void,
}
```

All aggregation happens in `useMemo` over the raw fetched data, not in the database.

---

## 8 — Components

All under `src/components/equidad/`:

| File | Responsibility |
|---|---|
| `period-range-picker.tsx` | Two month inputs + "Hoy" button. Controlled component. |
| `coverage-section.tsx` | KPI + by-position table + heatmap. Reads pre-computed `coverage` from hook. |
| `coverage-heatmap.tsx` | Pure presentation grid; receives a `Cell[][]` matrix. |
| `equity-leaderboard.tsx` | Sortable table with z-score-colored cells. Opens `EmployeeEquityPanel` on row click. |

The page itself (`equidad/page.tsx`) orchestrates: period state, drafts toggle, role check, sede tabs, side-sheet state.

---

## 9 — Helpers

Extend `src/lib/equity-helpers.ts`:

```ts
export function meanStdDev(values: number[]): { mean: number; stdDev: number };
export function zScoreColor(
  value: number, mean: number, stdDev: number
): "blue" | "green" | "yellow" | "red";
export function coverageColor(percent: number): "red" | "yellow" | "green";
export function enumerateMonthRange(
  startISO: string, endISO: string
): Array<{ year: number; month: number }>;
export function requiredSlots(
  reqs: StaffingRequirement[], dates: Date[]
): number;
```

All pure, all unit-tested in `src/lib/equity-helpers.test.ts`.

---

## 10 — Edge cases

| Case | Handling |
|---|---|
| Sede has no employees | Leaderboard shows "No hay empleados en esta sede"; coverage section still renders if reqs exist |
| Sede has no `staffing_requirements` | Section A hidden with note "Sin necesidades configuradas"; Section B unaffected |
| `periodStart > periodEnd` | Swap silently in the hook |
| `σ = 0` in a column | All cells colored green |
| `slots_requeridos = 0` for a position row | Hide that row (don't show 0/0 = NaN%) |
| Toggle change mid-loading | Cancel previous fetch via `cancelled` flag (same pattern as `useEquityRollups`) |
| Range spans >12 months | Allowed, but query payload grows linearly; YAGNI to optimize |
| Manager opens admin URL with another sede | RLS returns empty data; UI shows the empty state, no error |

---

## 11 — Testing

Vitest unit tests in `src/lib/equity-helpers.test.ts` (extend existing file):

- `meanStdDev`: empty array, single value (σ=0), uniform values, typical scatter.
- `zScoreColor`: each band including boundaries (z=0.5, 1.5).
- `coverageColor`: boundaries 80, 95.
- `enumerateMonthRange`: same month, crosses year, start > end (asserts swap behavior).
- `requiredSlots`: month with 4 vs 5 occurrences of a weekday; multiple reqs same day_of_week.

No component tests (consistent with rest of repo).

No SQL tests (no DB changes).

---

## 12 — Out of scope

Explicitly deferred:

1. Click-to-drill on coverage heatmap day → modal with shortage detail.
2. Export PDF / Excel.
3. Realtime subscription on rollups for this page (manual refresh button is enough; the rollups change on schedule edits which are infrequent enough that staleness on this dashboard is acceptable).
4. Employee self-view at `/mi-equidad` (separate spec).
5. Cross-sede global comparison ("all sedes at a glance" tab).
6. "Bad shifts" and opener/closer dimensions (still deferred per parent spec §7).

---

## 13 — Summary of deliverables

**No DB migrations.**

**Code files to create (6):**
- `src/app/(authenticated)/equidad/page.tsx`
- `src/components/equidad/period-range-picker.tsx`
- `src/components/equidad/coverage-section.tsx`
- `src/components/equidad/coverage-heatmap.tsx`
- `src/components/equidad/equity-leaderboard.tsx`
- `src/hooks/use-equidad-dashboard.ts`

**Code files to modify (2):**
- `src/lib/equity-helpers.ts` (+ `.test.ts`)
- `src/components/layout/sidebar.tsx` (add item)

**No types added** — existing `EmployeeEquityRollup`, `StaffingRequirement`, etc. cover the surface.
