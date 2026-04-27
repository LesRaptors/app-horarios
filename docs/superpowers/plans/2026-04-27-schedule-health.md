# Salud del horario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox `- [ ]` syntax.

**Goal:** Hacer que `consecutive_days` sea inviolable, que el scoring prefiera candidatos con holgura, y que el admin vea explícitamente la salud del horario (extras pendientes, slots faltantes, empleados saturados) sin tener que cazar el problema turno por turno.

**Architecture:** Cambios localizados en `schedule-generator.ts` (lógica + score) + nuevo helper puro `schedule-health.ts` con tests TDD + 2 componentes UI (`<ScheduleHealthBanner />` y `<ScheduleHealthPanel />`) + mejora de la dialog post-auto-gen + mount en `/schedule`.

**Tech Stack:** TypeScript, Vitest, React 18, shadcn/ui (Card, Badge, Collapsible). Sin dependencias nuevas.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/types.ts` | modify | agregar `coverage_gap` al union `AutoGenWarning` |
| `src/lib/schedule-generator.ts` | modify | mover `consecutive_days` a inviolables; agregar score penalty; emitir `coverage_gap` warning |
| `src/lib/schedule-generator.test.ts` | modify | 2 tests nuevos: `consecutive_days` inviolable + score penaliza saturación |
| `src/lib/schedule-health.ts` | create | `computeHealth(entries, employees, staffing, constraints): HealthSummary` |
| `src/lib/schedule-health.test.ts` | create | 6 tests Vitest |
| `src/components/schedule/schedule-health-banner.tsx` | create | banner sticky con conteo pending + gaps |
| `src/components/schedule/schedule-health-panel.tsx` | create | panel expansible con métricas y listas |
| `src/components/schedule/auto-generate-dialog.tsx` | modify | bloque de resumen mejorado en sección de resultados |
| `src/app/(authenticated)/schedule/page.tsx` | modify | mount banner + panel |
| `CLAUDE.md` | modify | sección "Salud del horario" + nuevo warning kind |

---

## Convention reminders

- **Spanish UI**, normalized accents (más, días, posición).
- **No emojis** en source files; lucide icons (AlertTriangle, Clock, CheckCircle2, ChevronDown).
- TDD estricto para `schedule-health.ts` y los nuevos tests del generator.
- `npm run build && npm run test` antes de cada commit. Nunca DONE sin verificar.
- Tests baseline: 249. Después de este plan deben ser 249 + 6 (health) + 2 (generator) = 257.

---

## Task 1: Agregar `coverage_gap` al union `AutoGenWarning`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Encontrar y extender el union**

En `src/lib/types.ts` busca `export type AutoGenWarning =` (alrededor de la línea 268). Justo antes del cierre del union, agrega esta variante:

```ts
  | { kind: "coverage_gap";              positionId: string; date: string; shiftTemplateId: string; reason: "all_at_cap" | "no_eligible" }
```

- [ ] **Step 2: Verificar build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(schedule): add coverage_gap a AutoGenWarning union"
```

---

