# Equity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/equidad` dashboard described in `docs/superpowers/specs/2026-04-25-equity-dashboard-design.md`: per-sede operational coverage section + per-sede equity leaderboard, both bounded by a configurable month range.

**Architecture:** Pure client-side. One hook (`useEquidadDashboard`) owns all reads + memoized aggregation. Four presentation components consume the hook output. Page composes everything plus role guard, sede tabs, period selector, and the existing `EmployeeEquityPanel` side-sheet on row click. No DB migrations.

**Tech Stack:** Next.js 14 App Router (`"use client"`), React, TypeScript, Tailwind v3, shadcn/ui, Supabase JS (browser singleton via `createClient` from `@/lib/supabase/client`), Vitest for pure-logic tests.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/equity-helpers.ts` | modify | Add 5 pure helpers used by the dashboard |
| `src/lib/equity-helpers.test.ts` | modify | Vitest unit tests for the new helpers |
| `src/hooks/use-equidad-dashboard.ts` | create | Single fetch + aggregation hook |
| `src/components/equidad/period-range-picker.tsx` | create | Two `<Input type="month">` + "Hoy" button |
| `src/components/equidad/coverage-heatmap.tsx` | create | Pure presentation grid (rows × cols × color) |
| `src/components/equidad/coverage-section.tsx` | create | KPI + by-position table + heatmap (consumes hook output) |
| `src/components/equidad/equity-leaderboard.tsx` | create | Sortable table with z-score colored cells |
| `src/app/(authenticated)/equidad/page.tsx` | create | Page orchestrator: state, role guard, tabs, sheet |
| `src/components/layout/sidebar.tsx` | modify | Add "Equidad" nav item |

---

## Convention reminders for the implementer

- **Spanish UI text** with normalized accents: `posición`, `día`, `distribución`, etc.
- **No emojis** in source files.
- All data access goes through the **browser Supabase client** singleton: `import { createClient } from "@/lib/supabase/client"; const supabase = createClient();`. Do NOT import `@supabase/supabase-js` directly.
- Use **`useAuth()`** from `@/hooks/use-auth` for the current user/profile and role gating.
- `day_of_week` follows JS convention: `0=Sun, 1=Mon, …, 6=Sat`. The same convention is in `staffing_requirements.day_of_week`.
- `schedules.month` is **1-indexed** in DB (Jan=1) but `Date.getMonth()` is 0-indexed in JS — convert at the boundary.
- Dates are `YYYY-MM-DD` ISO strings throughout the codebase.
- Keep the import order grouped: external (react, lucide), then `@/lib/...`, then `@/components/...`, then `@/hooks/...`.
- Run `npm run lint` and `npm run test` before each commit. Run `npm run build` before the final commit of the feature.

---

## Task 1: Add `meanStdDev` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/equity-helpers.test.ts`. First add `meanStdDev` to the existing import list at the top of the file. Then append:

