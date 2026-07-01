# Resolver las 2 limitaciones del horario de festivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) avisar claramente cuando un turno de festivo no se puede cubrir por exceder el tope diario; (2) que las horas laboradas se cuenten netas del descanso (equidad + recargos de nómina), sin cambiar el sueldo base.

**Architecture:** Parte 1 = un warning nuevo en el motor + su mensaje en el diálogo. Parte 2 = persistir `schedule_entries.break_minutes` (nullable, patrón `is_night`), restarlo en el trigger de equidad y en los recargos de nómina vía un helper puro `workedFractionsAfterBreak` que descuenta el descanso de las horas de menor recargo primero.

**Tech Stack:** Next.js 14, Supabase (Postgres + trigger PL/pgSQL), TypeScript, Vitest.

## Global Constraints

- UI en **español**, sin emojis, acentos correctos.
- El salario base NO cambia (se prorratea por días calendario); las horas solo generan recargos + extras.
- Retrocompatible: `schedule_entries.break_minutes` es nullable; NULL = 0 descuento (bruto). El trigger usa `COALESCE(se.break_minutes, 0)`; la nómina usa `entry.break_minutes ?? 0`. Desacopla el deploy (aplicar migración antes que el código no regresiona).
- Descuento del descanso: **de las horas de menor recargo primero** (ordinaria → nocturna → dominical → festiva).
- No hay nómina electrónica DIAN; el impacto de la nómina es interno.
- `day_of_week` JS (0=domingo). Horas `HH:MM[:SS]`.

---

### Task 1: Aviso de turno de festivo sin cubrir por exceder el tope diario

**Files:**
- Modify: `src/lib/types.ts` (union `AutoGenWarning`, ~línea 286)
- Modify: `src/lib/schedule-generator.ts` (emisión del warning donde un slot queda sin candidato)
- Modify: `src/components/schedule/auto-generate-dialog.tsx` (agrupador/mensajes de warnings)
- Test: `src/lib/schedule-generator.test.ts`

**Interfaces:**
- Produces: warning `{ kind: "holiday_hours_exceed_cap"; positionId: string; date: string; shiftTemplateId: string; holidayHours: number; maxDayCap: number }`.

- [ ] **Step 1: Agregar el tipo de warning**

En `src/lib/types.ts`, en el union `AutoGenWarning` (después de `coverage_gap`):
```ts
  | { kind: "holiday_hours_exceed_cap"; positionId: string; date: string; shiftTemplateId: string; holidayHours: number; maxDayCap: number }
```

- [ ] **Step 2: Escribir el test que falla**

