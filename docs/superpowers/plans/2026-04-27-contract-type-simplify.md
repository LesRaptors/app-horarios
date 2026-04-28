# Simplificación contract types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Reemplazar el form de 7 inputs numéricos por 3 inputs + 4 switches; eliminar caps trimestrales y targets aspiracionales del modelo; el algoritmo balancea equidad solo.

**Architecture:** Mig 034 agrega columnas nuevas y deprecates las viejas. Motor lee solo las nuevas. Form rediseñado.

**Tech Stack:** Postgres, TypeScript, Next.js, shadcn (RadioGroup, Switch). Sin nuevas dependencias.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/034_contract_types_simplify.sql` | create | columnas nuevas + UPDATE migración + comments |
| `src/lib/types.ts` | modify | extender `ContractType` con campos nuevos |
| `src/lib/schedule-generator.ts` | modify | inviolables por disponibilidad, cap derivado de jornada, eliminar uso de campos deprecated |
| `src/lib/schedule-generator.test.ts` | modify | 2 tests nuevos |
| `src/app/(authenticated)/contract-types/page.tsx` | modify | form rediseñado + tabla simplificada |
| `CLAUDE.md` | modify | reflejar el modelo simplificado |

---

## Task 1: Migración 034

**Files:**
- Create: `supabase/migrations/034_contract_types_simplify.sql`

- [ ] **Step 1: SQL completo**

```sql
-- 034: Simplificación de contract_types.

ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS weekly_hours_mode TEXT NOT NULL DEFAULT 'full' CHECK (weekly_hours_mode IN ('full','partial')),
  ADD COLUMN IF NOT EXISTS weekly_hours INT,
  ADD COLUMN IF NOT EXISTS is_healthcare BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_sundays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_holidays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_nights BOOLEAN NOT NULL DEFAULT true;

-- Migrar valores existentes a columnas nuevas (best-effort).
UPDATE contract_types SET
  weekly_hours_mode = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN 'full'
    ELSE 'partial'
  END,
  weekly_hours = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN NULL
    ELSE target_hours_per_week
  END,
  available_sundays = (COALESCE(max_sundays_per_quarter, 999) > 0),
  available_holidays = (COALESCE(max_holidays_per_quarter, 999) > 0),
  available_nights = (COALESCE(target_nights_per_month, 1) > 0);

-- Mark old columns as deprecated.
COMMENT ON COLUMN contract_types.max_sundays_per_quarter IS 'DEPRECATED 034 — algoritmo balancea equitativamente. Mantener por compat.';
COMMENT ON COLUMN contract_types.max_holidays_per_quarter IS 'DEPRECATED 034 — idem.';
COMMENT ON COLUMN contract_types.target_saturdays_per_month IS 'DEPRECATED 034 — scoring balancea sábados.';
COMMENT ON COLUMN contract_types.target_nights_per_month IS 'DEPRECATED 034 — reemplazado por available_nights.';
COMMENT ON COLUMN contract_types.target_hours_per_week IS 'DEPRECATED 034 — usar weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_week IS 'DEPRECATED 034 — derivado de weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_day IS 'DEPRECATED 034 — derivado de is_healthcare.';
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Tool: `mcp__plugin_supabase_supabase__apply_migration`. name=`034_contract_types_simplify`, project_id=`ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verificar**

```sql
SELECT name, weekly_hours_mode, weekly_hours, is_healthcare, available_sundays, available_holidays, available_nights FROM contract_types ORDER BY name;
```
Expected: 4 rows con valores migrados (Full-time, Part-time, Fin de semana, Sin definir).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/034_contract_types_simplify.sql
git commit -m "feat(contracts): mig 034 — modelo simplificado (jornada + asistencial + disponibilidad)"
```

---

## Task 2: Tipo TS

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extender `ContractType`**

Buscar `export interface ContractType`. Agregar dentro:

```ts
  weekly_hours_mode: "full" | "partial";
  weekly_hours: number | null;
  is_healthcare: boolean;
  available_sundays: boolean;
  available_holidays: boolean;
  available_nights: boolean;
```

Las columnas viejas se mantienen en el tipo (deprecated) para compatibilidad.

- [ ] **Step 2: Build**

```bash
npm run build
```

