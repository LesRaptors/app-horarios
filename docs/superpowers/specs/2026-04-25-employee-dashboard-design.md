# Employee Dashboard (Self-Equity View) — Design

**Status:** Spec
**Date:** 2026-04-25
**Owner:** Simon Urrego

Follow-up to `2026-04-22-schedule-equity-model-design.md` §7 item #3 ("Employee self-view of their equity"). Replaces what `role='employee'` sees at `/dashboard` with a richer, equity-aware home view. Admins and managers continue to see the existing `/dashboard` layout — unchanged.

---

## 1 — Goal

Give a logged-in employee a single screen at `/dashboard` that answers, at a glance:
- *"What's my workload right now?"* (turnos del mes, horas semana, próximo turno)
- *"How am I tracking against contract caps?"* (Domingos Q, Festivos Q)
- *"How am I doing against monthly targets?"* (Sábados, Noches)
- *"What's coming up?"* (lista de próximos turnos)
- *"How does my equity stand vs my own history?"* (3-month table)

Out of scope:
- Comparativa vs compañeros / sede (explicitly rejected during brainstorming to avoid social-comparison anxiety).
- Acciones desde el dashboard (pedir día libre, intercambio) — siguen viviendo en `/solicitudes`.
- Histórico más allá de 3 meses; gráficos avanzados.

---

## 2 — Audience and Access

- **`role='employee'`**: sees the new layout described here.
- **`role='admin'` and `role='manager'`**: see the existing `/dashboard` (no behavior change).
- All data filtering is done by RLS at the DB layer (rollups, schedule_entries, etc). The page does not duplicate access checks beyond reading `auth.uid()` for queries.

---

## 3 — Route and Sidebar

- **Route**: `/dashboard` — unchanged.
- **Sidebar**: "Dashboard" item — unchanged.
- The split lives in `src/app/(authenticated)/dashboard/page.tsx`: it inspects `profile.role` and either renders `<EmployeeDashboard />` (new) or the existing inline JSX (admin/manager).

---

## 4 — Layout (employee variant)

```
┌─ Hola, [Nombre] · Empleado ─────────────────────────────┐
│                                                          │
│ ┌─ KPIs (5 tarjetas) ────────────────────────────────┐  │
│ │ Turnos del mes │ Horas esta semana │ Próximo turno │  │
│ │ Domingos Q     │ Festivos Q                        │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Equidad — últimos 3 meses ─────────────────────────┐ │
│ │ tabla Dom/Sáb/Noches/Festivos/Horas × 3 meses       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Caps trimestrales (Q2 2026) ────────────────────┐   │
│ │ Domingos  3/6  ▰▰▰▰▰▱                           │   │
│ │ Festivos  1/3  ▰▰▱▱▱▱                           │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Targets del mes (Abril 2026) ──────────────────┐    │
│ │ Sábados 2 / target 2 ▰▰▰▰▰▰ (verde)             │    │
│ │ Noches  0 / target 4 ▰▱▱▱▱▱ (rojo, lejos)       │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Próximos turnos ────────────────────────────────┐   │
│ │ Vie 26 Abr · 06:00–14:00 · Aux. Admin (Farmacia) │   │
│ │ Sáb 27 Abr · 14:00–22:00 · Aux. Admin (Farmacia) │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.1 KPIs (5 tarjetas)

Grid responsivo (3 cols desktop, 2 tablet, 1 mobile).

| Tarjeta | Valor | Subtítulo |
|---|---|---|
| Turnos del mes | `count(schedule_entries WHERE employee_id=me, date in current month, status published, overtime_status != rejected)` | "asignados" |
| Horas esta semana | `Σ(end-start) for current week (Mon-Sun) entries`; mostrado como `X / max_hours_per_week` (del `profiles`) | "" |
| Próximo turno | next future entry: fecha relativa ("Hoy"/"Mañana"/"Vie 26 Abr") + hora + posición | "" o "Sin turnos próximos" |
| Domingos Q[N] [Year] | sum sundays_worked en Q actual | "X / max" del contrato |
| Festivos Q[N] [Year] | sum holidays_worked en Q actual | "X / max" del contrato |

### 4.2 Equidad — últimos 3 meses

Tabla idéntica al bloque "Equidad — últimos 3 meses" del actual `EmployeeEquityPanel`. **Refactor incluido**: extraer ese bloque a `src/components/equidad/three-month-table.tsx` y consumirlo desde el panel y desde el dashboard.

### 4.3 Caps trimestrales

Las dos `<CapBar>` que ya están en el panel actual (Domingos, Festivos). **Refactor incluido**: extraer `CapBar` a `src/components/equidad/cap-bar.tsx`.

### 4.4 Targets del mes

Barras nuevas para `target_saturdays_per_month` y `target_nights_per_month` del contrato del empleado, vs el valor actual del mes en curso.

Coloreo (helper `softTargetColor`):
- `value` está dentro del rango `[target * 0.8, target * 1.2]` → **green**
- `value` entre `[target * 0.5, target * 0.8)` o `(target * 1.2, target * 1.5]` → **yellow**
- fuera de eso → **red**

Si `target = 0` o `null` para una de las dos métricas → la barra se oculta. Si las dos son null/0 → la sección entera se oculta.

### 4.5 Próximos turnos

Lista vertical de hasta 7 turnos futuros con `schedule.status='published'` y `overtime_status != 'rejected'`, ordenados por fecha asc. Cada item: fecha relativa (Hoy/Mañana/`<dow> dd <mes>`) + hora + posición.

Si no hay → "No tienes turnos programados".

---

## 5 — Data fetching

Single hook `useMyEquityDashboard()` in `src/hooks/use-my-equity-dashboard.ts`. Returns:

```ts
{
  loading: boolean;
  contract: ContractType | null;
  position: Position | null;
  rollups: EmployeeEquityRollup[];   // 1+ year worth, for 3-month table + Q caps
  upcomingShifts: Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    position: { id: string; name: string } | null;
  }>;
  shiftsThisMonth: number;
  hoursThisWeek: number;
  hoursWeekMax: number;              // profile.max_hours_per_week
}
```

Internally fetches in parallel:

| # | Table | Filter |
|---|---|---|
| 1 | `profiles` | `id = user.id`, joined with `position`, `contract_type` |
| 2 | `employee_equity_rollups` | `employee_id = user.id`, `year >= currentYear - 1` |
| 3 | `schedule_entries` (single combined query) | `employee_id = user.id`, `overtime_status != 'rejected'`, joined with `schedule` (status filter), `position` (for label). Filters in client: `upcoming` = `date >= today` (limit 7 by sort+slice); `thisMonth` = matches current `(year, month)` of any schedule; `thisWeek` = `date BETWEEN startOfWeek AND endOfWeek`. |

The "single combined query" approach keeps round-trips low; client-side splits are cheap given these are the user's own rows (50-200 employees × 30 days = ≤6000 entries even if everyone hit this path simultaneously, but each user only fetches their own).

---

## 6 — Components

| File | Status | Responsibility |
|---|---|---|
| `src/components/dashboard/employee-dashboard.tsx` | create | Orchestrator; reads hook, lays out sections |
| `src/components/dashboard/employee-kpi-cards.tsx` | create | Pure render of 5 cards |
| `src/components/dashboard/upcoming-shifts-list.tsx` | create | Pure render of next-7 list |
| `src/components/dashboard/monthly-targets.tsx` | create | Soft-target bars (Sáb / Noches) |
| `src/components/equidad/cap-bar.tsx` | create (extract) | The bar component used for Q caps |
| `src/components/equidad/three-month-table.tsx` | create (extract) | The 3-month rollup table |
| `src/components/schedule/employee-equity-panel.tsx` | modify | Consume the two extractions instead of inlining |
| `src/app/(authenticated)/dashboard/page.tsx` | modify | Branch by `profile.role` |

---

## 7 — Helpers

Extend `src/lib/equity-helpers.ts`:

```ts
export function softTargetColor(
  value: number, target: number
): "green" | "yellow" | "red";

