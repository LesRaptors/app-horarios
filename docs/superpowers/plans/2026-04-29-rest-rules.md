# Reglas de descanso parametrizables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Sistema plug-in de reglas de descanso (5 tipos) configurables por contract_type, con UI guiada (presets + cards + preview 14 días) y aplicación inviolable en el motor.

**Architecture:** Nueva tabla `contract_rest_rules` con `params jsonb`. Helpers puros TDD por cada tipo de regla. Motor lee reglas del contract y aplica `isRestDay` como inviolable. Form de `/contract-types` rediseñado con presets + cards editables + preview.

**Tech Stack:** Postgres, TypeScript, Vitest, shadcn (RadioGroup, Card, DatePicker, Slider o Input), Next.js. Sin nuevas dependencias.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/036_contract_rest_rules.sql` | create | tabla + RLS + trigger updated_at |
| `src/lib/types.ts` | modify | tipos `RestRule`, `RestRuleType`, params |
| `src/lib/rest-rules.ts` | create | helpers puros: `isWorkCycleRest`, `isWeekendRotationRest`, `isPostNightRest`, `exceedsMaxConsecutiveNights`, `needsCompensatory`, `isRestDay` (despachador) |
| `src/lib/rest-rules.test.ts` | create | ~18 tests TDD |
| `src/lib/schedule-generator.ts` | modify | sección REST RULES inviolable + `restRulesByContract` en context |
| `src/lib/schedule-generator.test.ts` | modify | 1 test integración (work_cycle aplicado) |
| `src/app/(authenticated)/contract-types/page.tsx` | modify | columna "Reglas" en tabla |
| `src/components/contract-types/contract-type-form.tsx` | modify | sección reglas con presets + cards |
| `src/components/contract-types/rest-rule-cards.tsx` | create | sub-componente con cards editables por tipo |
| `src/components/contract-types/rest-rule-preview.tsx` | create | mini-grilla 14 días con ✓/─ |
| `src/components/employees/employee-row-badge.tsx` (o donde renderice tabla) | modify | badge "Ciclo 4×3" / "Findes alt." |
| `src/components/schedule/schedule-health-panel.tsx` | modify | listado por empleado: "descanso por regla X los días..." |
| `CLAUDE.md` | modify | sección Reglas de descanso |

---

## Convention reminders

- **Spanish UI** con tildes (más, días, posición, semana, ciclo, descanso).
- **No emojis** en source files; lucide icons (RotateCw, Moon, Sun, CalendarOff, etc.).
- TDD estricto en helpers (`rest-rules.ts`).
- `npm run build && npm run test` antes de cada commit.
- Tests baseline: 262. Tras todo el plan: ~281 (+18 tests rest-rules + 1 integración generator).
- shadcn ya tiene RadioGroup, Card, Switch. Si DatePicker no está, instalar `npx shadcn@latest add calendar popover` (DatePicker = combinación de Calendar + Popover, patrón estándar shadcn).

---

## Task 1: Migración 036 + tipos TS

**Files:**
- Create: `supabase/migrations/036_contract_rest_rules.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Escribir SQL**

```sql
-- Migración 036: reglas de descanso parametrizables por contract_type.

CREATE TABLE contract_rest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type_id UUID NOT NULL REFERENCES contract_types(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'work_cycle',
    'weekend_rotation',
    'post_night_rest',
    'max_consecutive_nights',
    'compensatory_day'
  )),
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_rest_rules_contract ON contract_rest_rules(contract_type_id);

ALTER TABLE contract_rest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_rules_select" ON contract_rest_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rest_rules_admin_write" ON contract_rest_rules
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager'))
  WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contract_rest_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Tool: `mcp__plugin_supabase_supabase__apply_migration`. Args: name=`036_contract_rest_rules`, project_id=`ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verificar via execute_sql**

```sql
SELECT table_name FROM information_schema.tables WHERE table_name='contract_rest_rules';
SELECT policyname FROM pg_policies WHERE tablename='contract_rest_rules';
```

Expected: tabla presente, 2 policies.

- [ ] **Step 4: Tipos TS**

En `src/lib/types.ts`, agregar al final:

```ts
// Reglas de descanso (migración 036)
export type RestRuleType =
  | "work_cycle"
  | "weekend_rotation"
  | "post_night_rest"
  | "max_consecutive_nights"
  | "compensatory_day";

export interface WorkCycleParams {
  work_days: number;
  rest_days: number;
  cycle_start_date: string;
}

export interface WeekendRotationParams {
  every_n_weeks: number;
  offset: 0 | 1;
  include_saturday: boolean;
  include_sunday: boolean;
}

export interface PostNightRestParams {
  nights_threshold: number;
  rest_days_required: number;
}

export interface MaxConsecutiveNightsParams {
  max: number;
}

export interface CompensatoryDayParams {
  applies_to: "sundays" | "holidays" | "both";
  within_days: number;
}

export type RestRuleParams =
  | WorkCycleParams
  | WeekendRotationParams
  | PostNightRestParams
  | MaxConsecutiveNightsParams
  | CompensatoryDayParams;

export interface RestRule {
  id: string;
  contract_type_id: string;
  rule_type: RestRuleType;
  params: RestRuleParams;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Build + tests**

```bash
npm run build && npm run test
```
Expected: 262 tests, build clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/036_contract_rest_rules.sql src/lib/types.ts
git commit -m "feat(rest-rules): mig 036 + tipos — reglas de descanso parametrizables"
```

---

## Task 2: Helpers puros — TDD por tipo de regla

**Files:**
- Create: `src/lib/rest-rules.ts`
- Create: `src/lib/rest-rules.test.ts`

- [ ] **Step 1: Tests fallando — `isWorkCycleRest`**