En `src/lib/schedule-generator.test.ts`, nuevo `describe` al final:
```ts
describe("aviso: horario de festivo excede el tope diario", () => {
  it("emite holiday_hours_exceed_cap cuando el horario de festivo supera el max_hours_per_day", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    // Turno diurno 08:00-17:00 (9h) con horario de festivo 07:00-18:00 (11h), sin descanso.
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00", break_minutes: 0,
      holiday_start_time: "07:00:00", holiday_end_time: "18:00:00", holiday_break_minutes: 0,
    });
    // Contrato con tope diario de 10h (no healthcare).
    const ct: ContractType = { ...fullTime, id: "ct-10", is_healthcare: false, max_hours_per_day: 10 };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-10" });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [emp], [tpl], [], [],
      { maxHoursPerWeek: 48, maxHoursPerDay: 10, minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" }],
      [], holidays, [ct], defaultWeights,
    );
    // No se asigna el festivo y se emite el warning específico.
    expect(result.entries.find((e) => e.date === "2026-04-09")).toBeUndefined();
    const w = result.warnings.find((x) => x.kind === "holiday_hours_exceed_cap" && x.date === "2026-04-09");
    expect(w).toBeDefined();
    if (w && w.kind === "holiday_hours_exceed_cap") {
      expect(w.holidayHours).toBe(11);
      expect(w.maxDayCap).toBe(10);
    }
  });

  it("horario de festivo dentro del tope se asigna normal (sin warning)", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00", break_minutes: 0,
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    const ct: ContractType = { ...fullTime, id: "ct-10b", is_healthcare: false, max_hours_per_day: 10 };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-10b" });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [emp], [tpl], [], [],
      { maxHoursPerWeek: 48, maxHoursPerDay: 10, minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" }],
      [], holidays, [ct], defaultWeights,
    );
    expect(result.entries.find((e) => e.date === "2026-04-09")).toBeDefined();
    expect(result.warnings.some((x) => x.kind === "holiday_hours_exceed_cap")).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `npm run test -- schedule-generator`
Expected: FAIL en el primer caso (aún no existe el warning; se emite `no_safe_candidate`/`coverage_gap`).

- [ ] **Step 4: Emitir el warning en el motor**

En `src/lib/schedule-generator.ts`, localizar el punto donde, tras fallar Pase 1 y Pase 2 para un slot, se hace `warnings.push({ kind: "no_safe_candidate", ... })` / `coverage_gap`. **Antes** de emitir el genérico, calcular si aplica el diagnóstico de festivo:

```ts
// ¿El slot corre en festivo con horario de festivo aplicado y su duración excede el tope
// diario de TODOS los candidatos de la posición? Entonces nadie puede cubrirlo: aviso claro.
const slotIsHolidayHours =
  isHoliday(slot.date, ctx.locationId, ctx.holidays) &&
  slot.template.holiday_start_time != null &&
  slot.template.holiday_end_time != null;
if (slotIsHolidayHours) {
  // Candidatos de la posición = empleados cuyo position_id (o secundaria) es slot.positionId.
  const posCandidates = employees.filter(
    (e) => e.position_id === slot.positionId ||
      e.secondary_positions?.some((sp) => sp.position_id === slot.positionId),
  );
  const dayCapOf = (e: ProfileWithPositions): number => {
    const c = ctx.contractTypes.get(e.contract_type_id);
    return c?.is_healthcare ? 12 : (c?.max_hours_per_day ?? constraints.maxHoursPerDay);
  };
  const maxDayCap = posCandidates.length
    ? Math.max(...posCandidates.map(dayCapOf))
    : constraints.maxHoursPerDay;
  if (slot.durationHours > maxDayCap) {
    warnings.push({
      kind: "holiday_hours_exceed_cap",
      positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
      holidayHours: slot.durationHours, maxDayCap,
    });
    continue; // no emitir el genérico para este slot
  }
}
```
Ajustar los nombres (`employees`, `ctx`, `constraints`, `slot`) a los que existan en ese scope del archivo. `slot.durationHours` ya es neto del descanso (`calcDurationHours`). Emitir ESTE warning en vez del genérico (el `continue` evita el doble warning).

- [ ] **Step 5: Correr el test**

Run: `npm run test -- schedule-generator`
Expected: PASS los 2 casos nuevos; el resto verde.

- [ ] **Step 6: Mensaje en el diálogo**

En `src/components/schedule/auto-generate-dialog.tsx`, en el switch/map que traduce `w.kind` a texto, agregar el caso (seguir el patrón existente de los demás `kind`):
```tsx
case "holiday_hours_exceed_cap":
  return `El horario de festivo de ${positionName} (${w.holidayHours}h) supera el tope diario del contrato (${w.maxDayCap}h): nadie puede cubrirlo en festivos. Reducí el horario de festivo del turno.`;