```ts
describe("meanStdDev", () => {
  it("empty array → mean=0, stdDev=0", () => {
    expect(meanStdDev([])).toEqual({ mean: 0, stdDev: 0 });
  });

  it("single value → mean=value, stdDev=0", () => {
    expect(meanStdDev([5])).toEqual({ mean: 5, stdDev: 0 });
  });

  it("uniform values → stdDev=0", () => {
    expect(meanStdDev([3, 3, 3, 3])).toEqual({ mean: 3, stdDev: 0 });
  });

  it("[2,4,4,4,5,5,7,9] → mean=5, stdDev=2 (population)", () => {
    const r = meanStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBe(5);
    expect(r.stdDev).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: tests for `meanStdDev` fail with `meanStdDev is not defined` (or similar import error).

- [ ] **Step 3: Implement `meanStdDev`**

Append to `src/lib/equity-helpers.ts`:

```ts
export function meanStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: all `meanStdDev` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(equity): add meanStdDev helper"
```

---

## Task 2: Add `zScoreColor` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `zScoreColor` to the import list at the top of `equity-helpers.test.ts`. Append:

```ts
describe("zScoreColor", () => {
  it("σ=0 → green (cannot deviate)", () => {
    expect(zScoreColor(5, 5, 0)).toBe("green");
    expect(zScoreColor(99, 5, 0)).toBe("green");
  });

  it("|z| < 0.5 → green", () => {
    // mean=5, stdDev=2, value=5.9 → z=0.45
    expect(zScoreColor(5.9, 5, 2)).toBe("green");
    // mean=5, stdDev=2, value=4.1 → z=-0.45
    expect(zScoreColor(4.1, 5, 2)).toBe("green");
  });

  it("0.5 ≤ |z| < 1.5 → yellow (either side)", () => {
    expect(zScoreColor(7, 5, 2)).toBe("yellow"); // z=1.0
    expect(zScoreColor(3, 5, 2)).toBe("yellow"); // z=-1.0
  });

  it("z ≥ 1.5 → red", () => {
    expect(zScoreColor(8, 5, 2)).toBe("red"); // z=1.5
    expect(zScoreColor(20, 5, 2)).toBe("red");
  });

  it("z ≤ -1.5 → blue", () => {
    expect(zScoreColor(2, 5, 2)).toBe("blue"); // z=-1.5
    expect(zScoreColor(-10, 5, 2)).toBe("blue");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: `zScoreColor` tests fail.

- [ ] **Step 3: Implement `zScoreColor`**

Append to `src/lib/equity-helpers.ts`:

```ts
export type ZScoreColor = "blue" | "green" | "yellow" | "red";

export function zScoreColor(
  value: number,
  mean: number,
  stdDev: number
): ZScoreColor {
  if (stdDev === 0) return "green";
  const z = (value - mean) / stdDev;
  if (z >= 1.5) return "red";
  if (z <= -1.5) return "blue";
  if (Math.abs(z) >= 0.5) return "yellow";
  return "green";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: all `zScoreColor` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(equity): add zScoreColor helper"
```

---

## Task 3: Add `coverageColor` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `coverageColor` to the import list. Append:

```ts
describe("coverageColor", () => {
  it("≥ 95 → green", () => {
    expect(coverageColor(95)).toBe("green");
    expect(coverageColor(100)).toBe("green");
    expect(coverageColor(120)).toBe("green");
  });

  it("80 ≤ x < 95 → yellow", () => {
    expect(coverageColor(80)).toBe("yellow");
    expect(coverageColor(94.99)).toBe("yellow");
  });

  it("< 80 → red", () => {
    expect(coverageColor(0)).toBe("red");
    expect(coverageColor(79.99)).toBe("red");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: `coverageColor` tests fail.

- [ ] **Step 3: Implement `coverageColor`**

Append to `src/lib/equity-helpers.ts`:

```ts
export type CoverageColor = "red" | "yellow" | "green";

export function coverageColor(percent: number): CoverageColor {
  if (percent >= 95) return "green";
  if (percent >= 80) return "yellow";
  return "red";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(equity): add coverageColor helper"
```

---

## Task 4: Add `enumerateMonthRange` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Accepted input format for the picker is `YYYY-MM` (HTML `<input type="month">` value). Add `enumerateMonthRange` to the import list. Append:

```ts
describe("enumerateMonthRange", () => {
  it("same month → single entry", () => {
    expect(enumerateMonthRange("2026-04", "2026-04")).toEqual([
      { year: 2026, month: 4 },
    ]);
  });

  it("Apr-Jun 2026 → 3 entries", () => {
    expect(enumerateMonthRange("2026-04", "2026-06")).toEqual([
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
    ]);
  });

  it("crosses year boundary", () => {
    expect(enumerateMonthRange("2026-11", "2027-02")).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it("start > end → swap silently", () => {
    expect(enumerateMonthRange("2026-06", "2026-04")).toEqual([
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: `enumerateMonthRange` tests fail.

- [ ] **Step 3: Implement `enumerateMonthRange`**

Append to `src/lib/equity-helpers.ts`:

```ts
export function enumerateMonthRange(
  startYM: string,
  endYM: string
): Array<{ year: number; month: number }> {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  let a = { y: sy, m: sm };
  let b = { y: ey, m: em };
  if (a.y > b.y || (a.y === b.y && a.m > b.m)) [a, b] = [b, a];
  const out: Array<{ year: number; month: number }> = [];
  let y = a.y;
  let m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(equity): add enumerateMonthRange helper"
```

---

## Task 5: Add `requiredSlots` helper + test (TDD)

**Files:**
- Modify: `src/lib/equity-helpers.ts`
- Test: `src/lib/equity-helpers.test.ts`

`requiredSlots` sums `staffing_requirements.required_count` over a list of dates, matching each requirement's `day_of_week` against each date's actual weekday.

- [ ] **Step 1: Write the failing tests**

Add `requiredSlots` to the import list. Append:

```ts
describe("requiredSlots", () => {
  const reqs = [
    { day_of_week: 1, required_count: 2 }, // Monday: 2
    { day_of_week: 1, required_count: 1 }, // Monday: 1 (different position/shift)
    { day_of_week: 6, required_count: 1 }, // Saturday: 1
  ] as { day_of_week: number; required_count: number }[];

  it("a single Monday in the date list contributes 3", () => {
    // 2026-04-06 is a Monday
    expect(requiredSlots(reqs, ["2026-04-06"])).toBe(3);
  });

  it("a Saturday contributes 1", () => {
    // 2026-04-04 is a Saturday
    expect(requiredSlots(reqs, ["2026-04-04"])).toBe(1);
  });

  it("a Tuesday contributes 0 (no req for that DOW)", () => {
    expect(requiredSlots(reqs, ["2026-04-07"])).toBe(0);
  });

  it("multiple Mondays add up: 4 Mondays × 3 = 12", () => {
    const mondays = ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];
    expect(requiredSlots(reqs, mondays)).toBe(12);
  });

  it("empty dates → 0", () => {
    expect(requiredSlots(reqs, [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- equity-helpers`
Expected: `requiredSlots` tests fail.

- [ ] **Step 3: Implement `requiredSlots`**

Append to `src/lib/equity-helpers.ts`:

```ts
export function requiredSlots(
  reqs: Array<{ day_of_week: number; required_count: number }>,
  dateStrs: string[]
): number {
  let total = 0;
  for (const ds of dateStrs) {
    const dow = dayOfWeek(ds);
    for (const r of reqs) {
      if (r.day_of_week === dow) total += r.required_count;
    }
  }
  return total;
}
```

(`dayOfWeek` already exists in this file; no extra import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- equity-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/equity-helpers.ts src/lib/equity-helpers.test.ts
git commit -m "feat(equity): add requiredSlots helper"
```

---

## Task 6: `useEquidadDashboard` hook (data fetch + aggregation)

**Files:**
- Create: `src/hooks/use-equidad-dashboard.ts`

The hook does ALL fetching once per `(periodStart, periodEnd, includeDrafts)` change and exposes pre-aggregated structures. It does NOT implement realtime — there is a `refetch` callback for the manual refresh button.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-equidad-dashboard.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  enumerateMonthRange,
  meanStdDev,
  zScoreColor,
  coverageColor,
  requiredSlots,
  dayOfWeek,
  type ZScoreColor,
  type CoverageColor,
} from "@/lib/equity-helpers";
import type {
  Location,
  Profile,
  Position,
  ShiftTemplate,
  StaffingRequirement,
  EmployeeEquityRollup,
} from "@/lib/types";

type Role = "admin" | "manager" | "employee";

export interface CoverageByPosition {
  position_id: string;
  position_name: string;
  assigned: number;
  required: number;
  percent: number;
  color: CoverageColor;
}

export interface CoverageHeatmapCell {
  rowLabel: string;          // shift template name
  colLabel: string;          // "L"|"M"|... or "1".."31"
  rowKey: string;
  colKey: string;
  assigned: number;
  required: number;
  percent: number | null;    // null = no requirement, hide cell color
  color: CoverageColor | null;
}

export interface CoverageData {
  kpi: {
    assigned: number;
    required: number;
    percent: number;
    color: CoverageColor;
  };
  byPosition: CoverageByPosition[];
  heatmap: {
    rows: { key: string; label: string }[];
    cols: { key: string; label: string }[];
    cells: CoverageHeatmapCell[];
    mode: "single-month" | "multi-month";
  };
}

export interface EquityRow {
  employee: Profile;
  turnos: number;
  D: number;
  S: number;
  N: number;
  F: number;
  Horas: number;
  colors: {
    D: ZScoreColor;
    S: ZScoreColor;
    N: ZScoreColor;
    F: ZScoreColor;
    Horas: ZScoreColor;
  };
}

export interface EquityColumnStats {
  D: { mean: number; stdDev: number };
  S: { mean: number; stdDev: number };
  N: { mean: number; stdDev: number };
  F: { mean: number; stdDev: number };
  Horas: { mean: number; stdDev: number };
}

export interface SedeData {
  sede: Location;
  coverage: CoverageData | null; // null when no staffing_requirements configured
  equity: { rows: EquityRow[]; columnStats: EquityColumnStats };
}

export interface UseEquidadDashboardResult {
  loading: boolean;
  sedes: Location[];
  byLocation: Map<string, SedeData>;
  refetch: () => void;
}

export function useEquidadDashboard(
  periodStart: string,        // "YYYY-MM"
  periodEnd: string,          // "YYYY-MM"
  includeDrafts: boolean
): UseEquidadDashboardResult {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const [locations, setLocations] = useState<Location[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [staffingReqs, setStaffingReqs] = useState<StaffingRequirement[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<
    Array<{ id: string; schedule_id: string; employee_id: string; date: string; shift_template_id: string; position_id: string; }>
  >([]);
  const [scheduleByLocation, setScheduleByLocation] = useState<
    Map<string, string[]>  // location_id → schedule ids in range w/ allowed status
  >(new Map());

  const months = useMemo(
    () => enumerateMonthRange(periodStart, periodEnd),
    [periodStart, periodEnd]
  );

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const role = profile.role as Role;
      const allowedStatuses = includeDrafts
        ? ["published", "draft"]
        : ["published"];

      // Build (year, month) tuples filter for schedules: chained .or() expressions
      const ymOr = months
        .map((m) => `and(year.eq.${m.year},month.eq.${m.month})`)
        .join(",");

      const [
        locsRes,
        profsRes,
        posRes,
        srRes,
        stRes,
        schedRes,
        rollRes,
      ] = await Promise.all([
        supabase.from("locations").select("*").order("name"),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("last_name"),
        supabase.from("positions").select("*"),
        supabase.from("staffing_requirements").select("*"),
        supabase.from("shift_templates").select("*").order("start_time"),
        supabase
          .from("schedules")
          .select("id, location_id, status, year, month")
          .in("status", allowedStatuses)
          .or(ymOr),
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .or(ymOr),
      ]);

      if (cancelled) return;

      const visibleLocations = (locsRes.data ?? []) as Location[];
      const filteredLocs =
        role === "manager" && profile.location_id
          ? visibleLocations.filter((l) => l.id === profile.location_id)
          : visibleLocations;

      setLocations(filteredLocs);
      setProfiles((profsRes.data ?? []) as Profile[]);
      setPositions((posRes.data ?? []) as Position[]);
      setStaffingReqs((srRes.data ?? []) as StaffingRequirement[]);
      setShiftTemplates((stRes.data ?? []) as ShiftTemplate[]);
      setRollups((rollRes.data ?? []) as EmployeeEquityRollup[]);

      const scheds = (schedRes.data ?? []) as Array<{
        id: string;
        location_id: string;
        status: string;
        year: number;
        month: number;
      }>;
      const byLoc = new Map<string, string[]>();
      for (const s of scheds) {
        const arr = byLoc.get(s.location_id) ?? [];
        arr.push(s.id);
        byLoc.set(s.location_id, arr);
      }
      setScheduleByLocation(byLoc);

      const scheduleIds = scheds.map((s) => s.id);
      if (scheduleIds.length === 0) {
        setScheduleEntries([]);
      } else {
        const entriesRes = await supabase
          .from("schedule_entries")
          .select("id, schedule_id, employee_id, date, shift_template_id, position_id")
          .in("schedule_id", scheduleIds);
        if (cancelled) return;
        setScheduleEntries(
          (entriesRes.data ?? []) as Array<{
            id: string;
            schedule_id: string;
            employee_id: string;
            date: string;
            shift_template_id: string;
            position_id: string;
          }>
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, profile, months, includeDrafts, tick]);

  const byLocation = useMemo<Map<string, SedeData>>(() => {
    const out = new Map<string, SedeData>();
    if (!profile) return out;

    // Enumerate concrete dates for each month in range
    const allDates: string[] = [];
    for (const { year, month } of months) {
      const last = new Date(year, month, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        allDates.push(ds);
      }
    }

    for (const sede of locations) {
      // Employees in this sede (respecting RLS-already-filtered profiles)
      const sedeEmps = profiles.filter((p) => p.location_id === sede.id);
      const sedeEmpIds = new Set(sedeEmps.map((p) => p.id));

      // Positions belonging to this sede (via departments.location_id)
      // Positions are loaded without sede join here; we filter via staffing_requirements which has location_id directly.
      const sedeReqs = staffingReqs.filter((r) => r.location_id === sede.id);
      const sedePosIds = new Set(sedeReqs.map((r) => r.position_id));
      const sedePositions = positions.filter((p) => sedePosIds.has(p.id));

      // Shift templates for this sede
      const sedeTemplates = shiftTemplates.filter((t) => t.location_id === sede.id);

      // Schedule entries scoped to this sede
      const sedeSchedIds = new Set(scheduleByLocation.get(sede.id) ?? []);
      const sedeEntries = scheduleEntries.filter((e) => sedeSchedIds.has(e.schedule_id));

      // ---- Coverage section ----
      let coverage: CoverageData | null = null;
      if (sedeReqs.length > 0) {
        const required = requiredSlots(
          sedeReqs.map((r) => ({
            day_of_week: r.day_of_week,
            required_count: r.required_count,
          })),
          allDates
        );
        const assigned = sedeEntries.length;
        const percent = required === 0 ? 0 : (assigned / required) * 100;

        // By-position breakdown
        const byPosition: CoverageByPosition[] = sedePositions
          .map((pos) => {
            const reqsForPos = sedeReqs.filter((r) => r.position_id === pos.id);
            const reqCount = requiredSlots(
              reqsForPos.map((r) => ({
                day_of_week: r.day_of_week,
                required_count: r.required_count,
              })),
              allDates
            );
            const assignedForPos = sedeEntries.filter(
              (e) => e.position_id === pos.id
            ).length;
            return {
              position_id: pos.id,
              position_name: pos.name,
              assigned: assignedForPos,
              required: reqCount,
              percent: reqCount === 0 ? 0 : (assignedForPos / reqCount) * 100,
              color: coverageColor(reqCount === 0 ? 0 : (assignedForPos / reqCount) * 100),
            };
          })
          .filter((p) => p.required > 0)
          .sort((a, b) => a.percent - b.percent);

        // Heatmap
        const isMulti = months.length > 1;
        const rows = sedeTemplates.map((t) => ({ key: t.id, label: t.name }));
        let cols: { key: string; label: string }[];
        const cells: CoverageHeatmapCell[] = [];

        if (!isMulti) {
          // Single month: columns are days 1..lastDay
          const { year, month } = months[0];
          const lastDay = new Date(year, month, 0).getDate();
          cols = Array.from({ length: lastDay }, (_, i) => ({
            key: String(i + 1),
            label: String(i + 1),
          }));

          for (const t of sedeTemplates) {
            for (let d = 1; d <= lastDay; d++) {
              const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const dow = dayOfWeek(ds);
              const reqRows = sedeReqs.filter(
                (r) => r.shift_template_id === t.id && r.day_of_week === dow
              );
              const reqCount = reqRows.reduce((a, r) => a + r.required_count, 0);
              const assignedCount = sedeEntries.filter(
                (e) => e.shift_template_id === t.id && e.date === ds
              ).length;
              const cellPercent =
                reqCount === 0 ? null : (assignedCount / reqCount) * 100;
              cells.push({
                rowLabel: t.name,
                colLabel: String(d),
                rowKey: t.id,
                colKey: String(d),
                assigned: assignedCount,
                required: reqCount,
                percent: cellPercent,
                color: cellPercent === null ? null : coverageColor(cellPercent),
              });
            }
          }
        } else {
          // Multi month: columns are day-of-week 0..6, displayed L M X J V S D
          const dowLabels = ["D", "L", "M", "X", "J", "V", "S"]; // index = JS dow
          // Display order Mon..Sun (1,2,3,4,5,6,0)
          const displayOrder = [1, 2, 3, 4, 5, 6, 0];
          cols = displayOrder.map((d) => ({
            key: String(d),
            label: dowLabels[d],
          }));

          // Group entries by (template, dow)
          for (const t of sedeTemplates) {
            for (const dow of displayOrder) {
              // Count occurrences of this dow in allDates
              const datesForDow = allDates.filter((ds) => dayOfWeek(ds) === dow);
              const reqPerOcc = sedeReqs
                .filter((r) => r.shift_template_id === t.id && r.day_of_week === dow)
                .reduce((a, r) => a + r.required_count, 0);
              const reqCount = reqPerOcc * datesForDow.length;
              const assignedCount = sedeEntries.filter((e) => {
                if (e.shift_template_id !== t.id) return false;
                return dayOfWeek(e.date) === dow;
              }).length;
              const cellPercent =
                reqCount === 0 ? null : (assignedCount / reqCount) * 100;
              cells.push({
                rowLabel: t.name,
                colLabel: dowLabels[dow],
                rowKey: t.id,
                colKey: String(dow),
                assigned: assignedCount,
                required: reqCount,
                percent: cellPercent,
                color: cellPercent === null ? null : coverageColor(cellPercent),
              });
            }
          }
        }

        coverage = {
          kpi: {
            assigned,
            required,
            percent,
            color: coverageColor(percent),
          },
          byPosition,
          heatmap: {
            rows,
            cols,
            cells,
            mode: isMulti ? "multi-month" : "single-month",
          },
        };
      }

      // ---- Equity section ----
      const sedeRollups = rollups.filter((r) => sedeEmpIds.has(r.employee_id));

      // Aggregate per employee (sum across months in range)
      const aggMap = new Map<
        string,
        { D: number; S: number; N: number; F: number; Horas: number; turnos: number }
      >();
      for (const emp of sedeEmps) {
        aggMap.set(emp.id, { D: 0, S: 0, N: 0, F: 0, Horas: 0, turnos: 0 });
      }
      for (const r of sedeRollups) {
        const cur = aggMap.get(r.employee_id);
        if (!cur) continue;
        cur.D += r.sundays_worked;
        cur.S += r.saturdays_worked;
        cur.N += r.nights_worked;
        cur.F += r.holidays_worked;
        cur.Horas += Number(r.total_hours);
      }
      // Turnos comes from entry counts
      for (const e of sedeEntries) {
        const cur = aggMap.get(e.employee_id);
        if (!cur) continue;
        cur.turnos += 1;
      }

      // Column stats for z-score coloring
      const allD = sedeEmps.map((e) => aggMap.get(e.id)!.D);
      const allS = sedeEmps.map((e) => aggMap.get(e.id)!.S);
      const allN = sedeEmps.map((e) => aggMap.get(e.id)!.N);
      const allF = sedeEmps.map((e) => aggMap.get(e.id)!.F);
      const allH = sedeEmps.map((e) => aggMap.get(e.id)!.Horas);
      const colStats: EquityColumnStats = {
        D: meanStdDev(allD),
        S: meanStdDev(allS),
        N: meanStdDev(allN),
        F: meanStdDev(allF),
        Horas: meanStdDev(allH),
      };

      const rows: EquityRow[] = sedeEmps.map((emp) => {
        const a = aggMap.get(emp.id)!;
        return {
          employee: emp,
          turnos: a.turnos,
          D: a.D,
          S: a.S,
          N: a.N,
          F: a.F,
          Horas: a.Horas,
          colors: {
            D: zScoreColor(a.D, colStats.D.mean, colStats.D.stdDev),
            S: zScoreColor(a.S, colStats.S.mean, colStats.S.stdDev),
            N: zScoreColor(a.N, colStats.N.mean, colStats.N.stdDev),
            F: zScoreColor(a.F, colStats.F.mean, colStats.F.stdDev),
            Horas: zScoreColor(a.Horas, colStats.Horas.mean, colStats.Horas.stdDev),
          },
        };
      });

      out.set(sede.id, { sede, coverage, equity: { rows, columnStats: colStats } });
    }

    return out;
  }, [
    profile,
    months,
    locations,
    profiles,
    positions,
    staffingReqs,
    shiftTemplates,
    scheduleByLocation,
    scheduleEntries,
    rollups,
  ]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { loading, sedes: locations, byLocation, refetch };
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds (the hook compiles with no consumers yet — the file just sits unused).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-equidad-dashboard.ts
git commit -m "feat(equity): add useEquidadDashboard hook"
```

---

## Task 7: `PeriodRangePicker` component

**Files:**
- Create: `src/components/equidad/period-range-picker.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/equidad/period-range-picker.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  start: string; // "YYYY-MM"
  end: string;   // "YYYY-MM"
  onChange: (next: { start: string; end: string }) => void;
}

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PeriodRangePicker({ start, end, onChange }: Props) {
  const today = currentMonthValue();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Mes inicio</span>
      <Input
        type="month"
        value={start}
        onChange={(e) => onChange({ start: e.target.value, end })}
        className="w-40"
      />
      <span className="text-sm text-muted-foreground">Mes fin</span>
      <Input
        type="month"
        value={end}
        onChange={(e) => onChange({ start, end: e.target.value })}
        className="w-40"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange({ start: today, end: today })}
      >
        Hoy
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/period-range-picker.tsx
git commit -m "feat(equity): add PeriodRangePicker component"
```

---

## Task 8: `CoverageHeatmap` component

**Files:**
- Create: `src/components/equidad/coverage-heatmap.tsx`

Pure presentation: receives the pre-computed cell matrix, renders a grid.

- [ ] **Step 1: Write the component**

Create `src/components/equidad/coverage-heatmap.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { CoverageHeatmapCell } from "@/hooks/use-equidad-dashboard";

interface Props {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cells: CoverageHeatmapCell[];
}

const colorClass: Record<string, string> = {
  green: "bg-green-200 text-green-900",
  yellow: "bg-amber-200 text-amber-900",
  red: "bg-red-200 text-red-900",
};

export function CoverageHeatmap({ rows, cols, cells }: Props) {
  const cellByKey = new Map<string, CoverageHeatmapCell>();
  for (const c of cells) cellByKey.set(`${c.rowKey}|${c.colKey}`, c);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium">
              Turno
            </th>
            {cols.map((c) => (
              <th key={c.key} className="px-1 py-1 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="sticky left-0 bg-background px-2 py-1 font-medium">
                {r.label}
              </td>
              {cols.map((c) => {
                const cell = cellByKey.get(`${r.key}|${c.key}`);
                if (!cell || cell.percent === null) {
                  return (
                    <td
                      key={c.key}
                      className="h-7 w-7 rounded bg-muted text-center text-muted-foreground"
                      title="Sin requerimiento"
                    >
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={c.key}
                    className={cn(
                      "h-7 w-7 rounded text-center font-medium",
                      colorClass[cell.color ?? "green"]
                    )}
                    title={`${cell.assigned}/${cell.required} (${Math.round(cell.percent)}%)`}
                  >
                    {Math.round(cell.percent)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/coverage-heatmap.tsx
git commit -m "feat(equity): add CoverageHeatmap component"
```

---

## Task 9: `CoverageSection` component

**Files:**
- Create: `src/components/equidad/coverage-section.tsx`

KPI tarjeta + by-position table + heatmap.

- [ ] **Step 1: Write the component**

Create `src/components/equidad/coverage-section.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageHeatmap } from "./coverage-heatmap";
import type { CoverageData } from "@/hooks/use-equidad-dashboard";

interface Props {
  coverage: CoverageData | null;
}

const kpiBg: Record<string, string> = {
  green: "bg-green-100 text-green-900",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
};

const barBg: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export function CoverageSection({ coverage }: Props) {
  if (!coverage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cobertura operativa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Sin necesidades configuradas para esta sede.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { kpi, byPosition, heatmap } = coverage;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura operativa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={cn(
            "flex items-baseline gap-4 rounded-lg px-4 py-3",
            kpiBg[kpi.color]
          )}
        >
          <span className="text-4xl font-bold tabular-nums">
            {Math.round(kpi.percent)}%
          </span>
          <span className="text-sm">
            {kpi.assigned} asignados de {kpi.required} requeridos
          </span>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium">Por posición</h4>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Posición</th>
                <th className="py-1 text-right font-medium">Asignados</th>
                <th className="py-1 text-right font-medium">Requeridos</th>
                <th className="py-1 text-right font-medium">%</th>
                <th className="py-1 text-left font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {byPosition.map((row) => (
                <tr key={row.position_id} className="border-t">
                  <td className="py-1">{row.position_name}</td>
                  <td className="py-1 text-right tabular-nums">{row.assigned}</td>
                  <td className="py-1 text-right tabular-nums">{row.required}</td>
                  <td className="py-1 text-right tabular-nums">
                    {Math.round(row.percent)}%
                  </td>
                  <td className="py-1 pl-2">
                    <div className="h-2 w-32 overflow-hidden rounded bg-muted">
                      <div
                        className={cn("h-full", barBg[row.color])}
                        style={{ width: `${Math.min(100, row.percent)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {byPosition.length === 0 && (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={5}>
                    Sin posiciones con requerimiento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium">
            {heatmap.mode === "single-month"
              ? "Heatmap día × turno"
              : "Heatmap día de la semana × turno (promedio)"}
          </h4>
          <CoverageHeatmap rows={heatmap.rows} cols={heatmap.cols} cells={heatmap.cells} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/coverage-section.tsx
git commit -m "feat(equity): add CoverageSection component"
```

---

## Task 10: `EquityLeaderboard` component

**Files:**
- Create: `src/components/equidad/equity-leaderboard.tsx`

Sortable table; cells colored per z-score; click row → callback to open sheet.

- [ ] **Step 1: Write the component**

Create `src/components/equidad/equity-leaderboard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  EquityRow,
  EquityColumnStats,
} from "@/hooks/use-equidad-dashboard";
import type { Profile } from "@/lib/types";

interface Props {
  rows: EquityRow[];
  columnStats: EquityColumnStats;
  onRowClick: (employee: Profile) => void;
}

type SortKey = "name" | "turnos" | "D" | "S" | "N" | "F" | "Horas";

const cellBg: Record<string, string> = {
  blue: "bg-blue-100 text-blue-900",
  green: "bg-green-100 text-green-900",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
};

export function EquityLeaderboard({ rows, columnStats, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("Horas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const sign = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") {
      const an = `${a.employee.last_name} ${a.employee.first_name}`.toLowerCase();
      const bn = `${b.employee.last_name} ${b.employee.first_name}`.toLowerCase();
      return an.localeCompare(bn) * sign;
    }
    return ((a[sortKey] as number) - (b[sortKey] as number)) * sign;
  });

  const fmtMu = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carga / equidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No hay empleados en esta sede.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga / equidad</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th onClick={() => handleSort("name")} active={sortKey === "name"}>
                  Empleado
                </Th>
                <ThNum onClick={() => handleSort("turnos")} active={sortKey === "turnos"}>
                  Turnos
                </ThNum>
                <ThNum onClick={() => handleSort("D")} active={sortKey === "D"}>
                  D
                </ThNum>
                <ThNum onClick={() => handleSort("S")} active={sortKey === "S"}>
                  S
                </ThNum>
                <ThNum onClick={() => handleSort("N")} active={sortKey === "N"}>
                  N
                </ThNum>
                <ThNum onClick={() => handleSort("F")} active={sortKey === "F"}>
                  F
                </ThNum>
                <ThNum onClick={() => handleSort("Horas")} active={sortKey === "Horas"}>
                  Horas
                </ThNum>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <td />
                <td />
                <td className="py-1 text-right">μ={fmtMu(columnStats.D.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.S.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.N.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.F.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.Horas.mean)}</td>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.employee.id}
                  className="cursor-pointer border-b hover:bg-muted/50"
                  onClick={() => onRowClick(row.employee)}
                >
                  <td className="py-2">
                    {row.employee.first_name} {row.employee.last_name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.turnos}</td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.D])}>
                    {row.D}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.S])}>
                    {row.S}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.N])}>
                    {row.N}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.F])}>
                    {row.F}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.Horas])}>
                    {Math.round(row.Horas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="py-2 text-left font-medium">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 px-1", active && "text-foreground")}
        onClick={onClick}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </th>
  );
}