export function startOfWeekISO(date: Date): string; // YYYY-MM-DD, Monday
export function endOfWeekISO(date: Date): string;   // YYYY-MM-DD, Sunday
```

Tests in `src/lib/equity-helpers.test.ts`:
- `softTargetColor`: target=0 (caller hides — not exercised; document); typical scatter incl. boundaries (`value = 0.8*target`, `1.2*target`, `0.5*target`, `1.5*target`).
- `startOfWeekISO` / `endOfWeekISO`: a Monday → start=that date, end=Sunday +6; a Sunday → start=last Monday, end=that date; cross-month (date 2026-04-30 Thursday → start 2026-04-27, end 2026-05-03).

---

## 8 — Edge cases

| Case | Handling |
|---|---|
| Employee with no contract assigned (rare; default "Sin definir" caps=999) | Domingos Q / Festivos Q KPI cards show `X / —`; bars hidden |
| Employee with no position | "Próximo turno" subtitle shows "Sin posición" if it lands |
| No upcoming shifts | KPI card → "Sin turnos próximos"; list section → "No tienes turnos programados" |
| No rollups for the month yet | 3-month table shows zeros for that month; turnos-del-mes = 0 |
| Soft target = 0 or null | That bar hidden; if both null, "Targets del mes" section hidden |
| Shift crosses midnight | Render `06:00-14:00`; no special marker |
| Manager opens `/dashboard` | Sees existing admin/manager dashboard (unchanged) |

---

## 9 — Testing

- Unit tests: 3 new helpers (above).
- No component tests (consistent with the repo).
- No SQL tests (no DB changes).

---

## 10 — Out of scope

- Pending overtime UI on the dashboard (employee already sees it on `/schedule` with the amber dashed border).
- Histórico beyond 3 months.
- Cross-employee comparison / sede comparison.
- Charts beyond simple bars and tables.
- Mobile-specific layout polish (uses standard responsive grid).

---

## 11 — Summary of deliverables

**No DB migrations.**

**Files to create (7):**
- `src/components/dashboard/employee-dashboard.tsx`
- `src/components/dashboard/employee-kpi-cards.tsx`
- `src/components/dashboard/upcoming-shifts-list.tsx`
- `src/components/dashboard/monthly-targets.tsx`
- `src/components/equidad/cap-bar.tsx`
- `src/components/equidad/three-month-table.tsx`
- `src/hooks/use-my-equity-dashboard.ts`

**Files to modify (3):**
- `src/app/(authenticated)/dashboard/page.tsx`
- `src/components/schedule/employee-equity-panel.tsx`
- `src/lib/equity-helpers.ts` + `.test.ts`