```
Usar la misma resolución de `positionName` (por `w.positionId`) que usan los otros casos. Si los otros casos agrupan por fecha/turno, seguir ese mismo agrupamiento.

- [ ] **Step 7: Typecheck y commit**

Run: `npm run typecheck && npm run test`
Expected: 0 errores, verde.
```bash
git add src/lib/types.ts src/lib/schedule-generator.ts "src/components/schedule/auto-generate-dialog.tsx" src/lib/schedule-generator.test.ts
git commit -m "feat(scheduler): aviso holiday_hours_exceed_cap cuando el horario de festivo supera el tope diario"
```

---

### Task 2: Datos — migración 064 `schedule_entries.break_minutes` + trigger + tipo

**Files:**
- Create: `supabase/migrations/064_schedule_entry_break_minutes.sql`
- Create: `supabase/tests/064_schedule_entry_break_minutes.sql`
- Modify: `src/lib/types.ts` (`ScheduleEntry`)

**Interfaces:**
- Produces: `ScheduleEntry.break_minutes: number | null`; el trigger `recompute_equity_rollup` resta `COALESCE(se.break_minutes,0)/60` de `total_hours`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/064_schedule_entry_break_minutes.sql`. La función `recompute_equity_rollup` debe reescribirse a partir de la **versión VIGENTE en cloud** (la de migración 063, con `COALESCE(se.is_night, st.is_night, false)`); antes de escribir, verificarla con `pg_get_functiondef('public.recompute_equity_rollup(uuid, integer, integer)'::regprocedure)` vía Supabase MCP y copiarla verbatim, cambiando SOLO `total_hours` para restar el descanso:

```sql
-- Migration 064: horas laboradas netas del descanso en equidad
-- Agrega schedule_entries.break_minutes (nullable) = descanso efectivo del turno asignado.
-- El trigger de equidad resta COALESCE(se.break_minutes,0)/60 de total_hours. NULL = 0 (histórico/bruto),
-- retrocompatible y desacopla el deploy. Solo ADD COLUMN + CREATE OR REPLACE: no toca RLS.

BEGIN;

ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS break_minutes integer;

COMMENT ON COLUMN schedule_entries.break_minutes IS
  'Descanso efectivo (min) del turno asignado. NULL = no computado → 0 descuento. Lo setea el motor/diálogo.';

CREATE OR REPLACE FUNCTION public.recompute_equity_rollup(p_employee_id uuid, p_year integer, p_month integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp_org UUID;
BEGIN
  SELECT organization_id INTO emp_org FROM profiles WHERE id = p_employee_id;
  IF emp_org IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO employee_equity_rollups (
    employee_id, organization_id, year, month,
    sundays_worked, saturdays_worked, nights_worked, holidays_worked, total_hours
  )
  SELECT
    p_employee_id, emp_org, p_year, p_month,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 0)::INT,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 6)::INT,
    COUNT(*) FILTER (WHERE COALESCE(se.is_night, st.is_night, false) = true)::INT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.date = se.date
        AND (h.location_id IS NULL OR h.location_id = (
          SELECT s.location_id FROM schedules s WHERE s.id = se.schedule_id
        ))
    ))::INT,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        (se.date + se.end_time) +
          CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
        - (se.date + se.start_time)
      )) / 3600
      - COALESCE(se.break_minutes, 0) / 60.0
    ), 0)::NUMERIC(6,2)
  FROM schedule_entries se
  LEFT JOIN shift_templates st ON st.id = se.shift_template_id
  WHERE se.employee_id = p_employee_id
    AND EXTRACT(YEAR FROM se.date) = p_year
    AND EXTRACT(MONTH FROM se.date) = p_month
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    sundays_worked   = EXCLUDED.sundays_worked,
    saturdays_worked = EXCLUDED.saturdays_worked,
    nights_worked    = EXCLUDED.nights_worked,
    holidays_worked  = EXCLUDED.holidays_worked,
    total_hours      = EXCLUDED.total_hours,
    updated_at       = now();
END;
$function$;

COMMIT;
```

- [ ] **Step 2: Escribir el test SQL**

Crear `supabase/tests/064_schedule_entry_break_minutes.sql`:
```sql
BEGIN;
DO $$
DECLARE n int; fdef text;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_name = 'schedule_entries' AND column_name = 'break_minutes'
    AND data_type = 'integer' AND is_nullable = 'YES';
  IF n <> 1 THEN RAISE EXCEPTION 'schedule_entries.break_minutes ausente o no integer nullable (%).', n; END IF;

  fdef := pg_get_functiondef('public.recompute_equity_rollup(uuid, integer, integer)'::regprocedure);
  IF position('COALESCE(se.break_minutes, 0)' IN fdef) = 0 THEN
    RAISE EXCEPTION 'recompute_equity_rollup no resta COALESCE(se.break_minutes, 0) en total_hours';
  END IF;
END $$;
ROLLBACK;
```