Crear `src/lib/rest-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isWorkCycleRest,
  isWeekendRotationRest,
  isPostNightRest,
  exceedsMaxConsecutiveNights,
  needsCompensatory,
  isRestDay,
} from "./rest-rules";
import type {
  WorkCycleParams, WeekendRotationParams, PostNightRestParams,
  MaxConsecutiveNightsParams, CompensatoryDayParams, RestRule,
  ScheduleEntry, ShiftTemplate,
} from "./types";

describe("isWorkCycleRest", () => {
  const params: WorkCycleParams = {
    work_days: 4,
    rest_days: 3,
    cycle_start_date: "2026-04-06",  // lunes
  };

  it("primer día del ciclo → trabajo", () => {
    expect(isWorkCycleRest(params, "2026-04-06")).toBe(false);
  });

  it("4to día (jueves) → trabajo", () => {
    expect(isWorkCycleRest(params, "2026-04-09")).toBe(false);
  });

  it("5to día (viernes) → descanso", () => {
    expect(isWorkCycleRest(params, "2026-04-10")).toBe(true);
  });

  it("7mo día (domingo) → descanso", () => {
    expect(isWorkCycleRest(params, "2026-04-12")).toBe(true);
  });

  it("8vo día (lunes) → trabajo (siguiente ciclo)", () => {
    expect(isWorkCycleRest(params, "2026-04-13")).toBe(false);
  });

  it("antes del anchor → trabajo (regla no aplica todavía)", () => {
    expect(isWorkCycleRest(params, "2026-04-01")).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm run test -- rest-rules
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar `rest-rules.ts` mínimo + `isWorkCycleRest`**

Crear `src/lib/rest-rules.ts`:

```ts
import type {
  WorkCycleParams, WeekendRotationParams, PostNightRestParams,
  MaxConsecutiveNightsParams, CompensatoryDayParams, RestRule,
  ScheduleEntry, ShiftTemplate,
} from "./types";