## Task 2: Mover `consecutive_days` a inviolables (TDD)

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: Escribir el test fallando**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("consecutive_days inviolable", () => {
  it("no asigna al empleado con 6 días consecutivos un séptimo día — emite coverage_gap", () => {
    const emp = makeEmployee({ id: "e1" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // Existing entries: 6 días consecutivos previos (lun-sáb, semana ISO 14)
    const existingEntries: ScheduleEntry[] = [
      "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "sched-1", employee_id: "e1", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none",
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));

    // Demand: domingo 5 abril (día consecutivo #7)
    const result = generateSchedule(
      {
        scheduleId: "sched-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
      },
      [emp], [tpl], existingEntries, [],
      { ...defaultConstraints, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 0, required_count: 1, created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    // No se asigna; queda como coverage_gap warning
    expect(result.entries.find((e) => e.date === "2026-04-05")).toBeUndefined();
    const gap = result.warnings.find((w) => w.kind === "coverage_gap" && w.date === "2026-04-05");
    expect(gap).toBeDefined();
  });
});
```

- [ ] **Step 2: Verificar FAIL**

```bash
npm run test -- schedule-generator
```
Expected: FAIL — el slot se asignaría con `overtime_status='pending'`.

- [ ] **Step 3: Mover el chequeo a inviolables**

En `src/lib/schedule-generator.ts`, función `filterCandidates` (alrededor de línea 240). Encuentra esta línea en la sección "CONTRACTUAL" (después de `if (allowOvertime) { kept.push(empId); continue; }`):

```ts
    if (tracker.lastShiftDate === prevDateStr(slot.date)
        && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;
```

Eliminala de ahí. Ahora agrega el mismo chequeo ANTES de `if (allowOvertime)` en la sección "INVIOLABLES" (justo después del bloque de descanso/rest):

```ts
    // INVIOLABLE: máximo días consecutivos (Art. 161 CST — descanso semanal obligatorio)
    if (tracker.lastShiftDate === prevDateStr(slot.date)
        && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;

    if (allowOvertime) { kept.push(empId); continue; }
```

- [ ] **Step 4: Cuando no hay candidato en Pase 2, emitir `coverage_gap`**

En el bloque del loop principal (`for (const slot of demandSlots)`, alrededor de línea 462):

```ts
    if (!chosen) {
      warnings.push({ kind: "no_safe_candidate",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }
```

Reemplazar con lógica que distinga "todos al cap" vs "ninguno elegible por inviolables":

```ts
    if (!chosen) {
      // Distinguir entre: nadie elegible (no_safe_candidate) vs todos al cap (coverage_gap)
      const reason: "all_at_cap" | "no_eligible" = candidateIds.some((id) => {
        const t = trackers.get(id);
        if (!t) return false;
        return t.lastShiftDate === prevDateStr(slot.date)
          && t.consecutiveDays + 1 > constraints.maxConsecutiveDays;
      })
        ? "all_at_cap"
        : "no_eligible";

      if (reason === "all_at_cap") {
        warnings.push({ kind: "coverage_gap",
          positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
          reason });
      } else {
        warnings.push({ kind: "no_safe_candidate",
          positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      }
      continue;
    }
```

- [ ] **Step 5: Verificar PASS**

```bash
npm run test -- schedule-generator
```
Expected: PASS (todos los tests, incluyendo el nuevo).

- [ ] **Step 6: Verificar build + suite completa**

```bash
npm run build && npm run test
```
Expected: 250 tests passing (249 baseline + 1 nuevo).

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(schedule): consecutive_days inviolable + emite coverage_gap warning"
```

---

## Task 3: Score penalizando saturación (TDD)

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: Escribir el test**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("score penaliza saturación", () => {
  it("prefiere empleado con holgura sobre uno al 90% de horas semana", () => {
    const fresh = makeEmployee({ id: "e-fresh" });
    const saturated = makeEmployee({ id: "e-sat" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // saturated tiene 5 turnos × 8h = 40h ya en la semana del 6 abril (lunes)
    // (ISO week 15 = lun 6 abr - dom 12 abr)
    const existingEntries: ScheduleEntry[] = [
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "sched-1", employee_id: "e-sat", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none",
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));
    // contract.target_hours_per_week = 40 → ya está al 100% (saturado)

    // Demand: sábado 11 abr — los 2 elegibles, pero uno está saturado
    const result = generateSchedule(
      {
        scheduleId: "sched-1", year: 2026, month: 3,
        employeeIds: ["e-fresh", "e-sat"], shiftTemplateIds: ["tpl-m"],
      },
      [fresh, saturated], [tpl], existingEntries, [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 6, required_count: 1, created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const sat11 = result.entries.find((e) => e.date === "2026-04-11");
    expect(sat11?.employee_id).toBe("e-fresh");
  });
});
```

- [ ] **Step 2: Verificar FAIL**

```bash
npm run test -- schedule-generator
```
Expected: FAIL o PASS dependiendo del estado actual del scoring. Si PASA porque ya hay heurística suficiente, igual implementamos la penalización explícita por consistencia.

- [ ] **Step 3: Pasar `constraints` al ScoringContext**

En `src/lib/schedule-generator.ts`, busca la definición del tipo `ScoringContext` (suele estar cerca de la línea 130-160). Agrega:

```ts
interface ScoringContext {
  // ... campos existentes
  constraints: LaborConstraints;
}
```

Después busca donde se construye el `ctx` (en `generateSchedule`, antes del loop principal). Agregale `constraints: constraints` al objeto.

- [ ] **Step 4: Implementar penalización en `scoreCandidate`**

En `scoreCandidate` (línea ~170), antes del `return score`, agregar:

```ts
  // Penalización por saturación: candidatos cerca de sus caps pesan menos
  const week = getISOWeekNumber(slot.date);
  const weekHoursUsed = tracker.weeklyHours[week] || 0;
  const contract = ctx.contractTypes.get(employee.contract_type_id);
  const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
  const effectiveWeekly = Math.min(
    ctx.constraints.maxHoursPerWeek,
    contractCap,
    employee.max_hours_per_week,
  );
  const weekPctUsed = effectiveWeekly > 0 ? (weekHoursUsed + slot.durationHours) / effectiveWeekly : 0;
  if (weekPctUsed >= 0.85) score -= 30;

  // Penalización por días consecutivos cerca del cap
  const wouldBeConsecutive = tracker.lastShiftDate === prevDateStr(slot.date)
    ? tracker.consecutiveDays + 1
    : 1;
  const consecutiveSlack = ctx.constraints.maxConsecutiveDays - wouldBeConsecutive;
  if (consecutiveSlack <= 1) score -= 50;
```

- [ ] **Step 5: Verificar PASS**

```bash
npm run test -- schedule-generator
```
Expected: PASS, total = 251 tests (249 + 2 nuevos).

- [ ] **Step 6: Build + suite**

```bash
npm run build && npm run test
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(schedule): score penaliza candidatos cerca de cap (semanal/consecutivo)"
```

---

## Task 4: `schedule-health.ts` helper puro (TDD)

**Files:**
- Create: `src/lib/schedule-health.ts`
- Create: `src/lib/schedule-health.test.ts`

- [ ] **Step 1: Escribir tests fallando**

Crear `src/lib/schedule-health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeHealth, type HealthSummary } from "./schedule-health";
import type {
  Profile, ScheduleEntry, StaffingRequirement, LaborConstraints,
} from "./types";

const constraints: LaborConstraints = {
  maxHoursPerWeek: 40, maxHoursPerDay: 10,
  minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6,
};

const E1: Profile = {
  id: "e1", first_name: "Ana", last_name: "Pérez", email: null, phone: null,
  role: "employee", position_id: null, location_id: "loc-1",
  max_hours_per_week: 40, is_active: true, is_demo: false,
  contract_type_id: null, hire_date: null, termination_date: null,
  is_terminated: false, arl_risk_class: 1, created_at: "", updated_at: "",
};

const E2: Profile = { ...E1, id: "e2", first_name: "Beto", last_name: "Gómez" };

const SR: StaffingRequirement[] = [
  { id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
    day_of_week: 1, required_count: 1, created_at: "", updated_at: "" },
  { id: "sr-2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
    day_of_week: 2, required_count: 1, created_at: "", updated_at: "" },
];

function mkEntry(opts: {
  date: string; employeeId: string; status?: "none" | "pending" | "approved" | "rejected";
  start?: string; end?: string;
}): ScheduleEntry {
  return {
    id: `${opts.employeeId}-${opts.date}`, schedule_id: "sched-1",
    employee_id: opts.employeeId, position_id: "pos-1",
    date: opts.date, start_time: opts.start ?? "09:00", end_time: opts.end ?? "17:00",
    shift_template_id: "tpl-m", notes: null, created_at: "", updated_at: "",
    exceeds_caps: [], overtime_status: opts.status ?? "none",
    overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
  };
}

describe("computeHealth", () => {
  it("vacío: 0/0", () => {
    const h = computeHealth([], [], [], constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(0);
    expect(h.totalAssigned).toBe(0);
    expect(h.totalGaps).toBe(0);
  });

  it("100% sin extras", () => {
    // Abril 2026: 4 lunes (6, 13, 20, 27) + 4 martes (7, 14, 21, 28) = 8 turnos requeridos
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1" }),
      mkEntry({ date: "2026-04-13", employeeId: "e2" }),
      mkEntry({ date: "2026-04-14", employeeId: "e2" }),
      mkEntry({ date: "2026-04-20", employeeId: "e1" }),
      mkEntry({ date: "2026-04-21", employeeId: "e1" }),
      mkEntry({ date: "2026-04-27", employeeId: "e2" }),
      mkEntry({ date: "2026-04-28", employeeId: "e2" }),
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(8);
    expect(h.totalAssigned).toBe(8);
    expect(h.totalAssignedNoExtras).toBe(8);
    expect(h.totalPendingExtras).toBe(0);
    expect(h.totalGaps).toBe(0);
  });

  it("mezcla: extras + gaps", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", status: "pending" }),
      mkEntry({ date: "2026-04-13", employeeId: "e2", status: "pending" }),
      // Faltan: 14, 20, 21, 27, 28 — 5 gaps
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(8);
    expect(h.totalAssigned).toBe(3);
    expect(h.totalAssignedNoExtras).toBe(1);
    expect(h.totalPendingExtras).toBe(2);
    expect(h.totalGaps).toBe(5);
  });

  it("ignora entries con status=rejected", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", status: "rejected" }),
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalAssigned).toBe(1);
    expect(h.totalGaps).toBe(7);
  });

  it("detecta empleados saturados — días consecutivos ≥ cap", () => {
    const dates = [
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10", "2026-04-11",
    ];
    const entries: ScheduleEntry[] = dates.map((date) =>
      mkEntry({ date, employeeId: "e1" })
    );
    const h = computeHealth(entries, [E1, E2], [], constraints, "loc-1", 2026, 4);
    const e1Sat = h.saturatedEmployees.find((s) => s.employeeId === "e1");
    expect(e1Sat).toBeDefined();
    expect(e1Sat?.consecutiveDays).toBe(6);
    expect(e1Sat?.flags).toContain("near_consecutive_cap");
  });

  it("flagged empleados al ≥85% de horas semana", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-08", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-09", employeeId: "e1", start: "09:00", end: "18:00" }),
      // 4 × 9h = 36h en la semana ISO del 6 abr → 36/40 = 90% (≥85%)
    ];
    const h = computeHealth(entries, [E1, E2], [], constraints, "loc-1", 2026, 4);
    const e1Sat = h.saturatedEmployees.find((s) => s.employeeId === "e1");
    expect(e1Sat?.flags).toContain("near_weekly_cap");
  });
});
```

- [ ] **Step 2: Verificar FAIL**

```bash
npm run test -- schedule-health
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar `computeHealth`**

Crear `src/lib/schedule-health.ts`:

```ts
import type {
  Profile, ScheduleEntry, StaffingRequirement, LaborConstraints,
} from "./types";

export interface SaturatedEmployee {
  employeeId: string;
  name: string;
  weekHoursPct: number;
  consecutiveDays: number;
  flags: ("near_weekly_cap" | "near_consecutive_cap" | "exceeded")[];
}

export interface HealthGap {
  date: string;
  positionId: string;
  shiftTemplateId: string;
}

export interface HealthSummary {
  totalRequired: number;
  totalAssigned: number;
  totalAssignedNoExtras: number;
  totalPendingExtras: number;
  totalGaps: number;
  saturatedEmployees: SaturatedEmployee[];
  gapsByDay: HealthGap[];
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

function isoWeekKey(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNum;
}

function hoursDuration(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}

function prevDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeHealth(
  entries: ScheduleEntry[],
  employees: Profile[],
  staffing: StaffingRequirement[],
  constraints: LaborConstraints,
  locationId: string,
  year: number,
  month: number,
): HealthSummary {
  // Filtrar entries que cuentan: no rejected
  const counted = entries.filter((e) => e.overtime_status !== "rejected");

  // Total required del mes: sumar staffing × ocurrencias del day_of_week en el mes
  const days = getDaysInMonth(year, month);
  let totalRequired = 0;
  for (const day of days) {
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    for (const sr of staffing) {
      if (sr.location_id !== locationId) continue;
      if (sr.day_of_week === dow) totalRequired += sr.required_count;
    }
  }

  const totalAssigned = counted.length;
  const totalPendingExtras = counted.filter((e) => e.overtime_status === "pending").length;
  const totalAssignedNoExtras = totalAssigned - totalPendingExtras;
  const totalGaps = Math.max(0, totalRequired - totalAssigned);

  // Gaps: por (day, position, shift) — slots en staffing que no fueron cubiertos
  const assignedKeys = new Set(
    counted.map((e) => `${e.date}|${e.position_id}|${e.shift_template_id}`),
  );
  const gapsByDay: HealthGap[] = [];
  for (const day of days) {
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    for (const sr of staffing) {
      if (sr.location_id !== locationId) continue;
      if (sr.day_of_week !== dow) continue;
      const key = `${day}|${sr.position_id}|${sr.shift_template_id}`;
      const assignedHere = counted.filter(
        (e) => e.date === day && e.position_id === sr.position_id && e.shift_template_id === sr.shift_template_id,
      ).length;
      for (let i = assignedHere; i < sr.required_count; i++) {
        gapsByDay.push({ date: day, positionId: sr.position_id, shiftTemplateId: sr.shift_template_id });
      }
      void key;
    }
  }

  // Saturación por empleado
  const byEmp = new Map<string, ScheduleEntry[]>();
  for (const e of counted) {
    const arr = byEmp.get(e.employee_id) ?? [];
    arr.push(e);
    byEmp.set(e.employee_id, arr);
  }

  const saturated: SaturatedEmployee[] = [];
  for (const emp of employees) {
    const empEntries = (byEmp.get(emp.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (empEntries.length === 0) continue;

    const effectiveWeekly = Math.min(
      constraints.maxHoursPerWeek,
      emp.max_hours_per_week,
    );

    // Max horas por semana ISO del mes
    let maxWeekPct = 0;
    const weekHours = new Map<number, number>();
    for (const e of empEntries) {
      const wk = isoWeekKey(e.date);
      const dur = hoursDuration(e.start_time, e.end_time);
      weekHours.set(wk, (weekHours.get(wk) ?? 0) + dur);
    }
    for (const h of weekHours.values()) {
      const pct = effectiveWeekly > 0 ? h / effectiveWeekly : 0;
      if (pct > maxWeekPct) maxWeekPct = pct;
    }

    // Max días consecutivos (sin gap)
    let maxConsecutive = 0;
    let run = 0;
    let lastDate: string | null = null;
    for (const e of empEntries) {
      if (lastDate && e.date === prevDate(lastDate.replace(/-(\d{2})$/, (_, d) =>
        `-${String(Number(d) + 1).padStart(2, "0")}`)) === false) {
        // forma robusta: comparar contra el día siguiente al lastDate
      }
      if (lastDate === null) {
        run = 1;
      } else {
        const expectedNext = (() => {
          const d = new Date(lastDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        run = e.date === expectedNext ? run + 1 : 1;
      }
      if (run > maxConsecutive) maxConsecutive = run;
      lastDate = e.date;
    }

    const flags: SaturatedEmployee["flags"] = [];
    if (maxWeekPct >= 0.85) flags.push("near_weekly_cap");
    if (maxConsecutive >= constraints.maxConsecutiveDays) flags.push("near_consecutive_cap");
    if (maxWeekPct > 1 || maxConsecutive > constraints.maxConsecutiveDays) flags.push("exceeded");

    if (flags.length > 0) {
      saturated.push({
        employeeId: emp.id,
        name: `${emp.first_name} ${emp.last_name}`,
        weekHoursPct: maxWeekPct,
        consecutiveDays: maxConsecutive,
        flags,
      });
    }
  }

  return {
    totalRequired,
    totalAssigned,
    totalAssignedNoExtras,
    totalPendingExtras,
    totalGaps,
    saturatedEmployees: saturated,
    gapsByDay,
  };
}
```

- [ ] **Step 4: Verificar PASS**

```bash
npm run test -- schedule-health
```
Expected: PASS (6 tests).

- [ ] **Step 5: Build + suite**

```bash
npm run build && npm run test
```
Expected: 257 tests (251 + 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/schedule-health.ts src/lib/schedule-health.test.ts
git commit -m "feat(schedule): computeHealth helper con tests TDD"
```

---

## Task 5: `<ScheduleHealthBanner />`

**Files:**
- Create: `src/components/schedule/schedule-health-banner.tsx`

- [ ] **Step 1: Implementar**

Crear `src/components/schedule/schedule-health-banner.tsx`:

```tsx
"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HealthSummary } from "@/lib/schedule-health";

interface ScheduleHealthBannerProps {
  health: HealthSummary;
  onOpenPanel?: () => void;
}

export function ScheduleHealthBanner({ health, onOpenPanel }: ScheduleHealthBannerProps) {
  if (health.totalPendingExtras === 0 && health.totalGaps === 0) return null;

  const parts: string[] = [];
  if (health.totalPendingExtras > 0)
    parts.push(`${health.totalPendingExtras} ${health.totalPendingExtras === 1 ? "turno pendiente" : "turnos pendientes"} de aprobación`);
  if (health.totalGaps > 0)
    parts.push(`${health.totalGaps} ${health.totalGaps === 1 ? "turno sin cubrir" : "turnos sin cubrir"}`);

  return (
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 text-amber-900">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{parts.join(" · ")}</span>
      </div>
      <div className="flex gap-2">
        {onOpenPanel && (
          <Button variant="ghost" size="sm" onClick={onOpenPanel}>
            Ver detalle
          </Button>
        )}
        {health.totalPendingExtras > 0 && (
          <Link href="/requests">
            <Button variant="outline" size="sm">Aprobar extras</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/schedule-health-banner.tsx
git commit -m "feat(schedule): add ScheduleHealthBanner sticky"
```

---

## Task 6: `<ScheduleHealthPanel />`

**Files:**
- Create: `src/components/schedule/schedule-health-panel.tsx`

- [ ] **Step 1: Implementar**

Crear `src/components/schedule/schedule-health-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HealthSummary } from "@/lib/schedule-health";

interface ScheduleHealthPanelProps {
  health: HealthSummary;
  shiftTemplatesById: Record<string, { name: string }>;
  positionsById: Record<string, { name: string }>;
}

export function ScheduleHealthPanel({
  health, shiftTemplatesById, positionsById,
}: ScheduleHealthPanelProps) {
  const [open, setOpen] = useState(false);

  const coverageNoExtrasPct = health.totalRequired > 0
    ? Math.round((health.totalAssignedNoExtras / health.totalRequired) * 100)
    : 0;
  const coverageWithExtrasPct = health.totalRequired > 0
    ? Math.round((health.totalAssigned / health.totalRequired) * 100)
    : 0;

  const allHealthy =
    health.totalRequired > 0
    && health.totalGaps === 0
    && health.totalPendingExtras === 0
    && health.saturatedEmployees.length === 0;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {allHealthy ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            Salud del horario
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {open ? "Ocultar" : "Ver detalle"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Cobertura sin extras: <strong className="text-foreground">{coverageNoExtrasPct}%</strong> ({health.totalAssignedNoExtras}/{health.totalRequired})</span>
          {health.totalPendingExtras > 0 && (
            <span>· Con extras: <strong className="text-amber-700">{coverageWithExtrasPct}%</strong></span>
          )}
          {health.totalGaps > 0 && (
            <span>· <strong className="text-red-700">{health.totalGaps} sin cubrir</strong></span>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {health.saturatedEmployees.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Empleados saturados</h3>
              <ul className="space-y-1 text-sm">
                {health.saturatedEmployees.map((e) => (
                  <li key={e.employeeId} className="flex items-center justify-between">
                    <span>{e.name}</span>
                    <div className="flex gap-1">
                      {e.flags.includes("near_weekly_cap") && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          {Math.round(e.weekHoursPct * 100)}% horas semana
                        </Badge>
                      )}
                      {e.flags.includes("near_consecutive_cap") && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          {e.consecutiveDays} días consecutivos
                        </Badge>
                      )}
                      {e.flags.includes("exceeded") && (
                        <Badge variant="destructive">Excede cap</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health.gapsByDay.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Slots sin cubrir ({health.gapsByDay.length})</h3>
              <ul className="space-y-1 text-xs text-muted-foreground max-h-48 overflow-y-auto">
                {health.gapsByDay.map((g, idx) => (
                  <li key={`${g.date}-${g.positionId}-${g.shiftTemplateId}-${idx}`}>
                    <span className="text-foreground">{g.date}</span>
                    {" · "}
                    {positionsById[g.positionId]?.name ?? "Posición desconocida"}
                    {" · "}
                    {shiftTemplatesById[g.shiftTemplateId]?.name ?? "Turno desconocido"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allHealthy && (
            <p className="text-sm text-emerald-700">
              El horario está saludable: cobertura completa, sin extras pendientes ni empleados saturados.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/schedule-health-panel.tsx
git commit -m "feat(schedule): add ScheduleHealthPanel expansible"
```

---

## Task 7: Bloque de resumen mejorado en la dialog post-auto-gen

**Files:**
- Modify: `src/components/schedule/auto-generate-dialog.tsx`

Spec: §3.2 — agrupar warnings por empleado/causa, mostrar slots sin cubrir explícitos.

- [ ] **Step 1: Encontrar y modificar el bloque de resultados**

Lee primero el archivo, busca la sección donde renderiza `result.warnings` (alrededor línea ~681). Antes del map de warnings, agregá un bloque de resumen con:

```tsx
{result && (() => {
  const totalAssigned = result.entries.length;
  const totalExtras = result.entries.filter((e) => e.overtime_status === "pending").length;
  const totalNoExtras = totalAssigned - totalExtras;
  const gaps = result.warnings.filter(
    (w) => w.kind === "coverage_gap" || w.kind === "no_safe_candidate",
  ).length;

  // Agrupar extras por empleado
  const extrasByEmp = new Map<string, { name: string; reasons: Set<string> }>();
  for (const w of result.warnings) {
    if (w.kind === "overtime_assigned") {
      const empName = employeeNameMap.get(w.employeeId) ?? "Empleado";
      const entry = extrasByEmp.get(w.employeeId) ?? { name: empName, reasons: new Set() };
      for (const cap of w.caps) {
        const label = cap === "weekly_hours" ? "Horas semana"
          : cap === "consecutive_days" ? "Días consecutivos"
          : cap === "night_limit" ? "Turnos nocturnos"
          : cap === "sundays_quarter" ? "Domingos del trimestre"
          : "Festivos del trimestre";
        entry.reasons.add(label);
      }
      extrasByEmp.set(w.employeeId, entry);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 mb-3 space-y-2 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-emerald-700">
          <strong>{totalNoExtras}</strong> turnos asignados sin extras
        </span>
        {totalExtras > 0 && (
          <span className="text-amber-700">
            <strong>{totalExtras}</strong> requieren aprobación de extras
          </span>
        )}
        {gaps > 0 && (
          <span className="text-red-700">
            <strong>{gaps}</strong> sin cubrir
          </span>
        )}
      </div>
      {extrasByEmp.size > 0 && (
        <div className="text-xs text-muted-foreground">
          {Array.from(extrasByEmp.values()).map((e) => (
            <div key={e.name}>
              · <strong className="text-foreground">{e.name}</strong> — {Array.from(e.reasons).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
})()}
```

NOTA: el componente probablemente ya tiene un `employeeNameMap` o algo similar. Si no lo tiene, construilo localmente desde la prop `employees: Profile[]`. Si la prop no existe, buscala en cómo se llama el componente desde `schedule-page.tsx`.

- [ ] **Step 2: Asegurar que `coverage_gap` se renderea como kind nuevo**

Buscá donde renderiza grupos de warnings (línea ~704 `if (g.kind === "no_safe_candidate")`). Agregá un branch para `coverage_gap`:

```tsx
if (g.kind === "coverage_gap") {
  return (
    <li key={g.kind} className="text-red-700">
      {g.items.length} {g.items.length === 1 ? "slot quedó sin cubrir" : "slots quedaron sin cubrir"} —
      todos los empleados elegibles ya estaban en cap inviolable.
      {/* Optional: mostrar lista expansible de items */}
    </li>
  );
}
```

(Adaptá el render al patrón existente del archivo — `g.items` puede llamarse de otra manera.)

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/auto-generate-dialog.tsx
git commit -m "feat(schedule): dialog post-auto-gen — resumen claro por empleado y gaps"
```

---

## Task 8: Mount banner + panel en `/schedule/page.tsx`

**Files:**
- Modify: `src/app/(authenticated)/schedule/page.tsx`

- [ ] **Step 1: Importar y montar**

Lee el archivo. Encuentra dónde se renderiza la grilla del schedule. Antes de la grilla, importar y montar:

```tsx
import { ScheduleHealthBanner } from "@/components/schedule/schedule-health-banner";
import { ScheduleHealthPanel } from "@/components/schedule/schedule-health-panel";
import { computeHealth } from "@/lib/schedule-health";
```

Calcular `health` con `useMemo`:

```tsx
const health = useMemo(() => {
  if (!selectedLocationId || entries.length === 0 && staffingRequirements.length === 0) {
    return null;
  }
  return computeHealth(
    entries,
    employees,
    staffingRequirements,
    constraints,
    selectedLocationId,
    selectedYear,
    selectedMonth,
  );
}, [entries, employees, staffingRequirements, constraints, selectedLocationId, selectedYear, selectedMonth]);
```

(Adaptá los nombres de las variables locales del componente. Si `constraints`, `staffingRequirements` o `employees` no están todavía en este componente, agregá las queries en el bloque de fetch existente.)

Renderizar antes de la grilla:

```tsx
{health && <ScheduleHealthBanner health={health} />}
{health && (
  <ScheduleHealthPanel
    health={health}
    shiftTemplatesById={Object.fromEntries(shiftTemplates.map((s) => [s.id, { name: s.name }]))}
    positionsById={Object.fromEntries(positions.map((p) => [p.id, { name: p.name }]))}
  />
)}
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success. Si hay errores, los más probables: `staffingRequirements`, `constraints`, `positions`, `shiftTemplates` no existen aún en el componente — agregá los fetches faltantes.

- [ ] **Step 3: Verificar tests**

```bash
npm run test
```
Expected: 257 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(authenticated\)/schedule/page.tsx
git commit -m "feat(schedule): mount ScheduleHealthBanner + Panel en /schedule"
```

---

## Task 9: Actualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Agregar sección**

Buscá la sección "Equity Model" o similar en `CLAUDE.md`. Después de ella, agregá:

```markdown
### Salud del horario (`/schedule`)

`<ScheduleHealthBanner />` y `<ScheduleHealthPanel />` se calculan con `computeHealth(entries, employees, staffing, constraints, locationId, year, month): HealthSummary` desde `src/lib/schedule-health.ts`. El banner aparece sticky cuando hay turnos `pending` o slots sin cubrir; el panel es expansible y lista cobertura sin/con extras, slots faltantes, y empleados saturados (≥85% horas semana o ≥6 días consecutivos).

`consecutive_days` (Art. 161 CST) ahora es **inviolable** en `generateSchedule` — no se asigna día 7 consecutivo aunque sea Pase 2. Si nadie es elegible, emite warning `coverage_gap` con `reason: "all_at_cap"`. El scoring también penaliza candidatos cerca de sus caps (-30 si ≥85% horas semana, -50 si ≤1 día de holgura consecutivo).
```

- [ ] **Step 2: Build + tests**

```bash
npm run build && npm run test
```
Expected: clean, 257 tests.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: salud del horario y consecutive_days inviolable en CLAUDE.md"
```

---

## Task 10: Smoke + push

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Esperar Vercel deploy** (~2 min)

- [ ] **Step 3: Smoke en chrome**

1. Login admin → `/schedule` con la sede que tiene el horario actual.
2. Verificar que el **banner sticky** aparece arriba de la grilla con conteo de pending/gaps.
3. Verificar que el **panel "Salud del horario"** está debajo, con el resumen de cobertura. Click "Ver detalle" → expande con saturados + lista de gaps.
4. Click "Auto-generar" → en la dialog post-gen, verificar que el bloque de resumen muestra: turnos sin extras / con extras / sin cubrir, agrupados por empleado.
5. Si hay un empleado con 6 días seguidos en el horario actual, regenerar → verificar que el día 7 NO se asigna (queda gap visible) en lugar de quedar como "Extra".

Si todo pasa: marcar plan completo. Si algo falla: anotar el bug en un commit aparte.

---

## Self-review notes

**Spec coverage:**
- §2.1 (consecutive_days inviolable) — Task 2 ✓
- §2.2 (score penaliza saturación) — Task 3 ✓
- §2.3 (coverage_gap warning kind) — Task 1 + Task 2 ✓
- §3.1 (banner sticky) — Task 5 + Task 8 ✓
- §3.2 (dialog post-auto-gen) — Task 7 ✓
- §3.3 (mini-dashboard panel) — Task 6 + Task 8 ✓
- §4 (componentes nuevos) — todos cubiertos en Tasks 4-8 ✓
- §5 (tipos) — Task 4 (`HealthSummary` exportado del helper) ✓
- §6 (edge cases) — cubiertos en `computeHealth` (vacío, sin staffing, etc.) y en condicionales del banner/panel ✓
- §7 (testing) — Tasks 2, 3, 4 con tests Vitest ✓
- §8 (deliverables) — todos listados ✓

**Type consistency:** `HealthSummary`, `SaturatedEmployee`, `HealthGap` consistentes entre Task 4 y Tasks 5/6/8. `coverage_gap` en Tasks 1, 2 y 7 con la misma forma `{ kind, positionId, date, shiftTemplateId, reason }`.

**Placeholder scan:** Tasks 7 y 8 tienen una nota "adaptá los nombres de las variables locales" — eso requiere que el implementador lea el archivo destino. Es razonable porque los archivos existen y tienen contexto. No es un placeholder true sino una guía de adaptación. Si la subagent tiene dudas, debe preguntar.

**Granularidad:** Tasks 1-4 son TDD/lógica, individuales. Tasks 5-6 UI mecánicos, individuales. Task 7 es UI denso (modificación), individual. Task 8 es integración. Task 9 docs. Task 10 smoke.
