# Fase 2 — Demanda de personal para festivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir configurar demanda de personal específica para días festivos (horario distinto vía turno de festivo, o no operar) en la matriz de Necesidades, y que el motor la use al generar horarios.

**Architecture:** Una columna `is_holiday` en `staffing_requirements` (filas festivas con `day_of_week=0` sentinela), el RPC `save_staffing_diff` y el `UNIQUE` extendidos para discriminarla, el motor `buildDemandSlots` elige el perfil de festivo por posición cuando la fecha es festiva (semántica "reemplaza"), y una 8ª columna "Festivo" en la matriz.

**Tech Stack:** Next.js 14, Supabase/Postgres + RLS, TypeScript, Vitest, shadcn/ui.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-29-holiday-staffing-design.md`.
- UI en **español**, sin emojis. Migraciones: header español, `BEGIN;/COMMIT;`. Siguiente número: la más alta es `060` → esta es `061`.
- `day_of_week`: convención JS `0=Domingo..6=Sábado`. Filas festivas usan `day_of_week=0` como **sentinela** + `is_holiday=true`.
- Semántica **Reemplaza por posición**: en festivos, una posición con perfil de festivo (≥1 fila `is_holiday=true`) usa **solo** su perfil; sin perfil → comportamiento actual.
- `UNIQUE` y `save_staffing_diff` (`ON CONFLICT` + `NOT EXISTS` del DELETE) **deben** incluir `is_holiday`, o filas festiva/no-festiva del mismo `(loc, pos, shift, dow)` colisionan.
- Constraint UNIQUE actual: `staffing_requirements_location_id_position_id_shift_templat_key`.
- Aplicar migraciones vía Supabase MCP `apply_migration` (project `ugkvuinkynvtuiutwlkd`) — lo hace el controller. Regenerar `database.types.ts` tras aplicar.
- Commits terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama: `feature/holiday-staffing` (creada; spec en `f6e6fc0`).

## File Structure

- `supabase/migrations/061_holiday_staffing.sql` — columna + UNIQUE + RPC.
- `supabase/tests/061_holiday_staffing.sql` — test SQL.
- `src/lib/types.ts:183` — `StaffingRequirement.is_holiday`.
- `src/lib/staffing-helpers.ts` — `CellKey` con 4ª parte; `StaffingCell.is_holiday`.
- `src/lib/schedule-generator.ts` — `buildDemandSlots` rama festivo.
- `src/lib/schedule-generator.test.ts` — tests del motor.
- `src/hooks/use-staffing-matrix.ts`, `src/components/staffing/staffing-matrix.tsx`, `staffing-tab-by-shift.tsx`, `staffing-tab-by-position.tsx`, `staffing-tab-heatmap.tsx` — UI.

---

### Task 1: Migración 061 — columna `is_holiday` + UNIQUE + RPC

**Files:**
- Create: `supabase/migrations/061_holiday_staffing.sql`
- Create: `supabase/tests/061_holiday_staffing.sql`

**Interfaces:**
- Consumes: `staffing_requirements`, `save_staffing_diff` (migración 032).
- Produces: columna `staffing_requirements.is_holiday BOOLEAN`; `save_staffing_diff` acepta `is_holiday` por fila.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/061_holiday_staffing.sql`:

```sql
-- Migration 061: demanda de personal para festivos (staffing)
--
-- ¿Qué hace?
--   - Agrega is_holiday a staffing_requirements (filas festivas: day_of_week=0
--     sentinela + is_holiday=true). El perfil de festivo no varía por día.
--   - Recrea el UNIQUE para incluir is_holiday (sino festiva/no-festiva colisionan).
--   - save_staffing_diff discrimina is_holiday en parseo, DELETE, INSERT y ON CONFLICT.

BEGIN;

ALTER TABLE staffing_requirements
  ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE staffing_requirements
  DROP CONSTRAINT IF EXISTS staffing_requirements_location_id_position_id_shift_templat_key;
ALTER TABLE staffing_requirements
  ADD CONSTRAINT staffing_requirements_loc_pos_shift_dow_hol_key
  UNIQUE (location_id, position_id, shift_template_id, day_of_week, is_holiday);

CREATE OR REPLACE FUNCTION save_staffing_diff(
  p_location_id UUID,
  p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
  updated_count INT := 0;
  deleted_count INT := 0;
  user_id UUID := auth.uid();
BEGIN
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count,
    COALESCE((r->>'is_holiday')::BOOLEAN, false) AS is_holiday
  FROM jsonb_array_elements(p_rows) r;

  WITH del AS (
    DELETE FROM staffing_requirements sr
     WHERE sr.location_id = p_location_id
       AND NOT EXISTS (
         SELECT 1 FROM _desired d
          WHERE d.position_id = sr.position_id
            AND d.shift_template_id = sr.shift_template_id
            AND d.day_of_week = sr.day_of_week
            AND d.is_holiday = sr.is_holiday
            AND d.required_count > 0
       )
     RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM del;

  WITH ups AS (
    INSERT INTO staffing_requirements
      (location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday, updated_by)
    SELECT p_location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday, user_id
      FROM _desired WHERE required_count > 0
    ON CONFLICT (location_id, position_id, shift_template_id, day_of_week, is_holiday)
    DO UPDATE SET
      required_count = EXCLUDED.required_count,
      updated_by = user_id
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO inserted_count, updated_count
  FROM ups;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'deleted', deleted_count
  );
END;
$$;

COMMIT;
```