function daysBetweenISO(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function dowUTC(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

export function isWorkCycleRest(
  params: WorkCycleParams,
  date: string,
): boolean {
  const offset = daysBetweenISO(params.cycle_start_date, date);
  if (offset < 0) return false;
  const cycleLen = params.work_days + params.rest_days;
  if (cycleLen <= 0) return false;
  const positionInCycle = offset % cycleLen;
  return positionInCycle >= params.work_days;
}
```

- [ ] **Step 4: PASS**

```bash
npm run test -- rest-rules
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rest-rules.ts src/lib/rest-rules.test.ts
git commit -m "feat(rest-rules): isWorkCycleRest + 6 tests TDD"
```

---

## Task 3: `isWeekendRotationRest` (TDD)

**Files:**
- Modify: `src/lib/rest-rules.ts`
- Modify: `src/lib/rest-rules.test.ts`

- [ ] **Step 1: Tests fallando**

Append a `src/lib/rest-rules.test.ts`:

```ts
describe("isWeekendRotationRest", () => {
  const params: WeekendRotationParams = {
    every_n_weeks: 2,
    offset: 0,
    include_saturday: true,
    include_sunday: true,
  };

  it("sábado en semana de descanso (ISO 14, par con offset 0) → descanso", () => {
    // 2026-04-04 = sábado, ISO week 14 (par)
    expect(isWeekendRotationRest(params, "2026-04-04")).toBe(true);
  });

  it("domingo en semana de descanso → descanso", () => {
    // 2026-04-05 = domingo, ISO week 14
    expect(isWeekendRotationRest(params, "2026-04-05")).toBe(true);
  });

  it("sábado en semana de trabajo (ISO 15, impar) → trabajo", () => {
    // 2026-04-11 = sábado, ISO week 15
    expect(isWeekendRotationRest(params, "2026-04-11")).toBe(false);
  });

  it("día entre semana → trabajo (no aplica regla)", () => {
    expect(isWeekendRotationRest(params, "2026-04-08")).toBe(false);
  });

  it("offset 1 invierte el comportamiento", () => {
    const p2: WeekendRotationParams = { ...params, offset: 1 };
    expect(isWeekendRotationRest(p2, "2026-04-04")).toBe(false);
    expect(isWeekendRotationRest(p2, "2026-04-11")).toBe(true);
  });

  it("solo sábado (include_sunday=false) → domingo siempre trabajo", () => {
    const p3: WeekendRotationParams = { ...params, include_sunday: false };
    expect(isWeekendRotationRest(p3, "2026-04-04")).toBe(true);  // sáb descanso
    expect(isWeekendRotationRest(p3, "2026-04-05")).toBe(false); // dom trabajo
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm run test -- rest-rules
```

- [ ] **Step 3: Implementar**

Append a `src/lib/rest-rules.ts`:

```ts
function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function isWeekendRotationRest(
  params: WeekendRotationParams,
  date: string,
): boolean {
  const dow = dowUTC(date);
  if (dow === 6 && !params.include_saturday) return false;
  if (dow === 0 && !params.include_sunday) return false;
  if (dow !== 0 && dow !== 6) return false;
  const week = isoWeekNumber(date);
  return week % params.every_n_weeks === params.offset;
}
```

- [ ] **Step 4: PASS + commit**

```bash
npm run test -- rest-rules
git add src/lib/rest-rules.ts src/lib/rest-rules.test.ts
git commit -m "feat(rest-rules): isWeekendRotationRest + 6 tests"
```

---

## Task 4: `isPostNightRest` + `exceedsMaxConsecutiveNights` (TDD)

**Files:**
- Modify: `src/lib/rest-rules.ts`
- Modify: `src/lib/rest-rules.test.ts`

- [ ] **Step 1: Tests fallando**

Append:

```ts
function mkEntry(date: string, isNight: boolean): ScheduleEntry {
  return {
    id: `e-${date}`, schedule_id: "s1", employee_id: "u1",
    position_id: "p1", date,
    start_time: isNight ? "22:00" : "09:00",
    end_time: isNight ? "06:00" : "17:00",
    shift_template_id: isNight ? "tpl-n" : "tpl-d",
    notes: null, created_at: "", updated_at: "",
    exceeds_caps: [], overtime_status: "none",
    overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
  };
}

const nightTemplate: ShiftTemplate = {
  id: "tpl-n", name: "Noche", start_time: "22:00", end_time: "06:00",
  duration_hours: 8, color: "#000", location_id: "loc-1",
  is_night: true, created_at: "", updated_at: "",
};

const dayTemplate: ShiftTemplate = {
  ...nightTemplate, id: "tpl-d", name: "Día",
  start_time: "09:00", end_time: "17:00", is_night: false,
};

describe("isPostNightRest", () => {
  const params: PostNightRestParams = { nights_threshold: 3, rest_days_required: 2 };

  it("sin noches recientes → no requiere descanso", () => {
    expect(isPostNightRest(params, "2026-04-10", [])).toBe(false);
  });

  it("3 noches consecutivas previas → días 4 y 5 son descanso", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-10", recent)).toBe(true);
    expect(isPostNightRest(params, "2026-04-11", recent)).toBe(true);
  });

  it("día 6 después de 3 noches → trabajo (descanso ya cumplido)", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-12", recent)).toBe(false);
  });

  it("solo 2 noches → no aplica (no llega al threshold)", () => {
    const recent = [
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-10", recent)).toBe(false);
  });
});

describe("exceedsMaxConsecutiveNights", () => {
  const params: MaxConsecutiveNightsParams = { max: 3 };

  it("0 noches previas + slot nocturno → OK", () => {
    expect(exceedsMaxConsecutiveNights(params, [], true)).toBe(false);
  });

  it("3 noches consecutivas + slot nocturno (4to día) → excede", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(exceedsMaxConsecutiveNights(params, recent, true)).toBe(true);
  });

  it("3 noches consecutivas + slot diurno → OK (no es noche)", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(exceedsMaxConsecutiveNights(params, recent, false)).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm run test -- rest-rules
```

- [ ] **Step 3: Implementar**

Append a `src/lib/rest-rules.ts`:

```ts
function countTrailingConsecutiveNights(
  recent: ScheduleEntry[],
  beforeDate: string,
): number {
  // recent debe estar ordenado por date asc; lo invertimos.
  const sorted = [...recent]
    .filter((e) => e.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  let count = 0;
  let expectedDate = (() => {
    const d = new Date(beforeDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  for (const entry of sorted) {
    if (entry.date !== expectedDate) break;
    const isNight = entry.start_time >= "21:00" || entry.start_time < "06:00";
    if (!isNight) break;
    count++;
    const d = new Date(expectedDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    expectedDate = d.toISOString().slice(0, 10);
  }
  return count;
}

export function isPostNightRest(
  params: PostNightRestParams,
  date: string,
  recent: ScheduleEntry[],
): boolean {
  const consecutive = countTrailingConsecutiveNights(recent, date);
  if (consecutive < params.nights_threshold) return false;

  // Si el último turno fue hace más de rest_days_required días, ya cumplió.
  const lastNight = [...recent]
    .filter((e) => e.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!lastNight) return false;
  const daysSince = daysBetweenISO(lastNight.date, date);
  return daysSince <= params.rest_days_required;
}

export function exceedsMaxConsecutiveNights(
  params: MaxConsecutiveNightsParams,
  recent: ScheduleEntry[],
  slotIsNight: boolean,
): boolean {
  if (!slotIsNight) return false;
  const consecutive = countTrailingConsecutiveNights(
    recent,
    new Date().toISOString().slice(0, 10) // dummy; we use slot inferred from caller
  );
  // NOTA: Esta función espera que el caller haya verificado el slot.
  // Para evitar dependencia de fecha actual, repetimos el conteo asumiendo que
  // el slot de hoy se sumaría → si recent ya tiene `max` noches consecutivas
  // en los días previos al slot, agregar el slot excede.
  return consecutive >= params.max;
}
```

NOTA importante: `exceedsMaxConsecutiveNights` necesita la fecha del slot. La firma debería ser `(params, recent, slotDate, slotIsNight)`. Refactorizar para tomar 4 args:

```ts
export function exceedsMaxConsecutiveNights(
  params: MaxConsecutiveNightsParams,
  recent: ScheduleEntry[],
  slotDate: string,
  slotIsNight: boolean,
): boolean {
  if (!slotIsNight) return false;
  const consecutive = countTrailingConsecutiveNights(recent, slotDate);
  return consecutive >= params.max;
}
```

Ajustar los tests para pasar `slotDate`:

```ts
it("3 noches consecutivas + slot nocturno (4to día) → excede", () => {
  const recent = [
    mkEntry("2026-04-07", true),
    mkEntry("2026-04-08", true),
    mkEntry("2026-04-09", true),
  ];
  expect(exceedsMaxConsecutiveNights(params, recent, "2026-04-10", true)).toBe(true);
});
```

- [ ] **Step 4: PASS + commit**

```bash
npm run test -- rest-rules
git add src/lib/rest-rules.ts src/lib/rest-rules.test.ts
git commit -m "feat(rest-rules): isPostNightRest + exceedsMaxConsecutiveNights + 7 tests"
```

---

## Task 5: `needsCompensatory` (TDD)

**Files:**
- Modify: `src/lib/rest-rules.ts`
- Modify: `src/lib/rest-rules.test.ts`

- [ ] **Step 1: Tests fallando**

Append a `src/lib/rest-rules.test.ts`:

```ts
describe("needsCompensatory", () => {
  const params: CompensatoryDayParams = {
    applies_to: "sundays",
    within_days: 7,
  };

  it("sin domingo trabajado → no necesita compensatorio", () => {
    expect(needsCompensatory(params, "2026-04-08", [])).toBe(false);
  });

  it("trabajó dom 5 abr, ya descansó algún día (sin entry para 6 abr) → cumplido", () => {
    const recent = [mkEntry("2026-04-05", false)];  // domingo trabajado
    // Si no hay entry para el 6 abr, ese día está libre → ya cumplió.
    expect(needsCompensatory(params, "2026-04-08", recent)).toBe(false);
  });

  it("trabajó dom 5 + lun a vie (sin libre) → necesita compensatorio el sáb 11", () => {
    const recent = [
      mkEntry("2026-04-05", false), // domingo
      mkEntry("2026-04-06", false), // lun
      mkEntry("2026-04-07", false),
      mkEntry("2026-04-08", false),
      mkEntry("2026-04-09", false),
      mkEntry("2026-04-10", false), // viernes (5 días seguidos sin descanso)
    ];
    expect(needsCompensatory(params, "2026-04-11", recent)).toBe(true);
  });

  it("dom trabajado hace > within_days → ya no aplica", () => {
    const recent = [mkEntry("2026-03-22", false)]; // domingo hace 17+ días
    expect(needsCompensatory(params, "2026-04-08", recent)).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL → implementar → PASS**

Append a `src/lib/rest-rules.ts`:

```ts
function entryIsOnSundayOrHoliday(
  entry: ScheduleEntry,
  appliesTo: "sundays" | "holidays" | "both",
  isHoliday: (date: string) => boolean,
): boolean {
  const dow = dowUTC(entry.date);
  if (appliesTo === "sundays") return dow === 0;
  if (appliesTo === "holidays") return isHoliday(entry.date);
  return dow === 0 || isHoliday(entry.date);
}

export function needsCompensatory(
  params: CompensatoryDayParams,
  date: string,
  recent: ScheduleEntry[],
  isHoliday: (date: string) => boolean = () => false,
): boolean {
  const dateMs = new Date(date + "T00:00:00Z").getTime();
  const lookback = dateMs - params.within_days * 86400000;

  // ¿Hay un dom/festivo trabajado dentro de within_days?
  const triggers = recent.filter((e) => {
    const t = new Date(e.date + "T00:00:00Z").getTime();
    if (t < lookback || t >= dateMs) return false;
    return entryIsOnSundayOrHoliday(e, params.applies_to, isHoliday);
  });

  if (triggers.length === 0) return false;

  // ¿Ya cumplió? Buscar gap (día sin entry) entre el trigger y la fecha actual.
  const trigger = triggers[triggers.length - 1];
  const triggerMs = new Date(trigger.date + "T00:00:00Z").getTime();

  // Iterar día por día desde trigger+1 hasta date-1 buscando gap.
  for (let t = triggerMs + 86400000; t < dateMs; t += 86400000) {
    const candidate = new Date(t).toISOString().slice(0, 10);
    const hasEntry = recent.some((e) => e.date === candidate);
    if (!hasEntry) return false;  // ya hubo un día libre, ya cumplió
  }

  // No encontró día libre entre trigger y date → necesita compensatorio HOY.
  return true;
}
```

- [ ] **Step 3: PASS + commit**

```bash
npm run test -- rest-rules
git add src/lib/rest-rules.ts src/lib/rest-rules.test.ts
git commit -m "feat(rest-rules): needsCompensatory + 4 tests"
```

---

## Task 6: Despachador `isRestDay`

**Files:**
- Modify: `src/lib/rest-rules.ts`
- Modify: `src/lib/rest-rules.test.ts`

- [ ] **Step 1: Test del despachador**

Append a `src/lib/rest-rules.test.ts`:

```ts
describe("isRestDay (despachador)", () => {
  const workCycleRule: RestRule = {
    id: "r1", contract_type_id: "ct1", rule_type: "work_cycle",
    params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-04-06" },
    created_at: "", updated_at: "",
  };

  it("delega correctamente a isWorkCycleRest", () => {
    expect(isRestDay(workCycleRule, "2026-04-10", dayTemplate, [])).toBe(true);
    expect(isRestDay(workCycleRule, "2026-04-09", dayTemplate, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar**

Append a `src/lib/rest-rules.ts`:

```ts
export function isRestDay(
  rule: RestRule,
  date: string,
  template: ShiftTemplate,
  recent: ScheduleEntry[],
  isHoliday: (date: string) => boolean = () => false,
): boolean {
  const slotIsNight = template.is_night;
  switch (rule.rule_type) {
    case "work_cycle":
      return isWorkCycleRest(rule.params as WorkCycleParams, date);
    case "weekend_rotation":
      return isWeekendRotationRest(rule.params as WeekendRotationParams, date);
    case "post_night_rest":
      return isPostNightRest(rule.params as PostNightRestParams, date, recent);
    case "max_consecutive_nights":
      return exceedsMaxConsecutiveNights(rule.params as MaxConsecutiveNightsParams, recent, date, slotIsNight);
    case "compensatory_day":
      return needsCompensatory(rule.params as CompensatoryDayParams, date, recent, isHoliday);
    default:
      return false;
  }
}
```

- [ ] **Step 3: PASS + build + suite**

```bash
npm run test -- rest-rules
npm run build && npm run test
```
Expected: total ≈ 280 tests (262 + 18 nuevos en rest-rules).

- [ ] **Step 4: Commit**

```bash
git add src/lib/rest-rules.ts src/lib/rest-rules.test.ts
git commit -m "feat(rest-rules): isRestDay despachador + tests integración"
```

---

## Task 7: Motor — sección REST RULES en filterCandidates

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: Test integración**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("rest rules en motor", () => {
  it("contract con work_cycle 4×3 descarta días de descanso", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-cycle",
      // las rest rules no van en contract_type sino en una tabla aparte;
      // las pasamos via el nuevo input restRules del generador.
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-cycle" });
    const tpl = makeTemplate({ id: "tpl-m" });

    const restRules: RestRule[] = [{
      id: "r1", contract_type_id: "ct-cycle",
      rule_type: "work_cycle",
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-04-06" },
      created_at: "", updated_at: "",
    }];

    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"] },
      [emp], [tpl], [], [],
      defaultConstraints,
      // Demand: lun 6 + vie 10 (lun = trabajo, vie = descanso por regla)
      [
        { id: "sr-1", location_id: "loc-1", position_id: "pos-1",
          shift_template_id: "tpl-m", day_of_week: 1, required_count: 1,
          created_at: "", updated_at: "" },
        { id: "sr-2", location_id: "loc-1", position_id: "pos-1",
          shift_template_id: "tpl-m", day_of_week: 5, required_count: 1,
          created_at: "", updated_at: "" },
      ],
      [], [], [ct], defaultWeights,
      restRules,  // nuevo parámetro
    );

    // Lunes 6 abr (trabajo) → asignado.
    expect(result.entries.find((e) => e.date === "2026-04-06")).toBeDefined();
    // Viernes 10 abr (descanso por ciclo 4×3) → no asignado.
    expect(result.entries.find((e) => e.date === "2026-04-10")).toBeUndefined();
  });
});
```

NOTA: requiere agregar `restRules: RestRule[]` como parámetro nuevo a `generateSchedule`.

- [ ] **Step 2: FAIL**

```bash
npm run test -- schedule-generator
```

- [ ] **Step 3: Modificar `generateSchedule` — agregar `restRules` parámetro**

En `src/lib/schedule-generator.ts`:

1. Agregar parámetro `restRules: RestRule[] = []` al final de la firma de `generateSchedule`.
2. Construir `restRulesByContract: Map<string, RestRule[]>` indexando por `rule.contract_type_id`.
3. Pasar a `ctx`:

```ts
interface ScoringContext {
  // ... existente
  restRulesByContract: Map<string, RestRule[]>;
}
```

- [ ] **Step 4: Aplicar reglas en `filterCandidates`**

En la sección INVIOLABLES de `filterCandidates`, después de los chequeos de descanso/rest y disponibilidad por contract pero ANTES de `if (allowOvertime)`:

```ts
    // INVIOLABLE: reglas de descanso del contract
    if (contract && ctx.restRulesByContract.has(contract.id)) {
      const rules = ctx.restRulesByContract.get(contract.id)!;
      const recentEmpEntries = ctx.entriesByEmployee.get(employee.id) ?? [];
      const isHolidayFn = (d: string) => isHoliday(d, ctx.locationId, ctx.holidays);
      const blocked = rules.some((rule) =>
        isRestDay(rule, slot.date, slot.template, recentEmpEntries, isHolidayFn)
      );
      if (blocked) continue;
    }
```

NOTA: `entriesByEmployee` es un index nuevo en el ctx — construirlo a partir de `existingEntries` al inicio de `generateSchedule`:

```ts
const entriesByEmployee = new Map<string, ScheduleEntry[]>();
for (const e of existingEntries) {
  const list = entriesByEmployee.get(e.employee_id) ?? [];
  list.push(e);
  entriesByEmployee.set(e.employee_id, list);
}
```

Importar `isRestDay` desde `./rest-rules`.

- [ ] **Step 5: Adaptar callers de `generateSchedule`**

Buscar dónde se llama (probablemente `auto-generate-dialog.tsx`). Agregar fetch de `contract_rest_rules` y pasar como nuevo argumento. Por ahora, en la integración del dialog, pasar `[]` como default si la query falla.

- [ ] **Step 6: PASS + build + suite**

```bash
npm run test -- schedule-generator
npm run build && npm run test
```
Expected: ~281 tests (280 + 1 integración nuevo).

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts src/components/schedule/auto-generate-dialog.tsx
git commit -m "feat(schedule): aplicar rest rules como inviolable en filterCandidates"
```

---

## Task 8: Componente `<RestRulePreview />` (mini grilla 14 días)

**Files:**
- Create: `src/components/contract-types/rest-rule-preview.tsx`

- [ ] **Step 1: Implementar**

Crear `src/components/contract-types/rest-rule-preview.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { isRestDay } from "@/lib/rest-rules";
import type { RestRule, ShiftTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RestRulePreviewProps {
  rules: RestRule[];
  startDate?: string;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_SHOWN = 14;
const dummyTemplate: ShiftTemplate = {
  id: "preview", name: "preview", start_time: "09:00", end_time: "17:00",
  duration_hours: 8, color: "#000", location_id: "",
  is_night: false, created_at: "", updated_at: "",
};

export function RestRulePreview({ rules, startDate }: RestRulePreviewProps) {
  const today = startDate ?? new Date().toISOString().slice(0, 10);

  const days = useMemo(() => {
    const result: { date: string; rest: boolean; dow: number }[] = [];
    const start = new Date(today + "T00:00:00Z");
    for (let i = 0; i < DAYS_SHOWN; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const rest = rules.some((r) => isRestDay(r, dateStr, dummyTemplate, []));
      result.push({ date: dateStr, rest, dow: d.getUTCDay() });
    }
    return result;
  }, [rules, today]);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Próximos {DAYS_SHOWN} días desde {today}
      </p>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {days.map((d) => (
          <div
            key={d.date}
            className={cn(
              "rounded border px-1 py-1 text-center",
              d.rest
                ? "bg-muted text-muted-foreground border-dashed"
                : "bg-emerald-50 text-emerald-900 border-emerald-200"
            )}
            title={`${d.date} — ${d.rest ? "descanso por regla" : "puede trabajar"}`}
          >
            <div className="font-medium">{DAY_LABELS[d.dow]}</div>
            <div className="text-[10px] tabular-nums">
              {Number(d.date.slice(8, 10))}
            </div>
            <div className="text-[10px]">{d.rest ? "—" : "✓"}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground flex gap-3">
        <span>✓ puede trabajar</span>
        <span>— descanso por regla</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/components/contract-types/rest-rule-preview.tsx
git commit -m "feat(contract-types): RestRulePreview — mini grilla 14 días"
```

---

## Task 9: Componente `<RestRuleCards />` (cards editables por tipo)

**Files:**
- Create: `src/components/contract-types/rest-rule-cards.tsx`

Spec ref: §4.2 — cada regla como card con título + parámetros editables + botón [×].

- [ ] **Step 1: Implementar**

Crear `src/components/contract-types/rest-rule-cards.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, RotateCw, Moon, Sun, CalendarOff, Calendar } from "lucide-react";
import type {
  RestRule, RestRuleType,
  WorkCycleParams, WeekendRotationParams, PostNightRestParams,
  MaxConsecutiveNightsParams, CompensatoryDayParams,
} from "@/lib/types";

interface RestRuleCardsProps {
  rules: RestRule[];
  onUpdate: (index: number, params: RestRule["params"]) => void;
  onRemove: (index: number) => void;
}

export function RestRuleCards({ rules, onUpdate, onRemove }: RestRuleCardsProps) {
  return (
    <div className="space-y-3">
      {rules.map((rule, idx) => (
        <RuleCard
          key={rule.id || idx}
          rule={rule}
          onUpdate={(params) => onUpdate(idx, params)}
          onRemove={() => onRemove(idx)}
        />
      ))}
    </div>
  );
}

const ICONS: Record<RestRuleType, React.ComponentType<{ className?: string }>> = {
  work_cycle: RotateCw,
  weekend_rotation: Calendar,
  post_night_rest: Moon,
  max_consecutive_nights: Sun,
  compensatory_day: CalendarOff,
};

const TITLES: Record<RestRuleType, string> = {
  work_cycle: "Ciclo trabajo/descanso",
  weekend_rotation: "Rotación de fines de semana",
  post_night_rest: "Descanso post-noches",
  max_consecutive_nights: "Máximo turnos nocturnos consecutivos",
  compensatory_day: "Día compensatorio",
};

function RuleCard({
  rule, onUpdate, onRemove,
}: { rule: RestRule; onUpdate: (params: RestRule["params"]) => void; onRemove: () => void }) {
  const Icon = ICONS[rule.rule_type];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4" />
          {TITLES[rule.rule_type]}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {rule.rule_type === "work_cycle" && (
          <WorkCycleEditor params={rule.params as WorkCycleParams} onUpdate={onUpdate} />
        )}
        {rule.rule_type === "weekend_rotation" && (
          <WeekendRotationEditor params={rule.params as WeekendRotationParams} onUpdate={onUpdate} />
        )}
        {rule.rule_type === "post_night_rest" && (
          <PostNightRestEditor params={rule.params as PostNightRestParams} onUpdate={onUpdate} />
        )}
        {rule.rule_type === "max_consecutive_nights" && (
          <MaxConsecutiveNightsEditor params={rule.params as MaxConsecutiveNightsParams} onUpdate={onUpdate} />
        )}
        {rule.rule_type === "compensatory_day" && (
          <CompensatoryDayEditor params={rule.params as CompensatoryDayParams} onUpdate={onUpdate} />
        )}
      </CardContent>
    </Card>
  );
}

function WorkCycleEditor({ params, onUpdate }: { params: WorkCycleParams; onUpdate: (p: WorkCycleParams) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Trabaja (días)</Label>
          <Input type="number" min={1} max={30} value={params.work_days}
            onChange={(e) => onUpdate({ ...params, work_days: Number(e.target.value) || 1 })} />
        </div>
        <div>
          <Label>Descansa (días)</Label>
          <Input type="number" min={1} max={30} value={params.rest_days}
            onChange={(e) => onUpdate({ ...params, rest_days: Number(e.target.value) || 1 })} />
        </div>
      </div>
      <div>
        <Label>Inicio del ciclo</Label>
        <Input type="date" value={params.cycle_start_date}
          onChange={(e) => onUpdate({ ...params, cycle_start_date: e.target.value })} />
      </div>
    </div>
  );
}

function WeekendRotationEditor({ params, onUpdate }: { params: WeekendRotationParams; onUpdate: (p: WeekendRotationParams) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label>Cada cuántas semanas</Label>
        <Input type="number" min={2} max={4} value={params.every_n_weeks}
          onChange={(e) => onUpdate({ ...params, every_n_weeks: Number(e.target.value) || 2 })} />
      </div>
      <div>
        <Label>Grupo (offset)</Label>
        <Select value={String(params.offset)} onValueChange={(v) => onUpdate({ ...params, offset: Number(v) as 0 | 1 })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">A (semanas pares)</SelectItem>
            <SelectItem value="1">B (semanas impares)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label>Incluir sábado</Label>
        <Switch checked={params.include_saturday}
          onCheckedChange={(v) => onUpdate({ ...params, include_saturday: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Incluir domingo</Label>
        <Switch checked={params.include_sunday}
          onCheckedChange={(v) => onUpdate({ ...params, include_sunday: v })} />
      </div>
    </div>
  );
}

function PostNightRestEditor({ params, onUpdate }: { params: PostNightRestParams; onUpdate: (p: PostNightRestParams) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Tras N noches</Label>
        <Input type="number" min={1} max={7} value={params.nights_threshold}
          onChange={(e) => onUpdate({ ...params, nights_threshold: Number(e.target.value) || 1 })} />
      </div>
      <div>
        <Label>Días de descanso</Label>
        <Input type="number" min={1} max={7} value={params.rest_days_required}
          onChange={(e) => onUpdate({ ...params, rest_days_required: Number(e.target.value) || 1 })} />
      </div>
    </div>
  );
}

function MaxConsecutiveNightsEditor({ params, onUpdate }: { params: MaxConsecutiveNightsParams; onUpdate: (p: MaxConsecutiveNightsParams) => void }) {
  return (
    <div>
      <Label>Máximo noches seguidas</Label>
      <Input type="number" min={1} max={7} value={params.max}
        onChange={(e) => onUpdate({ ...params, max: Number(e.target.value) || 1 })} />
    </div>
  );
}

function CompensatoryDayEditor({ params, onUpdate }: { params: CompensatoryDayParams; onUpdate: (p: CompensatoryDayParams) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label>Aplica a</Label>
        <Select value={params.applies_to} onValueChange={(v) => onUpdate({ ...params, applies_to: v as CompensatoryDayParams["applies_to"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sundays">Solo domingos</SelectItem>
            <SelectItem value="holidays">Solo festivos</SelectItem>
            <SelectItem value="both">Domingos y festivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Dentro de N días</Label>
        <Input type="number" min={3} max={14} value={params.within_days}
          onChange={(e) => onUpdate({ ...params, within_days: Number(e.target.value) || 7 })} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/components/contract-types/rest-rule-cards.tsx
git commit -m "feat(contract-types): RestRuleCards con editores por tipo"
```

---

## Task 10: Form `/contract-types` con presets + integración

**Files:**
- Modify: `src/components/contract-types/contract-type-form.tsx` (o el archivo del form)

- [ ] **Step 1: Leer el form actual**

Identificar el componente. Buscar dónde se renderiza el form de creación/edición.

- [ ] **Step 2: Agregar sección "Reglas de descanso"**

Después de los campos básicos (jornada, asistencial, disponibilidad), agregar:

```tsx
{/* Reglas de descanso */}
<div className="space-y-3 border-t pt-4">
  <Label>Reglas de descanso</Label>
  <RadioGroup value={preset} onValueChange={(v) => applyPreset(v)}>
    <div className="space-y-2">
      <Label className="flex items-start gap-2 cursor-pointer">
        <RadioGroupItem value="none" />
        <div>
          <p className="text-sm font-medium">Sin reglas especiales</p>
          <p className="text-xs text-muted-foreground">
            El motor solo respeta los caps legales (6 días seguidos máximo, 12h descanso entre turnos).
          </p>
        </div>
      </Label>
      <Label className="flex items-start gap-2 cursor-pointer">
        <RadioGroupItem value="healthcare" />
        <div>
          <p className="text-sm font-medium">Asistencial sanitario</p>
          <p className="text-xs text-muted-foreground">
            Máximo 3 noches consecutivas + tras 3 noches → 2 días libres.
          </p>
        </div>
      </Label>
      <Label className="flex items-start gap-2 cursor-pointer">
        <RadioGroupItem value="cycle_4_3" />
        <div>
          <p className="text-sm font-medium">Rotación 4×3</p>
          <p className="text-xs text-muted-foreground">
            4 días trabajo + 3 días descanso, ciclo continuo.
          </p>
        </div>
      </Label>
      <Label className="flex items-start gap-2 cursor-pointer">
        <RadioGroupItem value="weekend_alternating" />
        <div>
          <p className="text-sm font-medium">Rotación de fines de semana alternados</p>
          <p className="text-xs text-muted-foreground">
            Un finde sí, un finde no (sábado y domingo libres).
          </p>
        </div>
      </Label>
      <Label className="flex items-start gap-2 cursor-pointer">
        <RadioGroupItem value="custom" />
        <div>
          <p className="text-sm font-medium">Personalizado</p>
          <p className="text-xs text-muted-foreground">
            Combiná las reglas que necesites.
          </p>
        </div>
      </Label>
    </div>
  </RadioGroup>

  {/* Cards de reglas activas */}
  {form.rest_rules.length > 0 && (
    <RestRuleCards
      rules={form.rest_rules}
      onUpdate={(idx, params) => updateRule(idx, params)}
      onRemove={(idx) => removeRule(idx)}
    />
  )}

  {/* Botón agregar regla (solo en preset Personalizado) */}
  {preset === "custom" && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">+ Agregar regla</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => addRule("work_cycle")}>Ciclo trabajo/descanso</DropdownMenuItem>
        <DropdownMenuItem onClick={() => addRule("weekend_rotation")}>Rotación de findes</DropdownMenuItem>
        <DropdownMenuItem onClick={() => addRule("post_night_rest")}>Descanso post-noches</DropdownMenuItem>
        <DropdownMenuItem onClick={() => addRule("max_consecutive_nights")}>Máx noches consecutivas</DropdownMenuItem>
        <DropdownMenuItem onClick={() => addRule("compensatory_day")}>Día compensatorio</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )}

  {/* Preview */}
  {form.rest_rules.length > 0 && (
    <RestRulePreview rules={form.rest_rules} />
  )}
</div>
```

- [ ] **Step 3: Lógica de presets**

```ts
function applyPreset(preset: string) {
  setPreset(preset);
  let rules: RestRule[] = [];
  const today = new Date().toISOString().slice(0, 10);
  switch (preset) {
    case "none":
      rules = [];
      break;
    case "healthcare":
      rules = [
        { id: crypto.randomUUID(), contract_type_id: "", rule_type: "max_consecutive_nights",
          params: { max: 3 }, created_at: "", updated_at: "" },
        { id: crypto.randomUUID(), contract_type_id: "", rule_type: "post_night_rest",
          params: { nights_threshold: 3, rest_days_required: 2 }, created_at: "", updated_at: "" },
      ];
      break;
    case "cycle_4_3":
      rules = [
        { id: crypto.randomUUID(), contract_type_id: "", rule_type: "work_cycle",
          params: { work_days: 4, rest_days: 3, cycle_start_date: today }, created_at: "", updated_at: "" },
      ];
      break;
    case "weekend_alternating":
      rules = [
        { id: crypto.randomUUID(), contract_type_id: "", rule_type: "weekend_rotation",
          params: { every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true },
          created_at: "", updated_at: "" },
      ];
      break;
    case "custom":
      // No tocar las reglas existentes; permitir editar
      return;
  }
  setForm({ ...form, rest_rules: rules });
}
```

- [ ] **Step 4: Persistencia (al guardar)**

Después de UPSERT del contract_type, gestionar `contract_rest_rules`:

```ts
// 1. DELETE existentes
await supabase.from("contract_rest_rules").delete().eq("contract_type_id", contractTypeId);

// 2. INSERT las nuevas
if (form.rest_rules.length > 0) {
  await supabase.from("contract_rest_rules").insert(
    form.rest_rules.map((r) => ({
      contract_type_id: contractTypeId,
      rule_type: r.rule_type,
      params: r.params,
    }))
  );
}
```

- [ ] **Step 5: Carga al editar**

Cuando se abre el form para editar un contract existente, cargar las reglas:

```ts
const { data: rulesData } = await supabase
  .from("contract_rest_rules")
  .select("*")
  .eq("contract_type_id", contractTypeId);
const rules = (rulesData ?? []) as RestRule[];

// Detectar preset basado en rules
const preset = detectPreset(rules);

setForm({ ...form, rest_rules: rules });
setPreset(preset);
```

`detectPreset(rules)`:
- Si vacío → "none".
- Si contiene exactamente `[max_consecutive_nights{max:3}, post_night_rest{3,2}]` → "healthcare".
- Si contiene exactamente `[work_cycle{4,3,*}]` → "cycle_4_3".
- Si contiene exactamente `[weekend_rotation{2,0,sat,sun}]` → "weekend_alternating".
- Sino → "custom".

- [ ] **Step 6: Build + commit**

```bash
npm run build
git add src/components/contract-types
git commit -m "feat(contract-types): form con presets + cards + preview de reglas"
```

---

## Task 11: Tabla `/contract-types` con columna "Reglas"

**Files:**
- Modify: `src/app/(authenticated)/contract-types/page.tsx`

- [ ] **Step 1: Cargar reglas en la query**

Cargar `contract_rest_rules` agrupadas por contract_type_id en el fetch.

- [ ] **Step 2: Agregar columna**

En la tabla, agregar columna "Reglas" con resumen:

```tsx
<TableCell>
  {rules.length === 0 && <span className="text-muted-foreground text-xs">Sin reglas</span>}
  {rules.length === 1 && <RuleSummary rule={rules[0]} />}
  {rules.length > 1 && (
    <span className="text-xs">{rules.length} reglas activas</span>
  )}
</TableCell>
```

`<RuleSummary>`: helper que devuelve string corto:
- `work_cycle` → "Ciclo NxM"
- `weekend_rotation` → "Findes alt."
- `post_night_rest` → "Post-noches"
- `max_consecutive_nights` → "Max N noches"
- `compensatory_day` → "Compensatorio"

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/\(authenticated\)/contract-types/page.tsx
git commit -m "feat(contract-types): columna Reglas en tabla"
```

---

## Task 12: Badge en `/employees`

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

- [ ] **Step 1: Cargar reglas del contract de cada empleado**

Extender la query de empleados para incluir las reglas de su contract:

```ts
.select("*, contract_type:contract_types(*, rest_rules:contract_rest_rules(*))")
```

- [ ] **Step 2: Mostrar badge resumen**

Al lado del nombre, si `employee.contract_type?.rest_rules?.length > 0`:

```tsx
{employee.contract_type?.rest_rules?.[0] && (
  <Badge variant="secondary" className="text-xs">
    <RuleSummary rule={employee.contract_type.rest_rules[0]} />
    {employee.contract_type.rest_rules.length > 1 && ` +${employee.contract_type.rest_rules.length - 1}`}
  </Badge>
)}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/\(authenticated\)/employees/page.tsx
git commit -m "feat(employees): badge resumen de reglas de descanso"
```

---

## Task 13: Mención en panel "Salud del horario"

**Files:**
- Modify: `src/components/schedule/schedule-health-panel.tsx`

- [ ] **Step 1: Computar días bloqueados por reglas**

Para cada empleado saturado, computar qué días del mes están bloqueados por reglas y agregarlo a la lista expandida.

Como `computeHealth` no recibe restRules hoy, agregarlo como parámetro opcional:

```ts
export function computeHealth(
  entries, employees, staffing, constraints, locationId, year, month,
  restRules: RestRule[] = [],
  contractTypes: ContractType[] = [],
): HealthSummary;
```

Para cada empleado, computar días con `isRestDay` por sus reglas y agregar a `SaturatedEmployee.restDays?: string[]`.

- [ ] **Step 2: Render**

```tsx
{employee.restDays && employee.restDays.length > 0 && (
  <p className="text-xs text-muted-foreground">
    Descansa por regla los días: {employee.restDays.join(", ")}
  </p>
)}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/lib/schedule-health.ts src/components/schedule/schedule-health-panel.tsx src/app/\(authenticated\)/schedule/page.tsx
git commit -m "feat(schedule): panel salud lista días de descanso por regla"
```

---

## Task 14: CLAUDE.md + push + smoke

- [ ] **Step 1: Actualizar CLAUDE.md**

Después de la sección "Supernumerarios", agregar:

```markdown
### Reglas de descanso parametrizables

Sistema plug-in (migración 036): cada `contract_type` puede tener 0 o más reglas en `contract_rest_rules` con `params jsonb`. 5 tipos soportados:
- `work_cycle`: trabaja N días, descansa M (ej. 4×3, 7×7).
- `weekend_rotation`: cada N semanas, sáb/dom libres (offset 0/1).
- `post_night_rest`: tras N noches consecutivas, M días libres.
- `max_consecutive_nights`: tope duro de noches seguidas.
- `compensatory_day`: si trabajó dom/festivo, día libre dentro de N días (Art. 179 CST).

Helpers puros en `src/lib/rest-rules.ts` con TDD. Motor las aplica como inviolable en `filterCandidates` después de los chequeos de descanso/disponibilidad. UI en `/contract-types` ofrece 4 presets (Sin reglas, Asistencial, Rotación 4×3, Findes alternados) + Personalizado con cards editables y preview de 14 días.
```

- [ ] **Step 2: Build + suite**

```bash
npm run build && npm run test
```
Expected: ~281 tests passing.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: reglas de descanso en CLAUDE.md"
git push origin main
```

- [ ] **Step 4: Smoke**

1. `/contract-types` → editar Asistencial Full-time → seleccionar preset "Asistencial sanitario" → Ver 2 cards con max_consecutive_nights=3 y post_night_rest=(3,2). Preview muestra 14 días marcados según reglas.
2. Cambiar `max=2`, guardar.
3. BD: `SELECT rule_type, params FROM contract_rest_rules WHERE contract_type_id IN (SELECT id FROM contract_types WHERE name='Asistencial Full-time');` → 2 rows con params correctos.
4. `/employees` → Sara Romero (Asistencial) muestra badge "Max 2 noches +1".
5. `/schedule` → regenerar abril 2026 → verificar que Sara no recibe 3 noches seguidas.

---

## Self-review

- Spec §2-§9 todo cubierto:
  - §2 (modelo) → Task 1.
  - §3 (helpers) → Tasks 2-6.
  - §4 (UI) → Tasks 8-13.
  - §5 (migración) → Task 1.
  - §7 (tests) → Tasks 2-7.
  - §8 (entregables) → todos cubiertos.
- TDD estricto en helpers (Tasks 2-6).
- Tipos consistentes (`RestRule`, `RestRuleType`, `params`) entre Task 1 y todos los siguientes.
- Tasks 8-13 son UI; el patrón visual está descrito; el implementador debe leer el archivo existente para integrar.
- Task 7 (motor) requiere refactor del param de `generateSchedule` — los callers (auto-generate-dialog) deben adaptarse en el mismo commit para no romper.

## Estimación

14 tasks. ~6-7 hrs de trabajo total con subagent-driven (haiku para mecánicos T1, T11-13; sonnet para integración T2-7, T9-10).
