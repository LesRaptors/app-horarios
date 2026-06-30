# Horario especial en festivos por turno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un turno puede tener, opcionalmente, un horario alternativo que el motor usa cuando ese turno cae en un día festivo — sin crear turnos nuevos ni tocar Necesidades.

**Architecture:** Tres columnas opcionales en `shift_templates` (`holiday_start_time`, `holiday_end_time`, `holiday_break_minutes`). El motor (`buildDemandSlots`) ya sabe por fecha si el día es festivo; al construir el turno de un festivo, si el turno tiene horario de festivo, escribe esas horas en el `schedule_entry`. Como cada registro guarda sus propias horas, equidad/nómina/grilla/export quedan correctos sin más cambios. La UI agrega un switch en el form de `/shifts`.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, shadcn/ui (Switch, Input, Label), Tailwind v3.

## Global Constraints

- UI en **español**, sin emojis. Acentos correctos (`día`, `posición`, `descanso`).
- Retrocompatible: `NULL` en las 3 columnas = comportamiento actual intacto (sin horario especial).
- Multi-tenant: `shift_templates` es org-scoped; la migración solo `ADD COLUMN` (no toca RLS).
- El descanso de festivo cuando el turno tiene horario especial pero `holiday_break_minutes` es `NULL` = **0**.
- "Tiene horario de festivo" ⇔ `holiday_start_time IS NOT NULL` (la UI garantiza que `holiday_end_time` también esté presente en ese caso).
- `day_of_week`: 0=domingo … 6=sábado (convención JS).
- Fechas ISO `YYYY-MM-DD`. Horas como `HH:MM:SS` en DB.

---

### Task 1: Datos — migración 062 + tipo `ShiftTemplate` + test SQL

**Files:**
- Create: `supabase/migrations/062_holiday_shift_hours.sql`
- Create: `supabase/tests/062_holiday_shift_hours.sql`
- Modify: `src/lib/types.ts` (interface `ShiftTemplate`)
- Modify: `src/lib/schedule-generator.test.ts` (helper `makeTemplate`, ~líneas 42-50)

**Interfaces:**
- Produces: `ShiftTemplate.holiday_start_time: string | null`, `ShiftTemplate.holiday_end_time: string | null`, `ShiftTemplate.holiday_break_minutes: number | null`. Tareas 2 y 3 leen estos campos.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/062_holiday_shift_hours.sql`:

```sql
-- 062_holiday_shift_hours.sql
-- Horario especial en festivos por turno (opcional).
-- Cuando holiday_start_time está definido, el motor de generación usa estas horas
-- para los turnos que caen en días festivos, en vez de start_time/end_time normales.
-- NULL = sin horario especial (comportamiento actual intacto). No toca RLS.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS holiday_start_time    time,
  ADD COLUMN IF NOT EXISTS holiday_end_time      time,
  ADD COLUMN IF NOT EXISTS holiday_break_minutes integer;

COMMENT ON COLUMN shift_templates.holiday_start_time IS
  'Hora de inicio cuando el turno cae en festivo. NULL = usa start_time normal.';
COMMENT ON COLUMN shift_templates.holiday_end_time IS
  'Hora de fin cuando el turno cae en festivo. NULL = usa end_time normal.';
COMMENT ON COLUMN shift_templates.holiday_break_minutes IS
  'Minutos de descanso cuando el turno cae en festivo. NULL = 0.';
```

- [ ] **Step 2: Escribir el test SQL**

Crear `supabase/tests/062_holiday_shift_hours.sql` (patrón `BEGIN ... ROLLBACK`, seguro contra prod):

```sql
-- Test: las 3 columnas de horario de festivo existen y son nullables.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_name = 'shift_templates'
    AND column_name IN ('holiday_start_time', 'holiday_end_time', 'holiday_break_minutes')
    AND is_nullable = 'YES';
  IF n <> 3 THEN
    RAISE EXCEPTION 'Esperaba 3 columnas holiday_* nullables en shift_templates, encontré %', n;
  END IF;

  -- Verifica los tipos esperados.
  PERFORM 1 FROM information_schema.columns
  WHERE table_name = 'shift_templates' AND column_name = 'holiday_start_time' AND data_type = 'time without time zone';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_start_time no es de tipo time'; END IF;

  PERFORM 1 FROM information_schema.columns
  WHERE table_name = 'shift_templates' AND column_name = 'holiday_break_minutes' AND data_type = 'integer';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_break_minutes no es de tipo integer'; END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 3: Agregar los campos al tipo `ShiftTemplate`**