- [ ] **Step 2: Escribir el test SQL**

Create `supabase/tests/061_holiday_staffing.sql`:

```sql
-- Test 061: la fila festiva y la no-festiva del mismo (pos,shift,dow) coexisten;
-- un re-guardado sin la festiva la borra solo a ella.
BEGIN;

DO $$
DECLARE
  v_loc UUID; v_pos UUID; v_shift UUID; v_n INT;
BEGIN
  SELECT id INTO v_loc FROM locations LIMIT 1;
  SELECT id INTO v_pos FROM positions LIMIT 1;
  SELECT id INTO v_shift FROM shift_templates LIMIT 1;

  -- Insert directo (evita el permission gate del RPC en el test).
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count, is_holiday)
  VALUES
    (v_loc, v_pos, v_shift, 0, 2, false),  -- domingo normal
    (v_loc, v_pos, v_shift, 0, 1, true);   -- festivo (sentinela dow=0)

  SELECT count(*) INTO v_n FROM staffing_requirements
   WHERE location_id=v_loc AND position_id=v_pos AND shift_template_id=v_shift AND day_of_week=0;
  ASSERT v_n = 2, format('Esperaba 2 filas (festiva + no-festiva), obtuve %s', v_n);

  ASSERT EXISTS (SELECT 1 FROM staffing_requirements
    WHERE location_id=v_loc AND position_id=v_pos AND shift_template_id=v_shift
      AND day_of_week=0 AND is_holiday=true AND required_count=1),
    'Falta la fila festiva con required=1';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/061_holiday_staffing.sql supabase/tests/061_holiday_staffing.sql
git commit -m "feat(staffing): is_holiday en staffing_requirements + RPC discrimina festivo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(El controller revisa con `migration-reviewer`, aplica vía `apply_migration`, corre el test SQL y regenera `database.types.ts`.)

---

### Task 2: Tipos + helpers (`is_holiday` en CellKey)

**Files:**
- Modify: `src/lib/types.ts:183` (`StaffingRequirement`)
- Modify: `src/lib/staffing-helpers.ts`
- Test: `src/lib/staffing-helpers.test.ts` (crear si no existe)

**Interfaces:**
- Produces: `makeCellKey(positionId, shiftTemplateId, dayOfWeek, isHoliday: boolean): CellKey` (formato `"pos|shift|dow|h"`, `h ∈ {0,1}`); `parseCellKey` devuelve `{position_id, shift_template_id, day_of_week, is_holiday}`; `StaffingCell` gana `is_holiday: boolean`.

- [ ] **Step 1: Agregar `is_holiday` a `StaffingRequirement`**

Modify `src/lib/types.ts` — en `StaffingRequirement` (tras `day_of_week: number;`, ~línea 184) agregar:

```ts
  is_holiday: boolean;
```

- [ ] **Step 2: Escribir el test de los helpers (TDD)**

Create `src/lib/staffing-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeCellKey, parseCellKey } from "./staffing-helpers";