function ThNum({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="py-2 text-right font-medium">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 px-1", active && "text-foreground")}
        onClick={onClick}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </th>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/equidad/equity-leaderboard.tsx
git commit -m "feat(equity): add EquityLeaderboard component"
```

---

## Task 11: `/equidad` page (orchestrator)

**Files:**
- Create: `src/app/(authenticated)/equidad/page.tsx`

Composes everything: state, role guard, period picker, drafts toggle, refresh, sede tabs, side sheet for `EmployeeEquityPanel`.

- [ ] **Step 1: Write the page**

Create `src/app/(authenticated)/equidad/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEquidadDashboard } from "@/hooks/use-equidad-dashboard";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PeriodRangePicker } from "@/components/equidad/period-range-picker";
import { CoverageSection } from "@/components/equidad/coverage-section";
import { EquityLeaderboard } from "@/components/equidad/equity-leaderboard";
import { EmployeeEquityPanel } from "@/components/schedule/employee-equity-panel";
import { createClient } from "@/lib/supabase/client";
import type { ContractType, Position, Profile, EmployeeEquityRollup } from "@/lib/types";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function EquidadPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [start, setStart] = useState(currentMonthValue());
  const [end, setEnd] = useState(currentMonthValue());
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const { loading, sedes, byLocation, refetch } = useEquidadDashboard(
    start,
    end,
    includeDrafts
  );

  const [activeTab, setActiveTab] = useState<string>("");
  useEffect(() => {
    if (!activeTab && sedes.length > 0) setActiveTab(sedes[0].id);
  }, [sedes, activeTab]);

  // Side sheet state
  const [panelEmp, setPanelEmp] = useState<Profile | null>(null);
  const [contracts, setContracts] = useState<ContractType[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [allRollups, setAllRollups] = useState<EmployeeEquityRollup[]>([]);

  useEffect(() => {
    (async () => {
      const [cts, pos, rolls] = await Promise.all([
        supabase.from("contract_types").select("*"),
        supabase.from("positions").select("*"),
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .gte("year", new Date().getFullYear() - 1),
      ]);
      setContracts((cts.data ?? []) as ContractType[]);
      setPositions((pos.data ?? []) as Position[]);
      setAllRollups((rolls.data ?? []) as EmployeeEquityRollup[]);
    })();
  }, [supabase]);

  // Role guard
  useEffect(() => {
    if (authLoading) return;
    if (!profile) return;
    if (profile.role === "employee") {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.role === "employee") return null;

  const now = new Date();
  const panelContract = panelEmp
    ? contracts.find((c) => c.id === panelEmp.contract_type_id)
    : undefined;
  const panelPosition = panelEmp
    ? positions.find((p) => p.id === panelEmp.position_id)
    : undefined;
  const panelRollups = panelEmp
    ? allRollups.filter((r) => r.employee_id === panelEmp.id)
    : [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Equidad</h1>
        <p className="text-muted-foreground">
          Cobertura operativa y distribución de carga por sede.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <PeriodRangePicker
          start={start}
          end={end}
          onChange={(next) => {
            setStart(next.start);
            setEnd(next.end);
          }}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-drafts"
            checked={includeDrafts}
            onCheckedChange={(c) => setIncludeDrafts(c === true)}
          />
          <Label htmlFor="include-drafts">Incluir borradores</Label>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} title="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sedes.length === 0 ? (
        <p className="text-muted-foreground">No hay sedes visibles para tu rol.</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {sedes.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {sedes.map((s) => {
            const data = byLocation.get(s.id);
            if (!data) return null;
            return (
              <TabsContent key={s.id} value={s.id} className="space-y-6">
                <CoverageSection coverage={data.coverage} />
                <EquityLeaderboard
                  rows={data.equity.rows}
                  columnStats={data.equity.columnStats}
                  onRowClick={setPanelEmp}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <Sheet open={!!panelEmp} onOpenChange={(o) => !o && setPanelEmp(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {panelEmp && (
            <EmployeeEquityPanel
              employee={panelEmp}
              position={panelPosition}
              contract={panelContract}
              rollups={panelRollups}
              currentYear={now.getFullYear()}
              currentMonth={now.getMonth() + 1}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: success. The new route appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(authenticated\)/equidad/page.tsx
git commit -m "feat(equity): add /equidad page"
```

---

## Task 12: Sidebar item

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

Add an item between "Horarios" and "Empleados", visible to admin and manager. Use the `BarChart3` icon from `lucide-react`.

- [ ] **Step 1: Add the icon import**

In `src/components/layout/sidebar.tsx`, add `BarChart3` to the existing `lucide-react` import block (alphabetical order):

```tsx
import {
  LayoutDashboard,
  Calendar,
  BarChart3,
  Users,
  // ...rest unchanged
} from "lucide-react";
```

- [ ] **Step 2: Insert the nav item**

In the `topNavigation` array, insert after the `Horarios` line (line 45):

```tsx
{ name: "Equidad", href: "/equidad", icon: BarChart3, roles: ["admin", "manager"] },
```

The result for that block should be:

```tsx
const topNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "employee"] },
  { name: "Horarios", href: "/schedule", icon: Calendar, roles: ["admin", "manager", "employee"] },
  { name: "Equidad", href: "/equidad", icon: BarChart3, roles: ["admin", "manager"] },
  { name: "Empleados", href: "/employees", icon: Users, roles: ["admin", "manager"] },
  { name: "Solicitudes", href: "/requests", icon: FileText, roles: ["admin", "manager", "employee"] },
  { name: "Notificaciones", href: "/notifications", icon: Bell, roles: ["admin", "manager", "employee"] },
];
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(equity): add Equidad nav item to sidebar"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: all tests pass (existing 38 + new tests from tasks 1-5; total around 50+).

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: build succeeds, `/equidad` listed in routes.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (browser, prod or local)**

Log in as `admin@apphorarios.com`. Steps:

1. Sidebar shows "Equidad" between "Horarios" and "Empleados".
2. Click `Equidad`. Page loads with `Mes inicio = Mes fin = current month`, drafts OFF.
3. Tabs show one tab per sede.
4. Each tab shows either:
   - "Sin necesidades configuradas" if the sede has no `staffing_requirements`, OR
   - KPI tarjeta with `% / X asignados / Y requeridos`, by-position table, and a heatmap with day numbers as columns.
5. Equity leaderboard renders all active employees of the sede with z-score colored cells. μ values shown in subtitle row.
6. Click a row → side sheet opens with the existing `EmployeeEquityPanel`.
7. Toggle "Incluir borradores" → coverage and turnos columns increase if there's a draft for the month.
8. Set `Mes fin` two months ahead → heatmap switches to day-of-week columns (L M X J V S D).
9. Click "Hoy" → both inputs reset to current month.
10. Click the refresh icon → values re-fetch (verify by mutating a rollup in DB and clicking refresh).
11. Log in as a manager (a manager-role profile if available). Only their sede tab is visible.
12. As `employee` role → navigating to `/equidad` redirects to `/dashboard`.

If all 12 pass, the feature is verified.

- [ ] **Step 5: Final commit (if anything was tweaked during smoke)**

If steps 4 surfaced any tweaks:

```bash
git add -A
git commit -m "fix(equity): smoke-test follow-ups"
```

If no tweaks needed, skip this step.

---

## Self-review notes

- All five new helpers (Task 1-5) have tests; existing helpers untouched.
- `useEquidadDashboard` types (`CoverageData`, `EquityRow`, `EquityColumnStats`, etc.) are exported and consumed consistently by Tasks 8-10.
- Heatmap mode (`single-month` vs `multi-month`) decided in the hook, presentation is dumb.
- Coverage cell with `required = 0` correctly reports `percent = null` and renders "—" instead of `NaN%`.
- Refetch wired through `tick` state — the dependency array of the data-fetching `useEffect` includes `tick` so `refetch()` triggers a re-run.
- Role guard happens both via the redirect in `EquidadPage` (UX) AND via RLS at the DB layer (security). Defense in depth.
- The page never depends on schedule entries existing for an employee with no rollup row — the rollup defaults to 0 since the aggregation map seeds zeroes.