- [ ] **Step 3: Agregar el campo al tipo**

En `src/lib/types.ts`, `interface ScheduleEntry`, después de `is_night: boolean | null;`:
```ts
  break_minutes: number | null;
```

- [ ] **Step 4: (controlador) aplicar migración + regen + typecheck**

> Coordinación del controlador tras el `migration-reviewer`: aplicar 064 a cloud (`apply_migration`, proyecto `ugkvuinkynvtuiutwlkd`), correr el test SQL (`execute_sql`), regenerar `database.types.ts`, y verificar `npm run typecheck` (fallará hasta que Task 3 escriba `break_minutes` en el motor/diálogo y arregle la cascada de tests — igual que hicimos con `is_night`). El commit de esta tarea puede quedar junto con Task 3 en un commit verde, o dejar los archivos de datos sin commitear para que Task 3 los una.

---

### Task 3: Motor y diálogo persisten `break_minutes`

**Files:**
- Modify: `src/lib/schedule-generator.ts` (entry de salida)
- Modify: `src/app/(authenticated)/schedule/page.tsx` (onSave insert + update)
- Modify: `src/lib/schedule-generator.test.ts` (cascada de literales `ScheduleEntry`)

**Interfaces:**
- Consumes: `ScheduleEntry.break_minutes` (Task 2), `slot.breakMinutes` (ya en `DemandSlot`), `effectiveShiftHours(...).breakMinutes` (ya en `equity-helpers`).
- Produces: entries con `break_minutes` poblado.

- [ ] **Step 1: Motor escribe break_minutes**

En `src/lib/schedule-generator.ts`, en el objeto `entries.push({ ... })` de salida (junto a `is_night: slot.isNight`), agregar:
```ts
      break_minutes: slot.breakMinutes,
```

- [ ] **Step 2: Diálogo manual escribe break_minutes**

En `src/app/(authenticated)/schedule/page.tsx`, en el `onSave` donde ya se computa `is_night` (helper `effectiveShiftHours` con plantilla, `suggestIsNight` sin plantilla), computar también el descanso:
```ts
const breakMinutes = tpl ? effectiveShiftHours(tpl, dialogIsHolidayDate).breakMinutes : 0;
```
y agregar `break_minutes: breakMinutes,` tanto al objeto del `.insert(...)` como al del `.update(...)` (donde ya se agregó `is_night`). Turno manual sin plantilla → `0`.

- [ ] **Step 3: Cascada de tipos en tests**

En `src/lib/schedule-generator.test.ts`, los literales `ScheduleEntry` (los `existingEntries`) ahora requieren `break_minutes`. Agregar `break_minutes: null` a cada literal (o el valor que el test amerite). El helper `mkEntry` de `rest-rules.test.ts` (si construye `ScheduleEntry`) también debe incluir `break_minutes: null`.

- [ ] **Step 4: Typecheck + test + commit (con los datos de Task 2)**

Run: `npm run typecheck && npm run test`
Expected: 0 errores, verde.
```bash
git add supabase/migrations/064_schedule_entry_break_minutes.sql supabase/tests/064_schedule_entry_break_minutes.sql src/lib/supabase/database.types.ts src/lib/types.ts src/lib/schedule-generator.ts "src/app/(authenticated)/schedule/page.tsx" src/lib/schedule-generator.test.ts src/lib/rest-rules.test.ts
git commit -m "feat(motor): persistir break_minutes efectivo en schedule_entries (migración 064)"
```

---

### Task 4: Nómina descuenta el descanso (horas netas, menor recargo primero)

