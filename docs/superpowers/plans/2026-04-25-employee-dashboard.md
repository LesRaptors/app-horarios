# Employee Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace what `role='employee'` sees at `/dashboard` with the equity-rich layout described in `docs/superpowers/specs/2026-04-25-employee-dashboard-design.md`. Admin/manager dashboard unchanged.

**Architecture:** `dashboard/page.tsx` branches by `profile.role`. The employee branch renders a new `<EmployeeDashboard />` orchestrator that consumes one hook (`useMyEquityDashboard`) and lays out: 5 KPI cards, 3-month rollup table, Q-cap bars, monthly soft-target bars, upcoming-shifts list. Two reusable bits (`CapBar`, `ThreeMonthTable`) are extracted from the existing `EmployeeEquityPanel` so both consumers (panel + new dashboard) share them.

**Tech Stack:** Next.js 14 App Router (`"use client"`), React, TypeScript, Tailwind v3, shadcn/ui, Supabase JS, Vitest for pure logic.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/equity-helpers.ts` | modify | Add 3 pure helpers: `softTargetColor`, `startOfWeekISO`, `endOfWeekISO` |
| `src/lib/equity-helpers.test.ts` | modify | Vitest tests for the 3 new helpers |
| `src/components/equidad/cap-bar.tsx` | create | `<CapBar>` extracted from `EmployeeEquityPanel` |
| `src/components/equidad/three-month-table.tsx` | create | 3-month rollup table extracted from `EmployeeEquityPanel` |
| `src/components/schedule/employee-equity-panel.tsx` | modify | Replace inline blocks with imports of the two extractions |
| `src/hooks/use-my-equity-dashboard.ts` | create | Single fetch hook for the employee dashboard |
| `src/components/dashboard/employee-kpi-cards.tsx` | create | 5 KPI cards |
| `src/components/dashboard/monthly-targets.tsx` | create | Soft-target bars (Sáb / Noches) |
| `src/components/dashboard/upcoming-shifts-list.tsx` | create | Próximos turnos list |
| `src/components/dashboard/employee-dashboard.tsx` | create | Orchestrator |
| `src/app/(authenticated)/dashboard/page.tsx` | modify | Branch by `profile.role` |

---

## Convention reminders

- **Spanish UI** with normalized accents.
- **No emojis** in source files (use lucide icons).
- All data access via `createClient()` from `@/lib/supabase/client`.
- `useAuth()` for user/profile/role.
- `day_of_week` JS convention: `0=Sun, 1=Mon, ..., 6=Sat`.
- `schedules.month` is 1-indexed in DB; `Date.getMonth()` is 0-indexed in JS.
- Run `npm run test` and `npm run build` before each commit.

---

## Task 1: Add `softTargetColor` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

`softTargetColor(value, target)` returns:
- `"green"` when `value` ∈ `[target * 0.8, target * 1.2]`
- `"yellow"` when in `[target * 0.5, target * 0.8)` or `(target * 1.2, target * 1.5]`
- `"red"` otherwise

Caller is responsible for hiding when `target ≤ 0` (so the function isn't exercised in that case).

- [ ] **Step 1: Write the failing tests**

Add `softTargetColor` to the existing import list at the top of `src/lib/equity-helpers.test.ts`. Append:

```ts
describe("softTargetColor", () => {
  it("value at target → green", () => {
    expect(softTargetColor(4, 4)).toBe("green");
  });

  it("value within ±20% → green (boundaries)", () => {
    expect(softTargetColor(3.2, 4)).toBe("green"); // 0.8×
    expect(softTargetColor(4.8, 4)).toBe("green"); // 1.2×
  });

  it("just outside ±20% but within ±50% → yellow", () => {
    expect(softTargetColor(2, 4)).toBe("yellow");   // 0.5×
    expect(softTargetColor(6, 4)).toBe("yellow");   // 1.5×
    expect(softTargetColor(3.1, 4)).toBe("yellow"); // < 0.8×
    expect(softTargetColor(4.9, 4)).toBe("yellow"); // > 1.2×
  });

  it("outside ±50% → red", () => {
    expect(softTargetColor(1, 4)).toBe("red");      // 0.25×
    expect(softTargetColor(7, 4)).toBe("red");      // 1.75×
    expect(softTargetColor(0, 4)).toBe("red");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: FAIL — `softTargetColor is not defined`.

- [ ] **Step 3: Implement `softTargetColor`**

Append to `src/lib/equity-helpers.ts`:

```ts
export function softTargetColor(
  value: number,
  target: number
): "green" | "yellow" | "red" {
  const lo20 = target * 0.8;
  const hi20 = target * 1.2;
  const lo50 = target * 0.5;
  const hi50 = target * 1.5;
  if (value >= lo20 && value <= hi20) return "green";
  if (value >= lo50 && value <= hi50) return "yellow";
  return "red";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(dashboard): add softTargetColor helper"
```

---

## Task 2: Add `startOfWeekISO` + `endOfWeekISO` helpers + tests (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

Convention: week is **Monday → Sunday**.

- [ ] **Step 1: Write the failing tests**

Add `startOfWeekISO`, `endOfWeekISO` to the import list. Append:

```ts
describe("startOfWeekISO / endOfWeekISO (Monday → Sunday)", () => {
  it("a Monday returns itself as start, +6 as end", () => {
    // 2026-04-06 is a Monday
    const d = new Date("2026-04-06T12:00:00");
    expect(startOfWeekISO(d)).toBe("2026-04-06");
    expect(endOfWeekISO(d)).toBe("2026-04-12");
  });

  it("a Sunday rolls back to last Monday and ends on itself", () => {
    // 2026-04-12 is a Sunday
    const d = new Date("2026-04-12T12:00:00");
    expect(startOfWeekISO(d)).toBe("2026-04-06");
    expect(endOfWeekISO(d)).toBe("2026-04-12");
  });

  it("a Wednesday picks Monday-of-week and Sunday-of-week", () => {
    // 2026-04-08 is a Wednesday
    const d = new Date("2026-04-08T12:00:00");
    expect(startOfWeekISO(d)).toBe("2026-04-06");
    expect(endOfWeekISO(d)).toBe("2026-04-12");
  });

  it("crosses month boundary", () => {
    // 2026-04-30 is a Thursday → start = 2026-04-27 (Mon), end = 2026-05-03 (Sun)
    const d = new Date("2026-04-30T12:00:00");
    expect(startOfWeekISO(d)).toBe("2026-04-27");
    expect(endOfWeekISO(d)).toBe("2026-05-03");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: FAIL.

- [ ] **Step 3: Implement the two helpers**

Append to `src/lib/equity-helpers.ts`:

```ts
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeekISO(date: Date): string {
  const dow = date.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow; // Sun -> -6, Mon -> 0, Tue -> -1, ...
  const start = new Date(date);
  start.setDate(date.getDate() + offsetToMonday);
  return toISO(start);
}

export function endOfWeekISO(date: Date): string {
  const dow = date.getDay();
  const offsetToSunday = dow === 0 ? 0 : 7 - dow;
  const end = new Date(date);
  end.setDate(date.getDate() + offsetToSunday);
  return toISO(end);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: PASS (both new describes plus existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(dashboard): add startOfWeekISO/endOfWeekISO helpers"
```

---

## Task 3: Extract `CapBar` to its own file

**Files:**
- Create: `src/components/equidad/cap-bar.tsx`
- (will modify `employee-equity-panel.tsx` in Task 5 to consume this)

The current implementation lives at the bottom of `src/components/schedule/employee-equity-panel.tsx`. We're moving it verbatim into a new file; the panel will keep working in this task because the existing inline `CapBar` is still there. The panel update happens in Task 5.

- [ ] **Step 1: Create the file**

Create `src/components/equidad/cap-bar.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";

interface Props {
  label: string;
  value: number;
  max: number;
}

export function CapBar({ label, value, max }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const overCap = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={overCap ? "text-red-600 font-medium" : ""}>
          {value}/{max} {overCap && "⚠"}
          {!overCap && value === max && (
            <Check className="inline h-3 w-3 text-emerald-600 ml-1" />
          )}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${
            overCap ? "bg-red-500" : value === max ? "bg-emerald-500" : "bg-blue-500"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success. The new file isn't consumed yet, but it compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/cap-bar.tsx
git commit -m "feat(equidad): extract CapBar component"
```

---

## Task 4: Extract `ThreeMonthTable` to its own file

**Files:**
- Create: `src/components/equidad/three-month-table.tsx`
- (will modify `employee-equity-panel.tsx` in Task 5 to consume this)

Take the rolling 3-month rollup table block from `EmployeeEquityPanel` and put it in its own component.

- [ ] **Step 1: Create the file**

Create `src/components/equidad/three-month-table.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { getRollingWindow } from "@/lib/equity-helpers";
import type { EmployeeEquityRollup } from "@/lib/types";

interface Props {
  rollups: EmployeeEquityRollup[]; // already filtered to one employee
  currentYear: number;
  currentMonth: number; // 1-12
}

const monthName = (m: number) =>
  ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m - 1];

export function ThreeMonthTable({ rollups, currentYear, currentMonth }: Props) {
  const window3 = useMemo(
    () => getRollingWindow(currentYear, currentMonth, 3),
    [currentYear, currentMonth]
  );

  const monthlyRows = window3.map((w) => {
    const r = rollups.find((x) => x.year === w.year && x.month === w.month);
    return {
      year: w.year,
      month: w.month,
      sundays: r?.sundays_worked ?? 0,
      saturdays: r?.saturdays_worked ?? 0,
      nights: r?.nights_worked ?? 0,
      holidays: r?.holidays_worked ?? 0,
      hours: r?.total_hours ?? 0,
    };
  });

  return (
    <div>
      <p className="text-xs font-medium mb-1">Equidad — últimos 3 meses</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal"></th>
            {monthlyRows.map((r) => (
              <th key={`${r.year}-${r.month}`} className="text-right font-normal">
                {monthName(r.month)} {String(r.year).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dom</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.sundays}</td>
            ))}
          </tr>
          <tr>
            <td>Sáb</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.saturdays}</td>
            ))}
          </tr>
          <tr>
            <td>Noches</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.nights}</td>
            ))}
          </tr>
          <tr>
            <td>Festivos</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.holidays}</td>
            ))}
          </tr>
          <tr>
            <td>Horas</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{Math.round(Number(r.hours))}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/three-month-table.tsx