En `src/lib/types.ts`, en `interface ShiftTemplate`, agregar las 3 propiedades justo después de `location_id: string;`:

```ts
export interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_night: boolean;
  color: string;
  location_id: string;
  holiday_start_time: string | null;
  holiday_end_time: string | null;
  holiday_break_minutes: number | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  location?: any;
}
```

- [ ] **Step 4: Actualizar el helper `makeTemplate` del test (mantener typecheck verde)**

En `src/lib/schedule-generator.test.ts`, el helper `makeTemplate` (~líneas 42-50) construye un `ShiftTemplate`; agregar los nuevos campos con default `null`:

```ts
function makeTemplate(overrides: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id: "tpl-morn", name: "Morning",
    start_time: "09:00:00", end_time: "17:00:00",
    break_minutes: 0, color: "#000", location_id: "loc-1",
    is_night: false,
    holiday_start_time: null, holiday_end_time: null, holiday_break_minutes: null,
    created_at: "",
    ...overrides,
  };
}
```

- [ ] **Step 5: Verificar typecheck y tests**

Run: `npm run typecheck && npm run test`
Expected: typecheck 0 errores; los tests existentes siguen verdes (los nuevos campos son opcionales en la práctica vía `null`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/062_holiday_shift_hours.sql supabase/tests/062_holiday_shift_hours.sql src/lib/types.ts src/lib/schedule-generator.test.ts
git commit -m "feat(shifts): columnas de horario de festivo en shift_templates (migración 062)"
```

> **Coordinación del controlador (no es un paso del implementer):** tras el review de `migration-reviewer`, el controlador aplica la migración a Supabase Cloud (`apply_migration`, proyecto `ugkvuinkynvtuiutwlkd`) y regenera `src/lib/supabase/database.types.ts` (`generate_typescript_types`) — necesario para que la Tarea 3 compile el `select` del form con los nuevos campos. Verificar de nuevo `npm run typecheck`.

---

### Task 2: Motor — aplicar el horario de festivo en `buildDemandSlots`

**Files:**
- Modify: `src/lib/schedule-generator.ts` (`pushSlot` ~líneas 127-138; loop por fecha ~línea 145; 3 llamadas a `pushSlot` ~líneas 156, 164, 173)
- Test: `src/lib/schedule-generator.test.ts` (nuevo `describe` al final)

**Interfaces:**
- Consumes: `ShiftTemplate.holiday_start_time/holiday_end_time/holiday_break_minutes` (Tarea 1). `isHoliday(dateStr, locationId, holidays)` (ya importado), `calcDurationHours(start, end, breakMin)` (ya existe, línea 52).
- Produces: `schedule_entries` con `start_time`/`end_time`/duración del horario de festivo cuando el día es festivo y el turno lo define.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/schedule-generator.test.ts`, agregar al final (antes del último `});` de cierre del archivo NO — es un nuevo `describe` a nivel raíz, después del `describe("demanda de festivos", ...)`):

```ts
describe("horario de festivo del turno", () => {
  const holidays: HolidayDate[] = [
    { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
  ];
  // 2026-04-09 es jueves (day_of_week=4) y festivo.
  const weekdayReq = (tplId: string): StaffingRequirement[] => [
    { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: tplId,
      day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
  ];

  it("usa el horario de festivo cuando el turno cae en festivo (con demanda)", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00", break_minutes: 60,
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("10:00:00");
    expect(onHoliday?.end_time).toBe("15:00:00");
  });

  it("festivo sin horario de festivo configurado usa las horas normales", () => {
    const tpl = makeTemplate({ id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00" });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("08:00:00");
  });

  it("día NO festivo ignora el horario de festivo del turno", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    // 2026-04-02 es jueves pero NO festivo (el festivo es el 09).
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-02"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onDay = result.entries.find((e) => e.date === "2026-04-02");
    expect(onDay?.start_time).toBe("08:00:00");
  });

  it("perfil de festivo (Necesidades) + horario de festivo del turno se combinan", () => {
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({
      id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "14:00:00", holiday_break_minutes: 0,
    });
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm", "tpl-fest"], positionIds: ["pos-1"],
        excludeDates: [], employeeIds: ["e1"], useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tplNormal, tplFest], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    // El perfil de festivo pide tpl-fest; como es festivo y tpl-fest tiene horario de festivo,
    // usa 10:00-14:00 en vez de su horario normal 09:00-13:00.
    expect(onHoliday?.shift_template_id).toBe("tpl-fest");
    expect(onHoliday?.start_time).toBe("10:00:00");
    expect(onHoliday?.end_time).toBe("14:00:00");
  });

  it("modo sin demanda: festivo usa el horario de festivo del turno", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: false },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, [], [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("10:00:00");
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `npm run test -- schedule-generator`
Expected: FAIL en los 3 casos que esperan `10:00:00` / `14:00:00` (con demanda, perfil de festivo, sin demanda) — el motor todavía escribe las horas normales. Los otros 2 casos ("festivo sin horario… usa las horas normales" y "día NO festivo… ignora") ya pasan; eso es correcto (son regresión).

- [ ] **Step 3: Modificar `pushSlot` para elegir las horas según festivo**

En `src/lib/schedule-generator.ts`, reemplazar la definición de `pushSlot` (~líneas 127-138) por:

```ts
  const pushSlot = (
    dateStr: string, dow: number, posId: string, template: ShiftTemplate, count: number,
    isHolidayDate: boolean,
  ) => {
    if (count <= 0) return;
    const useHol =
      isHolidayDate && template.holiday_start_time != null && template.holiday_end_time != null;
    const startTime = useHol ? template.holiday_start_time! : template.start_time;
    const endTime = useHol ? template.holiday_end_time! : template.end_time;
    const breakMin = useHol ? (template.holiday_break_minutes ?? 0) : template.break_minutes;
    const duration = calcDurationHours(startTime, endTime, breakMin);
    for (let i = 0; i < count; i++) {
      slots.push({ date: dateStr, dayOfWeek: dow, positionId: posId,
        shiftTemplateId: template.id, startTime,
        endTime, breakMinutes: breakMin,
        durationHours: duration, template });
    }
  };
```

- [ ] **Step 4: Separar `isHolidayDate` de `isHol` en el loop por fecha**

En el mismo archivo, reemplazar la línea (~145):

```ts
    const isHol = hasDemand && isHoliday(dateStr, locationId, holidays);
```

por:

```ts
    // isHolidayDate: ¿la fecha es festivo? (decide las HORAS del turno).
    // isHol: además hay demanda (decide si aplica el PERFIL de festivo de Necesidades).
    const isHolidayDate = isHoliday(dateStr, locationId, holidays);
    const isHol = hasDemand && isHolidayDate;
```

- [ ] **Step 5: Pasar `isHolidayDate` a las 3 llamadas de `pushSlot`**

En el mismo archivo, las 3 llamadas existentes a `pushSlot` reciben un argumento final `isHolidayDate`:

- Rama perfil de festivo (~línea 156):
```ts
            pushSlot(dateStr, dow, posId, template, count, isHolidayDate);
```
- Rama día de semana (~línea 164):
```ts
            pushSlot(dateStr, dow, posId, template, reqMap.get(`${posId}_${templateId}_${dow}`) ?? 0, isHolidayDate);
```
- Rama sin demanda (~línea 173):
```ts
          pushSlot(dateStr, dow, posId, template, 1, isHolidayDate);
```

- [ ] **Step 6: Correr los tests y typecheck**

Run: `npm run test -- schedule-generator && npm run typecheck`
Expected: los 5 casos nuevos PASS; el resto del archivo sigue verde; typecheck 0 errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(scheduler): usa el horario de festivo del turno en días festivos"
```

---

### Task 3: UI — switch "Horario especial en festivos" en `/shifts`

**Files:**
- Modify: `src/app/(authenticated)/shifts/page.tsx` (import Switch; interface local `ShiftTemplateItem` ~líneas 73-85; estados de form ~líneas 105-110; `openCreateDialog` ~líneas 145-154; `openEditDialog` ~líneas 156-165; `handleSave` validación + payload ~líneas 167-190; JSX del dialog tras "Minutos de descanso" ~línea 443)

**Interfaces:**
- Consumes: columnas `holiday_*` de `shift_templates` (Tarea 1, vía `select("*")` ya presente) y `database.types.ts` regenerado (coordinación del controlador en Tarea 1).

> **Antes de tocar la UI:** invocar la skill `modern-web-guidance:modern-web-guidance` con foco en "switch toggle form field label aria" y aplicar sus DOs (label asociado al control con `htmlFor`/`id`, descripción accesible, grupo de campos condicional). El form ya existe; conservar su patrón `div.space-y-2 > Label + Input`.

- [ ] **Step 1: Importar `Switch`**

En `src/app/(authenticated)/shifts/page.tsx`, junto a los demás imports de UI (ej. tras la línea `import { Label } from "@/components/ui/label";`):

```ts
import { Switch } from "@/components/ui/switch";
```

- [ ] **Step 2: Agregar los campos a la interfaz local `ShiftTemplateItem`**

En la `interface ShiftTemplateItem` (~líneas 73-85), agregar tras `color: string;`:

```ts
  holiday_start_time: string | null;
  holiday_end_time: string | null;
  holiday_break_minutes: number | null;
```

- [ ] **Step 3: Agregar los estados de form**

Tras `const [formColor, setFormColor] = useState<string>(COLOR_PALETTE[0].value);` (~línea 110):

```ts
  const [formHasHolidayHours, setFormHasHolidayHours] = useState(false);
  const [formHolidayStart, setFormHolidayStart] = useState("");
  const [formHolidayEnd, setFormHolidayEnd] = useState("");
  const [formHolidayBreak, setFormHolidayBreak] = useState(0);
```

- [ ] **Step 4: Resetear en `openCreateDialog`**

Dentro de `openCreateDialog` (~líneas 145-154), antes de `setDialogOpen(true);`:

```ts
    setFormHasHolidayHours(false);
    setFormHolidayStart("");
    setFormHolidayEnd("");
    setFormHolidayBreak(0);
```

- [ ] **Step 5: Precargar en `openEditDialog`**

Dentro de `openEditDialog` (~líneas 156-165), antes de `setDialogOpen(true);`:

```ts
    setFormHasHolidayHours(item.holiday_start_time != null);
    setFormHolidayStart(item.holiday_start_time ? formatTime(item.holiday_start_time) : "");
    setFormHolidayEnd(item.holiday_end_time ? formatTime(item.holiday_end_time) : "");
    setFormHolidayBreak(item.holiday_break_minutes ?? 0);
```

- [ ] **Step 6: Validación + payload en `handleSave`**

En `handleSave`, tras el bloque que valida `formStartTime`/`formEndTime` (~línea 179), agregar:

```ts
    if (formHasHolidayHours && (!formHolidayStart || !formHolidayEnd)) {
      toast.error("Define la hora de inicio y fin del horario de festivo");
      return;
    }
```

Y en el objeto `payload` (~líneas 183-190), agregar las 3 claves:

```ts
    const payload = {
      name: formName.trim(),
      location_id: formLocationId,
      start_time: formStartTime,
      end_time: formEndTime,
      break_minutes: formBreakMinutes,
      color: formColor,
      holiday_start_time: formHasHolidayHours ? formHolidayStart : null,
      holiday_end_time: formHasHolidayHours ? formHolidayEnd : null,
      holiday_break_minutes: formHasHolidayHours ? formHolidayBreak : null,
    };
```

- [ ] **Step 7: Insertar el bloque del switch en el JSX**

En el dialog, entre el bloque `{/* Minutos de descanso */}` (termina ~línea 443) y `{/* Color */}` (~línea 445), insertar:

```tsx
            {/* Horario especial en festivos */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="holiday-hours-switch">
                    Horario especial en festivos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cuando este turno cae en un día festivo, usa este horario en
                    vez del normal.
                  </p>
                </div>
                <Switch
                  id="holiday-hours-switch"
                  checked={formHasHolidayHours}
                  onCheckedChange={(checked) => {
                    setFormHasHolidayHours(checked);
                    if (checked && !formHolidayStart && !formHolidayEnd) {
                      setFormHolidayStart(formStartTime);
                      setFormHolidayEnd(formEndTime);
                    }
                  }}
                />
              </div>
              {formHasHolidayHours && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="holiday-start">Inicio</Label>
                    <Input
                      id="holiday-start"
                      type="time"
                      value={formHolidayStart}
                      onChange={(e) => setFormHolidayStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="holiday-end">Fin</Label>
                    <Input
                      id="holiday-end"
                      type="time"
                      value={formHolidayEnd}
                      onChange={(e) => setFormHolidayEnd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="holiday-break">Descanso (min)</Label>
                    <Input
                      id="holiday-break"
                      type="number"
                      min={0}
                      value={formHolidayBreak}
                      onChange={(e) =>
                        setFormHolidayBreak(parseInt(e.target.value) || 0)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
```

- [ ] **Step 8: Verificar typecheck y build de tipos**

Run: `npm run typecheck`
Expected: 0 errores. (Requiere que `database.types.ts` ya esté regenerado — coordinación de Tarea 1. Si `shift.holiday_start_time` da error de tipo en el `select`, regenerar tipos antes de continuar.)

- [ ] **Step 9: Commit**

```bash
git add "src/app/(authenticated)/shifts/page.tsx"
git commit -m "feat(shifts): switch de horario especial en festivos en el form de turno"
```

- [ ] **Step 10: Documentar la diferencia en CLAUDE.md**

En `CLAUDE.md`, en la sección de turnos/festivos (cerca de la descripción de `/shifts` y del perfil de festivo en Necesidades), agregar una línea que aclare las dos vías complementarias:

```markdown
- **Horario de festivo del turno** (`shift_templates.holiday_*`): solo cambian las HORAS de un turno cuando cae en festivo (mismo turno, misma cobertura). Se define en `/shifts`. Es independiente del **perfil de festivo en Necesidades** (`staffing_requirements.is_holiday`), que cambia QUÉ se necesita (posiciones/turnos/cantidades) en festivos.
```

Commit:

```bash
git add CLAUDE.md
git commit -m "docs: aclara horario de festivo del turno vs perfil de festivo en Necesidades"
```

---

## Validación final (whole-branch review)

- `npm run typecheck` y `npm run test` verdes.
- Reviewers especializados en el `/code-review` de rama:
  - `migration-reviewer`: migración 062 (idempotencia, nullable, RLS intacto), test SQL, regen de tipos.
  - `schedule-algorithm-reviewer`: cambio en `pushSlot`/`buildDemandSlots` contra el spec de equidad e inviolables (que las horas reducidas se propaguen a duración/horas, que `isHol` siga gobernando solo el perfil de festivo).
- Smoke manual sugerido: crear un turno con horario de festivo, generar un mes con un festivo en día laboral, verificar que el registro del festivo muestra las horas reducidas y que la nómina/equidad cuentan menos horas ese día.

## Notas de cierre

- El flujo de ejecución es subagent-driven: implementer (Tarea 1 mecánica → modelo económico; Tarea 2 motor → modelo estándar/capaz; Tarea 3 UI → modelo capaz) + task-reviewer por tarea + whole-branch `/code-review` al final.
- Aplicar la migración a Supabase Cloud y regenerar `database.types.ts` es responsabilidad del controlador tras el review de la Tarea 1 (los subagents headless pueden no tener el MCP de Supabase).