**Files:**
- Modify: `src/lib/payroll-engine-helpers.ts` (nuevo helper puro `workedFractionsAfterBreak`)
- Modify: `src/lib/payroll-engine.ts` (`computeSurcharges` ~L311, `computeOvertime` ~L402)
- Test: `src/lib/payroll-engine-helpers.test.ts`, `src/lib/payroll-engine.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry.break_minutes` (Task 2), `classifyHour` (ya existe), `cfg.sunday_surcharge_pct`, `cfg.holiday_surcharge_pct`.
- Produces: `workedFractionsAfterBreak(weights: number[], breakMinutes: number): number[]`.

- [ ] **Step 1: Test del helper (falla)**

En `src/lib/payroll-engine-helpers.test.ts`, nuevo `describe`:
```ts
import { workedFractionsAfterBreak } from "./payroll-engine-helpers";

describe("workedFractionsAfterBreak", () => {
  it("break 0 → todas las horas completas", () => {
    expect(workedFractionsAfterBreak([0, 0.35, 0.8], 0)).toEqual([1, 1, 1]);
  });
  it("descuenta de la hora de menor peso primero", () => {
    // pesos [0, 0.35, 0.8]; break 60min = 1h → se descuenta 1h completa de la de peso 0.
    expect(workedFractionsAfterBreak([0, 0.35, 0.8], 60)).toEqual([0, 1, 1]);
  });
  it("descuento fraccional cae en la de menor peso (30min)", () => {
    // pesos [0.8, 0.8, 0.8] (turno íntegro festivo, 3h); break 30min=0.5h → una hora queda 0.5.
    const r = workedFractionsAfterBreak([0.8, 0.8, 0.8], 30);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(2.5, 5);
  });
  it("break mayor que una hora salta a la siguiente de menor peso", () => {
    // pesos [0, 0.35]; break 90min=1.5h → primera hora 0, segunda 0.5.
    expect(workedFractionsAfterBreak([0, 0.35], 90)).toEqual([0, 0.5]);
  });
  it("nunca baja de 0 aunque el break exceda el turno", () => {
    expect(workedFractionsAfterBreak([0, 0.35], 300)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Correr para ver fallar**

Run: `npm run test -- payroll-engine-helpers`
Expected: FAIL ("workedFractionsAfterBreak is not a function").

- [ ] **Step 3: Implementar el helper**

En `src/lib/payroll-engine-helpers.ts`:
```ts
/**
 * Fracción trabajada [0..1] de cada hora del turno tras descontar el descanso.
 * El descanso (breakMinutes) se resta de las horas de MENOR peso de recargo primero
 * (ordinaria antes que nocturna antes que dominical/festiva), propagando el remanente.
 * `weights[i]` = suma de porcentajes de recargo de la hora i (0 = ordinaria).
 */
export function workedFractionsAfterBreak(weights: number[], breakMinutes: number): number[] {
  const worked = weights.map(() => 1);
  let remaining = breakMinutes / 60;
  if (remaining <= 0) return worked;
  const order = weights.map((_, i) => i).sort((a, b) => weights[a] - weights[b]);
  for (const i of order) {
    if (remaining <= 0) break;
    const deduct = Math.min(worked[i], remaining);
    worked[i] -= deduct;
    remaining -= deduct;
  }
  return worked;
}
```

- [ ] **Step 4: Correr el test del helper**

Run: `npm run test -- payroll-engine-helpers`
Expected: PASS.

- [ ] **Step 5: Integrar en `computeSurcharges`**

En `src/lib/payroll-engine.ts`, dentro de `computeSurcharges`, reemplazar el bucle interno de horas (`for (const { date: hourDate, hour } of hours) { ... nightHours += 1 ... }`) por uno que clasifique, pondere, descuente el descanso del entry y acumule fracciones:
```ts
    const classes = hours.map(({ date: hourDate, hour }) =>
      classifyHour(hourDate, hour, holidays, cfg, employee.location_id ?? ""));
    const weights = classes.map((c) =>
      (c.isNight ? 0.35 : 0) + (c.isSunday ? cfg.sunday_surcharge_pct : 0) + (c.isHoliday ? cfg.holiday_surcharge_pct : 0));
    const worked = workedFractionsAfterBreak(weights, entry.break_minutes ?? 0);
    classes.forEach((c, i) => {
      if (c.isNight) nightHours += worked[i];
      if (c.isSunday) sundayHours += worked[i];
      if (c.isHoliday) holidayHours += worked[i];
    });