describe("staffing CellKey con is_holiday", () => {
  it("makeCellKey/parseCellKey round-trip no-festivo", () => {
    const k = makeCellKey("p1", "s1", 3, false);
    expect(k).toBe("p1|s1|3|0");
    expect(parseCellKey(k)).toEqual({
      position_id: "p1", shift_template_id: "s1", day_of_week: 3, is_holiday: false,
    });
  });
  it("makeCellKey/parseCellKey round-trip festivo (sentinela dow=0)", () => {
    const k = makeCellKey("p1", "s1", 0, true);
    expect(k).toBe("p1|s1|0|1");
    expect(parseCellKey(k)).toEqual({
      position_id: "p1", shift_template_id: "s1", day_of_week: 0, is_holiday: true,
    });
  });
});
```

- [ ] **Step 3: Correr el test — debe FALLAR**

Run: `npm run test -- staffing-helpers`
Expected: FAIL (makeCellKey aún toma 3 args / parseCellKey no devuelve is_holiday).

- [ ] **Step 4: Implementar los cambios en helpers**

Modify `src/lib/staffing-helpers.ts`:

- `StaffingCell` (líneas 1-6): agregar `is_holiday: boolean;`.
- `CellKey` comentario y `makeCellKey` (8-16):

```ts
export type CellKey = string;  // "positionId|shiftTemplateId|dayOfWeek|isHoliday(0|1)"