git commit -m "feat(equidad): extract ThreeMonthTable component"
```

---

## Task 5: Refactor `EmployeeEquityPanel` to consume the extractions

**Files:**
- Modify: `src/components/schedule/employee-equity-panel.tsx`

Replace the inline `CapBar` (function declaration at the bottom) and the 3-month table block with imports from the two new files. The visible UI must be unchanged.

- [ ] **Step 1: Replace the file content**

Overwrite `src/components/schedule/employee-equity-panel.tsx` with:

```tsx
"use client";

import { useMemo } from "react";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import { CapBar } from "@/components/equidad/cap-bar";
import { ThreeMonthTable } from "@/components/equidad/three-month-table";
import type { Profile, EmployeeEquityRollup, ContractType, Position } from "@/lib/types";

interface Props {
  employee: Profile;
  position?: Position | null;
  contract?: ContractType;
  rollups: EmployeeEquityRollup[]; // already filtered to this employee
  currentYear: number;
  currentMonth: number; // 1-12
}

export function EmployeeEquityPanel({
  employee, position, contract, rollups, currentYear, currentMonth,
}: Props) {
  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const quarterWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const qSundays = sumRollupField(rollups, employee.id, quarterWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, employee.id, quarterWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-sm">
          {employee.first_name} {employee.last_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {contract?.name ?? "Sin contrato"} · {employee.max_hours_per_week}h/sem ·{" "}
          {position?.name ?? "Sin posición"}
        </p>
      </div>

      <ThreeMonthTable
        rollups={rollups}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <div className="space-y-1">
        <p className="text-xs font-medium">
          Q{Math.ceil(currentMonth / 3)} {currentYear} — progreso
        </p>
        <CapBar label="Domingos" value={qSundays} max={maxSun} />
        <CapBar label="Festivos" value={qHolidays} max={maxHol} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success. All consumers of `EmployeeEquityPanel` (employees page, schedule page sidebar, equity dashboard sheet) compile unchanged.

- [ ] **Step 3: Smoke check (eyeballing)**

Open `src/app/(authenticated)/employees/page.tsx` and `src/app/(authenticated)/schedule/page.tsx` to confirm `EmployeeEquityPanel` is imported the same way (no path change) — it is, because we kept the file at the same path.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/employee-equity-panel.tsx
git commit -m "refactor(equidad): consume CapBar and ThreeMonthTable from extractions"
```

---

## Task 6: `useMyEquityDashboard` hook

**Files:**
- Create: `src/hooks/use-my-equity-dashboard.ts`

Single hook that owns all reads for the employee dashboard. Returns pre-computed values for all 5 KPIs + table + bars + upcoming list.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-my-equity-dashboard.ts`:

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { startOfWeekISO, endOfWeekISO } from "@/lib/equity-helpers";
import type {
  ContractType,
  EmployeeEquityRollup,
  Position,
  Profile,
} from "@/lib/types";

export interface UpcomingShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  position_name: string | null;
  position_color: string | null;
}

export interface UseMyEquityDashboardResult {
  loading: boolean;
  profile: Profile | null;
  contract: ContractType | null;
  position: Position | null;
  rollups: EmployeeEquityRollup[];
  upcomingShifts: UpcomingShift[];
  shiftsThisMonth: number;
  hoursThisWeek: number;
  hoursWeekMax: number;
  saturdaysThisMonth: number;
  nightsThisMonth: number;
}

export function useMyEquityDashboard(): UseMyEquityDashboardResult {
  const { user, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  const [contract, setContract] = useState<ContractType | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [shiftsThisMonth, setShiftsThisMonth] = useState(0);
  const [hoursThisWeek, setHoursThisWeek] = useState(0);
  const [saturdaysThisMonth, setSaturdaysThisMonth] = useState(0);
  const [nightsThisMonth, setNightsThisMonth] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const weekStart = startOfWeekISO(now);
      const weekEnd = endOfWeekISO(now);

      const ct = profile.contract_type_id
        ? supabase
            .from("contract_types")
            .select("*")
            .eq("id", profile.contract_type_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: ContractType | null });

      const pos = profile.position_id
        ? supabase
            .from("positions")
            .select("*")
            .eq("id", profile.position_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: Position | null });

      const [
        ctRes,
        posRes,
        rollRes,
        upcomingRes,
        thisMonthRes,
        thisWeekRes,
      ] = await Promise.all([
        ct,
        pos,
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .eq("employee_id", user.id)
          .gte("year", currentYear - 1),
        supabase
          .from("schedule_entries")
          .select(
            "id, date, start_time, end_time, position:positions(name, color), schedule:schedules!inner(status)"
          )
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .gte("date", today)
          .order("date")
          .limit(7),
        supabase
          .from("schedule_entries")
          .select(
            "id, date, start_time, end_time, shift_template:shift_templates(is_night), schedule:schedules!inner(status, year, month)",
            { count: "exact" }
          )
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .eq("schedule.year", currentYear)
          .eq("schedule.month", currentMonth),
        supabase
          .from("schedule_entries")
          .select("start_time, end_time, schedule:schedules!inner(status)")
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .gte("date", weekStart)
          .lte("date", weekEnd),
      ]);

      if (cancelled) return;

      setContract((ctRes.data ?? null) as ContractType | null);
      setPosition((posRes.data ?? null) as Position | null);
      setRollups((rollRes.data ?? []) as EmployeeEquityRollup[]);

      const upcomingRows = (upcomingRes.data ?? []) as Array<{
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        position: { name: string; color: string } | null;
      }>;
      setUpcomingShifts(
        upcomingRows.map((r) => ({
          id: r.id,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          position_name: r.position?.name ?? null,
          position_color: r.position?.color ?? null,
        }))
      );

      const monthRows = (thisMonthRes.data ?? []) as Array<{
        date: string;
        shift_template: { is_night: boolean } | null;
      }>;
      setShiftsThisMonth(thisMonthRes.count ?? monthRows.length);
      let saturdays = 0;
      let nights = 0;
      for (const e of monthRows) {
        const dow = new Date(e.date + "T00:00:00").getDay();
        if (dow === 6) saturdays += 1;
        if (e.shift_template?.is_night) nights += 1;
      }
      setSaturdaysThisMonth(saturdays);
      setNightsThisMonth(nights);

      const weekRows = (thisWeekRes.data ?? []) as Array<{
        start_time: string;
        end_time: string;
      }>;
      let totalMin = 0;
      for (const e of weekRows) {
        const [sh, sm] = e.start_time.split(":").map(Number);
        const [eh, em] = e.end_time.split(":").map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        totalMin += mins;
      }
      setHoursThisWeek(Math.round((totalMin / 60) * 10) / 10);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user, profile]);

  return {
    loading,
    profile,
    contract,
    position,
    rollups,
    upcomingShifts,
    shiftsThisMonth,
    hoursThisWeek,
    hoursWeekMax: profile?.max_hours_per_week ?? 40,
    saturdaysThisMonth,
    nightsThisMonth,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-my-equity-dashboard.ts
git commit -m "feat(dashboard): add useMyEquityDashboard hook"
```

---

## Task 7: `EmployeeKpiCards` component

**Files:**
- Create: `src/components/dashboard/employee-kpi-cards.tsx`

5 KPI cards in a responsive grid.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/employee-kpi-cards.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Calendar, Clock, CalendarClock, Sun, PartyPopper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import type { ContractType, EmployeeEquityRollup, Profile } from "@/lib/types";
import type { UpcomingShift } from "@/hooks/use-my-equity-dashboard";

interface Props {
  profile: Profile;
  contract: ContractType | null;
  rollups: EmployeeEquityRollup[];
  upcomingShifts: UpcomingShift[];
  shiftsThisMonth: number;
  hoursThisWeek: number;
  hoursWeekMax: number;
}

function relativeDateLabel(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  const dow = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
  const day = d.getDate();
  const month = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][d.getMonth()];
  return `${dow} ${day} ${month}`;
}

function fmtTime(t: string): string {
  return t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"
}

export function EmployeeKpiCards({
  profile,
  contract,
  rollups,
  upcomingShifts,
  shiftsThisMonth,
  hoursThisWeek,
  hoursWeekMax,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const qWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const qSundays = sumRollupField(rollups, profile.id, qWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, profile.id, qWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? null;
  const maxHol = contract?.max_holidays_per_quarter ?? null;

  const next = upcomingShifts[0];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Turnos del mes</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{shiftsThisMonth}</div>
          <p className="text-xs text-muted-foreground">asignados</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Horas esta semana</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{hoursThisWeek}</div>
          <p className="text-xs text-muted-foreground">de {hoursWeekMax}h máximo</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Próximo turno</CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {next ? (
            <>
              <div className="text-2xl font-bold capitalize">
                {relativeDateLabel(next.date)}
              </div>
              <p className="text-xs text-muted-foreground">
                {fmtTime(next.start_time)}–{fmtTime(next.end_time)}
                {next.position_name ? ` · ${next.position_name}` : ""}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Sin turnos próximos</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Domingos Q{Math.ceil(quarter.months[0] / 3)} {quarter.year}
          </CardTitle>
          <Sun className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{qSundays}</div>
          <p className="text-xs text-muted-foreground">
            de {maxSun ?? "—"} máximo
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Festivos Q{Math.ceil(quarter.months[0] / 3)} {quarter.year}
          </CardTitle>
          <PartyPopper className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{qHolidays}</div>
          <p className="text-xs text-muted-foreground">
            de {maxHol ?? "—"} máximo
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/employee-kpi-cards.tsx
git commit -m "feat(dashboard): add EmployeeKpiCards component"
```

---

## Task 8: `MonthlyTargets` component

**Files:**
- Create: `src/components/dashboard/monthly-targets.tsx`

Two soft-target progress bars. The whole section hides when both targets are null/0.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/monthly-targets.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { softTargetColor } from "@/lib/equity-helpers";

interface Props {
  saturdays: number;
  saturdaysTarget: number | null;
  nights: number;
  nightsTarget: number | null;
  monthLabel: string; // e.g. "Abril 2026"
}

const barBg: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function TargetBar({ label, value, target }: { label: string; value: number; target: number }) {
  const color = softTargetColor(value, target);
  const pct = target > 0 ? Math.min(150, (value / target) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{value} / target {target}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", barBg[color])}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function MonthlyTargets({
  saturdays,
  saturdaysTarget,
  nights,
  nightsTarget,
  monthLabel,
}: Props) {
  const hasSat = saturdaysTarget !== null && saturdaysTarget > 0;
  const hasNight = nightsTarget !== null && nightsTarget > 0;

  if (!hasSat && !hasNight) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets del mes ({monthLabel})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSat && (
          <TargetBar label="Sábados" value={saturdays} target={saturdaysTarget} />
        )}
        {hasNight && (
          <TargetBar label="Noches" value={nights} target={nightsTarget} />
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/monthly-targets.tsx
git commit -m "feat(dashboard): add MonthlyTargets component"
```

---

## Task 9: `UpcomingShiftsList` component

**Files:**
- Create: `src/components/dashboard/upcoming-shifts-list.tsx`

Pure presentation of next-7 list, with the same date-formatting style as the existing dashboard.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/upcoming-shifts-list.tsx`:

```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTime } from "@/lib/utils";
import type { UpcomingShift } from "@/hooks/use-my-equity-dashboard";

interface Props {
  shifts: UpcomingShift[];
}

export function UpcomingShiftsList({ shifts }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximos turnos</CardTitle>
        <CardDescription>Tus próximos turnos publicados</CardDescription>
      </CardHeader>
      <CardContent>
        {shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes turnos programados.
          </p>
        ) : (
          <div className="space-y-3">
            {shifts.map((shift) => {
              const date = new Date(shift.date + "T00:00:00");
              const dayName = date.toLocaleDateString("es-ES", { weekday: "short" });
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {shift.position_color && (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: shift.position_color }}
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {dayName} {formatDate(shift.date)}
                      </p>
                      {shift.position_name && (
                        <p className="text-xs text-muted-foreground">
                          {shift.position_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/upcoming-shifts-list.tsx
git commit -m "feat(dashboard): add UpcomingShiftsList component"
```

---

## Task 10: `EmployeeDashboard` orchestrator

**Files:**
- Create: `src/components/dashboard/employee-dashboard.tsx`

Composes the hook output into the full layout: greeting + KPI cards + 3-month table + Q caps + monthly targets + upcoming list.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/employee-dashboard.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyEquityDashboard } from "@/hooks/use-my-equity-dashboard";
import { ROLE_LABELS } from "@/lib/constants";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import { ThreeMonthTable } from "@/components/equidad/three-month-table";
import { CapBar } from "@/components/equidad/cap-bar";
import { EmployeeKpiCards } from "./employee-kpi-cards";
import { MonthlyTargets } from "./monthly-targets";
import { UpcomingShiftsList } from "./upcoming-shifts-list";

const monthName = (m: number) =>
  ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][m - 1];

export function EmployeeDashboard() {
  const {
    loading,
    profile,
    contract,
    position,
    rollups,
    upcomingShifts,
    shiftsThisMonth,
    hoursThisWeek,
    hoursWeekMax,
    saturdaysThisMonth,
    nightsThisMonth,
  } = useMyEquityDashboard();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const qWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const qSundays = sumRollupField(rollups, profile.id, qWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, profile.id, qWindow, "holidays_worked");
  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;
  // Note: position is fetched but not currently rendered at this top level — kept in the hook for completeness/future use.
  void position;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Hola, {profile.first_name} {profile.last_name}
        </h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[profile.role]} — Panel personal
        </p>
      </div>

      <EmployeeKpiCards
        profile={profile}
        contract={contract}
        rollups={rollups}
        upcomingShifts={upcomingShifts}
        shiftsThisMonth={shiftsThisMonth}
        hoursThisWeek={hoursThisWeek}
        hoursWeekMax={hoursWeekMax}
      />

      <Card>
        <CardHeader>
          <CardTitle>Mi equidad — últimos 3 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ThreeMonthTable
            rollups={rollups}
            currentYear={currentYear}
            currentMonth={currentMonth}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Caps trimestrales (Q{Math.ceil(currentMonth / 3)} {currentYear})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CapBar label="Domingos" value={qSundays} max={maxSun} />
          <CapBar label="Festivos" value={qHolidays} max={maxHol} />
        </CardContent>
      </Card>

      <MonthlyTargets
        saturdays={saturdaysThisMonth}
        saturdaysTarget={contract?.target_saturdays_per_month ?? null}
        nights={nightsThisMonth}
        nightsTarget={contract?.target_nights_per_month ?? null}
        monthLabel={`${monthName(currentMonth)} ${currentYear}`}
      />

      <UpcomingShiftsList shifts={upcomingShifts} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/employee-dashboard.tsx
git commit -m "feat(dashboard): add EmployeeDashboard orchestrator"
```

---

## Task 11: Branch `/dashboard/page.tsx` by role

**Files:**
- Modify: `src/app/(authenticated)/dashboard/page.tsx`

Add a top-level conditional: if `profile.role === 'employee'` render `<EmployeeDashboard />`; otherwise keep the existing inline JSX exactly as it is today.

- [ ] **Step 1: Add the import**

At the top of `src/app/(authenticated)/dashboard/page.tsx`, add the import next to the existing `useAuth` import:

```tsx
import { EmployeeDashboard } from "@/components/dashboard/employee-dashboard";
```

- [ ] **Step 2: Add the early return for employees**

Find the line `if (authLoading) {` (around line 144 in the current file). Right above it, add the role guard. The block should look like this:

```tsx
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile?.role === "employee") {
    return <EmployeeDashboard />;
  }
```

The early return must come AFTER the `authLoading` check (so `profile` is settled) but BEFORE the existing `return (` that renders the admin/manager layout.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success. The existing admin/manager dashboard renders unchanged.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/dashboard/page.tsx"
git commit -m "feat(dashboard): branch /dashboard for role='employee'"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: all tests pass. Count went up by ~14 (3 helpers × ~4-5 tests each from Tasks 1-2).

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Manual smoke test**

Log in as an `employee` role profile. Steps:

1. Land on `/dashboard`. The new layout is shown.
2. Greeting shows the employee's name and "Empleado — Panel personal".
3. 5 KPI cards render: Turnos del mes, Horas esta semana, Próximo turno, Domingos Q, Festivos Q.
4. "Mi equidad — últimos 3 meses" table shows Dom/Sáb/Noches/Festivos/Horas across the current month and the two prior months.
5. "Caps trimestrales" card shows Domingos and Festivos progress bars.
6. If the employee's contract has soft targets configured, "Targets del mes" card shows Sábados and Noches bars. If both targets are null/0, the card is hidden.
7. "Próximos turnos" lists up to 7 upcoming shifts; otherwise shows "No tienes turnos programados".
8. Log in as `admin` → `/dashboard` shows the original admin layout, untouched.
9. Log in as `manager` → `/dashboard` shows the original manager layout, untouched.

- [ ] **Step 4: Push (if user requests)**

```bash
git push
```

---

## Self-review notes

- Task 5 visually unchanged: `EmployeeEquityPanel` still renders exactly the same UI; just composed from extractions.
- Task 6 hook does not double-fetch month entries: one query for thisMonth (used to derive shiftsThisMonth + saturdays + nights), one for thisWeek (hours).
- KPI cards Q numbers come from rollups (already maintained by triggers); no live recompute needed.
- `softTargetColor` is symmetric (yellow on either side of green band), matching the spec.
- The hook respects RLS automatically — employees only see their own rows; no extra `.eq("employee_id", user.id)` is strictly required, but we add it explicitly for clarity (and it lets RLS filter at the index level).
- Existing admin/manager dashboard is untouched, except the new early return above its `return (`.