```
Importar `workedFractionsAfterBreak` desde `./payroll-engine-helpers`. Las descripciones `(${nightHours}h)` mostrarán fracciones — envolver con `formatHours(nightHours)` si existe un formateador, o dejar el número (aceptable). Los `Math.round(bucket × VH × pct)` ya aceptan fracciones.

- [ ] **Step 6: Integrar en `computeOvertime`**

En `computeOvertime`, reemplazar su bucle interno de horas análogamente (overtime: día 0.25 / noche 0.75, día y noche son exclusivos):
```ts
    const classes = hours.map(({ date: hourDate, hour }) =>
      classifyHour(hourDate, hour, holidays, cfg, employee.location_id ?? ""));
    const weights = classes.map((c) =>
      (c.isNight ? 0.75 : 0.25) + (c.isSunday ? cfg.sunday_surcharge_pct : 0) + (c.isHoliday ? cfg.holiday_surcharge_pct : 0));
    const worked = workedFractionsAfterBreak(weights, entry.break_minutes ?? 0);
    classes.forEach((c, i) => {
      if (c.isNight) otNightHours += worked[i]; else otDayHours += worked[i];
      if (c.isSunday) otSundayHours += worked[i];
      if (c.isHoliday) otHolidayHours += worked[i];
    });
```

- [ ] **Step 7: Test de integración de nómina**

En `src/lib/payroll-engine.test.ts`, agregar (en el `describe` de `computeSurcharges`):
```ts
it("descuenta el descanso de las horas recargadas (turno festivo íntegro)", () => {
  // Turno festivo 12h (07:00-19:00) con break_minutes=30 → recargo festivo sobre 11.5h.
  // Reusar el patrón de fixtures del archivo (buildInput / makeEntry con concept VH conocido).
  // Assert: el amount de surcharge_holiday = Math.round(11.5 * VH * holiday_pct).
});
```
Completar con el patrón exacto de fixtures del archivo (VH, cfg, holiday). Verificar que un turno diurno normal con `break_minutes=60` NO cambia los recargos (el descuento sale de horas ordinarias). Actualizar cualquiera de los ~10 tests de montos existentes cuyos fixtures tengan `break_minutes` (la mayoría no lo tienen → `null` → sin cambio).

- [ ] **Step 8: Typecheck + test + commit**

Run: `npm run typecheck && npm run test`
Expected: 0 errores, verde.
```bash
git add src/lib/payroll-engine-helpers.ts src/lib/payroll-engine.ts src/lib/payroll-engine-helpers.test.ts src/lib/payroll-engine.test.ts
git commit -m "feat(nomina): recargos sobre horas netas (descuenta el descanso, menor recargo primero)"
```

---

## Validación final (whole-branch review)

- `npm run typecheck` + `npm run test` verdes.
- Reviewers: `migration-reviewer` (064 + trigger, verificar versión vigente 063), `schedule-algorithm-reviewer` (warning + break en motor), **`security-reviewer`** (nómina — montos pagados).
- Smoke sugerido: turno festivo con horario largo → warning claro; turno con descanso → equidad y recargo festivo netos; sueldo base sin cambio.

## Notas de cierre

- Ejecución subagent-driven: Task 1 (motor+UI, opus), Task 2 (datos — controlador aplica migración + regen), Task 3 (persistir, opus), Task 4 (nómina, opus — sensible). Reviewers especializados por tarea + `security-reviewer` para Task 4 + whole-branch `/code-review`.
- Aplicar la migración 064 y regenerar `database.types.ts` es del controlador tras el review de Task 2.