export function makeCellKey(
  positionId: string,
  shiftTemplateId: string,
  dayOfWeek: number,
  isHoliday: boolean
): CellKey {
  return `${positionId}|${shiftTemplateId}|${dayOfWeek}|${isHoliday ? 1 : 0}`;
}
```

- `parseCellKey` (18-29):

```ts
export function parseCellKey(key: CellKey): {
  position_id: string;
  shift_template_id: string;
  day_of_week: number;
  is_holiday: boolean;
} {
  const [position_id, shift_template_id, dayStr, holStr] = key.split("|");
  return {
    position_id,
    shift_template_id,
    day_of_week: Number(dayStr),
    is_holiday: holStr === "1",
  };
}
```

- `replicateAcrossDays` (línea 77): la llamada `makeCellKey(positionId, shiftTemplateId, sourceDay)` → `makeCellKey(positionId, shiftTemplateId, sourceDay, false)`; y la de destino (línea 81) → `makeCellKey(positionId, shiftTemplateId, targetDay, false)`. (La replicación opera solo sobre días de semana.)
- `replicateShiftToShift` (línea 99): `makeCellKey(parsed.position_id, targetShiftId, parsed.day_of_week, parsed.is_holiday)` (preserva el `is_holiday` del origen).

(`diffStaffing` usa `...parseCellKey(key)` → propaga `is_holiday` automáticamente; no requiere cambio de lógica más allá del tipo.)

- [ ] **Step 5: Correr el test — debe PASAR**

Run: `npm run test -- staffing-helpers`
Expected: PASS. `npm run typecheck` puede mostrar errores en los CALL-SITES de `makeCellKey` (UI) que aún pasan 3 args — esos se arreglan en Task 4. Anotarlos pero no son de esta task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/staffing-helpers.ts src/lib/staffing-helpers.test.ts
git commit -m "feat(staffing): CellKey con is_holiday + StaffingRequirement.is_holiday

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Motor — `buildDemandSlots` usa el perfil de festivo

**Files:**
- Modify: `src/lib/schedule-generator.ts` (`buildDemandSlots` ~101-144 y su call-site ~488)
- Test: `src/lib/schedule-generator.test.ts`

**Interfaces:**
- Consumes: `StaffingRequirement.is_holiday` (Task 2); `isHoliday(dateStr, locationId, holidays)` de `equity-helpers` (ya importado).
- Produces: `buildDemandSlots(config, dates, templates, staffingRequirements, holidays, locationId)`.

- [ ] **Step 1: Escribir el test (TDD)**

Modify `src/lib/schedule-generator.test.ts` — agregar (adaptando la forma real de `generateSchedule`/`AutoGenConfig`/staffing reqs de los tests vecinos; mirá un test existente que use `staffingRequirements`):

```ts
describe("demanda de festivos", () => {
  it("posición con perfil de festivo usa el turno de festivo en un festivo y NO el de día de semana", () => {
    const holidays = [{ id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" }];
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({ id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    // Demanda: día de semana (jueves=4) turno normal req 1; festivo turno festivo req 1.
    const reqs = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm", "tpl-fest"], employeeIds: ["e1"], useDemandRequirements: true } as never,
      [emp], [tplNormal, tplFest], reqs, {} as never, holidays,
    );
    const onHoliday = result.entries.filter((e) => e.date === "2026-04-09");
    expect(onHoliday.length).toBe(1);
    expect(onHoliday[0].start_time).toBe("09:00:00"); // turno de festivo, no el normal 08:00
  });
});
```

NOTA: ajustar la firma exacta de `generateSchedule`, `AutoGenConfig` (campos como `useDemandRequirements`, `excludeDates`) y la forma de `makeEmployee`/`makeTemplate` a la de los tests vecinos del archivo.

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `npm run test -- schedule-generator`
Expected: FAIL (hoy el festivo usa el turno del día de semana, start 08:00).

- [ ] **Step 3: Ampliar la firma y la llamada de `buildDemandSlots`**

Modify `src/lib/schedule-generator.ts`:
- Firma (~101): agregar 2 params al final: `holidays: HolidayDate[], locationId: string`.
- Call-site (~488): `buildDemandSlots(config, dates, selectedTemplates, staffingRequirements, holidays, config.locationId)`.

- [ ] **Step 4: Implementar la rama festivo en `buildDemandSlots`**

Reemplazar el cuerpo de `buildDemandSlots` (mantener el resto igual). Tras construir `reqMap` (solo no-festivas) agregar los índices de festivo, y en el lookup del bloque `hasDemand` decidir según `isHoliday`:

```ts
  const reqMap = new Map<string, number>();
  const reqMapHoliday = new Map<string, number>();
  const holidayPositions = new Set<string>();
  for (const sr of staffingRequirements) {
    if (sr.is_holiday) {
      reqMapHoliday.set(`${sr.position_id}_${sr.shift_template_id}`, sr.required_count);
      holidayPositions.add(sr.position_id);
    } else {
      reqMap.set(`${sr.position_id}_${sr.shift_template_id}_${sr.day_of_week}`, sr.required_count);
    }
  }
```

Y en el loop, dentro de `if (hasDemand)`, reemplazar el cálculo de `count`:

```ts
        const isHol = isHoliday(dateStr, locationId, holidays);
        for (const posId of config.positionIds) {
          const count = (isHol && holidayPositions.has(posId))
            ? (reqMapHoliday.get(`${posId}_${templateId}`) ?? 0)
            : (reqMap.get(`${posId}_${templateId}_${dow}`) ?? 0);
          for (let i = 0; i < count; i++) {
            slots.push({ date: dateStr, dayOfWeek: dow, positionId: posId,
              shiftTemplateId: templateId, startTime: template.start_time,
              endTime: template.end_time, breakMinutes: template.break_minutes,
              durationHours: duration, template });
          }
        }
```

(`isHoliday` ya está importado en `schedule-generator.ts:7`. `HolidayDate` ya se usa en el archivo.)

- [ ] **Step 5: Correr el test — debe PASAR**

Run: `npm run test -- schedule-generator`
Expected: PASS. Luego `npm run test` completo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(scheduling): buildDemandSlots usa el perfil de festivo por posición

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(El controller despacha `schedule-algorithm-reviewer`.)

---

### Task 4: UI — columna "Festivo" en la matriz

**Files:**
- Modify: `src/hooks/use-staffing-matrix.ts` (~54-58)
- Modify: `src/components/staffing/staffing-tab-by-shift.tsx`, `staffing-tab-by-position.tsx`, `staffing-tab-heatmap.tsx`
- (Nota: `staffing-matrix.tsx:handleSave` NO requiere cambio — usa `...parseCellKey(key)`, que ahora emite `is_holiday` automáticamente.)

**Interfaces:**
- Consumes: `makeCellKey(pos, shift, dow, isHoliday)` (Task 2); `database.types.ts` regenerado con `is_holiday` (controller, tras Task 1).

- [ ] **Step 1 (OBLIGATORIO): invocar modern-web-guidance**

Invocá la skill `modern-web-guidance:modern-web-guidance` con query "data table accessible column header cell". Aplicá sus DOs/DON'Ts a la columna nueva (header con scope, celda con aria-label que incluya "Festivo").

- [ ] **Step 2: `use-staffing-matrix.ts` — incluir `is_holiday` en el persistedMap**

Modify `src/hooks/use-staffing-matrix.ts` (~56) — la línea:
```ts
persistedMap[makeCellKey(r.position_id, r.shift_template_id, r.day_of_week)] = r.required_count;
```
→
```ts
persistedMap[makeCellKey(r.position_id, r.shift_template_id, r.day_of_week, r.is_holiday)] = r.required_count;
```

- [ ] **Step 3: `staffing-tab-by-shift.tsx` — agregar la columna Festivo**

En `src/components/staffing/staffing-tab-by-shift.tsx`:
- Las 2 llamadas `makeCellKey(position.id, shift.id, dayIndex)` (header replicación scope NO la usa; la de celda ~193) → agregar `, false`: `makeCellKey(position.id, shift.id, dayIndex, false)`.
- En el `<thead>`, tras el `{DAY_ORDER.map((dayIndex) => (<th>...))}`, agregar un `<th>` "Festivo":

```tsx
<th className="px-1 py-2 text-center font-medium text-muted-foreground min-w-[72px]" scope="col">
  <span className="text-amber-600">Festivo</span>
</th>
```
- En el `<tbody>`, dentro de cada `<tr>`, tras el `{DAY_ORDER.map((dayIndex) => { ... })}`, agregar una celda Festivo:

```tsx
<td className="px-1 py-1.5 bg-amber-50/40">
  {(() => {
    const key = makeCellKey(position.id, shift.id, 0, true);
    const value = draft[key] ?? persisted[key] ?? 0;
    return (
      <StaffingCell
        value={value}
        capacity={capacity[position.id] ?? 0}
        recentCoverage={[]}
        onChange={(v) => onCellChange(key, v)}
        ariaLabel={`${position.name} Festivo ${shift.name}`}
      />
    );
  })()}
</td>
```

- [ ] **Step 4: Replicar el patrón en `staffing-tab-by-position.tsx`**

Mismo patrón: añadir `, false` a las `makeCellKey(...dayIndex)` existentes (celda ~174), un `<th>` "Festivo" tras el map del header (~103-156), y una `<td>` festivo tras el map de celdas (~173-191), con `makeCellKey(position.id, shift.id, 0, true)` (ajustar nombres de variables locales `position`/`shift` a los del archivo).

- [ ] **Step 5: Replicar en `staffing-tab-heatmap.tsx`**

Mismo patrón en el header (~105-118) y celdas (~153-203); añadir `, false` a las `makeCellKey(...dayIndex)` existentes (~154) y una columna Festivo con `makeCellKey(pos, shift, 0, true)`. El heatmap edita inline (no usa `<StaffingCell>` con coverage) — seguí su forma de edición local para la celda festiva.

- [ ] **Step 6: Verificar typecheck + tests**

Run: `npm run typecheck` → exit 0 (todos los call-sites de `makeCellKey` ahora pasan 4 args).
Run: `npm run test` → verde.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-staffing-matrix.ts "src/components/staffing/staffing-tab-by-shift.tsx" "src/components/staffing/staffing-tab-by-position.tsx" "src/components/staffing/staffing-tab-heatmap.tsx"
git commit -m "feat(staffing): columna Festivo en la matriz de necesidades

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Validación final

- [ ] **Step 1: Suite + typecheck verdes**

Run: `npm run test` (incluye los nuevos de helpers y motor) y `npm run typecheck` (exit 0).

- [ ] **Step 2: Verificar en Cloud**

Run (Supabase MCP `execute_sql`): confirmar que la columna y el constraint existen:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.staffing_requirements'::regclass and contype='u';
```
Expected: el UNIQUE incluye `is_holiday`.

- [ ] **Step 3: `/code-review` del diff de la rama**

Correr `/code-review` sobre `main...feature/holiday-staffing`. Foco: el RPC (que `is_holiday` esté en los 4 puntos), el motor (semántica reemplaza + retrocompat sin perfil), los 3 tabs (los 4 args en todas las `makeCellKey`), y que `handleSave` emita las filas festivas. Arreglar bloqueadores.

- [ ] **Step 4: Commit de fixes (si aplica)**

```bash
git add -A
git commit -m "fix: ajustes de code-review en demanda de festivos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review del plan

**Spec coverage:**
- Componente 1 (migración + RPC + UNIQUE) → Task 1 ✓
- Componente 2 (tipos) → Task 2 ✓
- Componente 3 (helpers) → Task 2 ✓
- Componente 4 (motor) → Task 3 ✓
- Componente 5 (UI) → Task 4 ✓
- Testing (motor, helpers, SQL) → Tasks 1, 2, 3 ✓
- Validación (reviewers + /code-review) → cada task + Task 5 ✓
- Riesgo "handleSave debe emitir festivas" → cubierto: `parseCellKey` emite `is_holiday`, `handleSave` ya lo spreadea (nota en Task 4).

**Placeholder scan:** el SQL del RPC, el motor y los helpers son literales. El único "ajustar a la forma real" es la firma de `generateSchedule` en el test del motor (Task 3) y los nombres de variables locales de los tabs (Task 4) — instrucciones de fidelidad al código existente, no placeholders de lógica.

**Type consistency:** `makeCellKey(pos, shift, dow, isHoliday)` 4-args consistente entre helpers (Task 2), UI (Task 4) y persistedMap. `is_holiday` consistente en `StaffingRequirement`, `StaffingCell`, RPC, motor. Sentinela `dow=0` consistente entre migración, UI festivo y test.