Si hay errores TS por test factories que no incluyen los nuevos campos, agregarlos con valores razonables (`weekly_hours_mode: "full"`, `weekly_hours: null`, `is_healthcare: false`, los 3 `available_*: true`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/schedule-generator.test.ts
git commit -m "feat(contracts): tipo ContractType con modelo simplificado"
```

---

## Task 3: Motor — inviolables por disponibilidad + cap derivado (TDD)

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: Tests nuevos**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("contract availability flags", () => {
  it("empleado con available_sundays=false NO recibe domingo", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-no-sun", available_sundays: false,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-no-sun" });
    const tpl = makeTemplate({ id: "tpl-m" });

    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"] },
      [emp], [tpl], [], [],
      defaultConstraints,
      // Demand: domingo 5 abr
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 0, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [ct], defaultWeights,
    );

    expect(result.entries.find((e) => e.date === "2026-04-05")).toBeUndefined();
  });

  it("contract.is_healthcare=true permite turnos de hasta 12h", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-hc", is_healthcare: true,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-hc" });
    const tpl = makeTemplate({
      id: "tpl-12h", name: "12h", start_time: "07:00", end_time: "19:00",
    });

    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-12h"] },
      [emp], [tpl], [], [],
      // Global: 10h/día. Pero is_healthcare lo eleva a 12.
      { maxHoursPerWeek: 48, maxHoursPerDay: 10,
        minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-12h", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [ct], defaultWeights,
    );

    expect(result.entries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm run test -- schedule-generator
```
Expected: FAIL.

- [ ] **Step 3: Modificar `filterCandidates` — INVIOLABLES**

Agregar 3 nuevos chequeos en la sección INVIOLABLES de `filterCandidates`, después de los chequeos de descanso/rest y ANTES de `if (allowOvertime) { kept.push(empId); continue; }`:

```ts
    // INVIOLABLES: disponibilidad por contract_type
    if (contract?.available_sundays === false && dayOfWeek(slot.date) === 0) continue;
    if (contract?.available_holidays === false && isHoliday(slot.date, ctx.locationId, ctx.holidays)) continue;
    if (contract?.available_nights === false && isNightShift(slot.template)) continue;
```

NOTA: `contract` ya está declarado al principio de la función (de cambios anteriores). Si no está, declararlo antes de estos chequeos: `const contract = ctx.contractTypes.get(employee.contract_type_id);`.

Cambiar también el `dayCap`:

```ts
    const dayCap = contract?.is_healthcare ? 12 : (contract?.max_hours_per_day ?? constraints.maxHoursPerDay);
    if (slot.durationHours > dayCap) continue;
```

(`max_hours_per_day` se mantiene como fallback secundario por compat con data vieja.)

En la sección CONTRACTUAL, cambiar `effectiveWeekly`:

```ts
    const weekHardCap = contract?.weekly_hours
      ?? contract?.max_hours_per_week
      ?? contract?.target_hours_per_week
      ?? Number.POSITIVE_INFINITY;
    const effectiveWeekly = Math.min(constraints.maxHoursPerWeek, weekHardCap, employee.max_hours_per_week);
```

ELIMINAR los chequeos contractuales de quarter caps (líneas que chequean `max_sundays_per_quarter` y `max_holidays_per_quarter`):

```ts
    // ELIMINAR ESTAS LÍNEAS:
    if (dayOfWeek(slot.date) === 0 && q.sundays + 1 > contract.max_sundays_per_quarter) continue;
    if (isHoliday(...) && q.holidays + 1 > contract.max_holidays_per_quarter) continue;
```

Y también el cap por `target_nights_per_month` (que ya no se usa, ahora es boolean).

- [ ] **Step 4: Modificar `computeExceededCaps`**

Misma lógica de `effectiveWeekly` que arriba (usar `weekly_hours ?? max_hours_per_week ?? target_hours_per_week ?? Infinity`).

ELIMINAR el push de `sundays_quarter` y `holidays_quarter` (esos caps se eliminan).

NOTA: el tipo `CapExcessKind` los mantiene en el union por compat (entries históricas pueden tenerlos), pero el motor ya no los emite.

- [ ] **Step 5: Modificar `scoreCandidate`**

ELIMINAR cualquier uso de `target_saturdays_per_month` o `target_nights_per_month` como bonus en el score.

Las penalizaciones por rolling rollups (sundays/saturdays/nights/holidays) se MANTIENEN — esa es la equidad real.

La penalización por `effectiveWeekly` ya se ajustó implícitamente al cambiar el cálculo.

- [ ] **Step 6: PASS**

```bash
npm run test -- schedule-generator
```
Expected: PASS, 260 tests total (258 + 2 nuevos).

- [ ] **Step 7: Build + suite**

```bash
npm run build && npm run test
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(schedule): inviolables por disponibilidad (sundays/holidays/nights) + cap derivado de jornada"
```

---

## Task 4: Form `/contract-types` rediseñado

**Files:**
- Modify: `src/app/(authenticated)/contract-types/page.tsx`

- [ ] **Step 1: Leer la página**

Identificar el componente `ContractTypeForm`. Tiene 7 inputs hoy. Los reemplazás por:
- Input `name` (required)
- Textarea `description` (opcional)
- RadioGroup `weekly_hours_mode` con 2 opciones; si "partial", input `weekly_hours`.
- Switch `is_healthcare` con label "Personal asistencial (12h/día vs 10h/día)".
- 3 Switches: `available_sundays`, `available_holidays`, `available_nights` agrupados bajo "Días disponibles".

ELIMINAR del form los inputs de:
- `max_sundays_per_quarter`
- `max_holidays_per_quarter`
- `target_saturdays_per_month`
- `target_nights_per_month`
- `target_hours_per_week`
- `max_hours_per_day`
- `max_hours_per_week`

- [ ] **Step 2: Estado local**

```ts
type FormState = {
  name: string;
  description: string;
  weekly_hours_mode: "full" | "partial";
  weekly_hours: string;  // string para input controlado
  is_healthcare: boolean;
  available_sundays: boolean;
  available_holidays: boolean;
  available_nights: boolean;
};
```

- [ ] **Step 3: Persistencia**

Al guardar, payload a Supabase:

```ts
const payload = {
  name: form.name,
  description: form.description || null,
  weekly_hours_mode: form.weekly_hours_mode,
  weekly_hours: form.weekly_hours_mode === "partial" && form.weekly_hours
    ? Number(form.weekly_hours)
    : null,
  is_healthcare: form.is_healthcare,
  available_sundays: form.available_sundays,
  available_holidays: form.available_holidays,
  available_nights: form.available_nights,
  // Campos viejos: dejar a null o mantener los actuales para no romper data vieja.
  // En INSERT nuevos, los nuevos defaults aplican; en UPDATE, mantener los valores existentes
  // (no incluirlos en el payload — Supabase no los toca).
};
```

Para INSERT: incluir solo campos nuevos. Los viejos toman default de DB (si tienen) o null.
Para UPDATE: incluir solo campos nuevos. Los viejos quedan como están en BD.

- [ ] **Step 4: Tabla principal**

Simplificar las columnas mostradas:
- Nombre
- Empleados (count)
- Jornada (Completa / Parcial NN h)
- Asistencial (✓ / ✗)
- Disponibilidad (D/F/N badges)
- Acciones (editar/eliminar)

ELIMINAR las columnas viejas (max sundays, target sábados, etc.).

- [ ] **Step 5: shadcn imports**

Si `Switch` y `RadioGroup` no están instalados, instalar:

```bash
npx shadcn@latest add switch radio-group
```

- [ ] **Step 6: Build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(authenticated\)/contract-types/page.tsx src/components/ui/switch.tsx src/components/ui/radio-group.tsx
git commit -m "feat(contracts): form simplificado — jornada + asistencial + disponibilidad"
```

---

## Task 5: CLAUDE.md + push + smoke

- [ ] **Step 1: Actualizar CLAUDE.md**

Reemplazar la sección de `contract_types` (línea ~96) con:

```markdown
- **`contract_types`** (modelo simplificado migración 034): `weekly_hours_mode` (full=44h, partial=custom), `weekly_hours` (override si parcial), `is_healthcare` (12h/día vs 10h/día), `available_sundays/holidays/nights` (booleans inviolables). El algoritmo balancea sábados/domingos/noches/festivos equitativamente vía `rolling_rollup_sums`. Caps trimestrales eliminados (no exigidos por ley). Columnas viejas (`max_sundays_per_quarter`, `target_saturdays_per_month`, etc.) marcadas DEPRECATED — mantenidas por compat, ya no leídas por el motor. Default contract type: "Sin definir" (full, no asistencial, todo disponible).
```

- [ ] **Step 2: Build + suite**

```bash
npm run build && npm run test
```
Expected: 260 tests, build clean.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: contract types simplificados en CLAUDE.md"
git push origin main
```

- [ ] **Step 4: Smoke**

1. `/contract-types` → ver tabla con columnas nuevas. Editar "Full-time" → ver form simplificado. Marcar "Personal asistencial" + Guardar.
2. BD: `SELECT name, is_healthcare, weekly_hours_mode FROM contract_types WHERE name='Full-time';` → debería tener `is_healthcare=true`.
3. `/schedule` → si hay turnos de 12h en plantillas, regenerar; el empleado con contract `is_healthcare=true` puede recibirlos.

---

## Self-review

- Spec §1-§7 todo cubierto.
- Migración mantiene columnas viejas (deprecated) → no rompe data.
- Motor solo lee columnas nuevas. Las viejas ya no se chequean.
- TDD para 2 tests nuevos del motor.
- Form rediseñado completo.
- CLAUDE.md actualizado.
