# Caps por contract_type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Permitir caps de horas/día y horas/semana por tipo de contrato, con fallback al global. Caso de uso: 12h/día asistencial vs 10h/día administrativo.

**Architecture:** Migración 033 + 2 columnas nullable en `contract_types` + fallback en el engine + 2 inputs en el form de `/contract-types`.

**Tech Stack:** Postgres, TypeScript, Next.js, Vitest. Sin nuevas dependencias.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/033_contract_caps.sql` | create | columnas `max_hours_per_day` y `max_hours_per_week` |
| `src/lib/types.ts` | modify | extender `ContractType` |
| `src/lib/schedule-generator.ts` | modify | fallback contract → global en filtros y score |
| `src/lib/schedule-generator.test.ts` | modify | 1 test nuevo |
| `src/app/(authenticated)/contract-types/page.tsx` | modify | 2 inputs en form |
| `src/app/(authenticated)/settings/page.tsx` | modify | nota explicativa |
| `CLAUDE.md` | modify | mencionar caps contractuales |

---

## Task 1: Migración 033

**Files:**
- Create: `supabase/migrations/033_contract_caps.sql`

- [ ] **Step 1: SQL**

```sql
-- Migración 033: caps de horas por tipo de contrato.

ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS max_hours_per_day INT,
  ADD COLUMN IF NOT EXISTS max_hours_per_week INT;

COMMENT ON COLUMN contract_types.max_hours_per_day IS
  'Cap inviolable de horas por día. Si null, cae al global de labor_constraints. Útil para diferenciar personal asistencial (12h) vs administrativo (10h).';
COMMENT ON COLUMN contract_types.max_hours_per_week IS
  'Cap duro de horas por semana. Si null, cae a target_hours_per_week o al global. Distinto de target_hours_per_week (que es aspiracional).';
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Tool: `mcp__plugin_supabase_supabase__apply_migration`. name=`033_contract_caps`, project_id=`ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verificar**

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='contract_types' AND column_name IN ('max_hours_per_day','max_hours_per_week');
```
Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/033_contract_caps.sql
git commit -m "feat(contracts): mig 033 — max_hours_per_day y per_week por contract_type"
```

---

## Task 2: Tipo TS

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extender `ContractType`**

Buscar `export interface ContractType` (línea ~207). Agregar dentro:

```ts
  max_hours_per_day: number | null;
  max_hours_per_week: number | null;
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(contracts): tipo ContractType con caps de horas"
```

---

## Task 3: Engine con fallback (TDD)

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: Escribir test fallando**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("contract caps overriden global", () => {
  it("empleado con contract.max_hours_per_day=12 puede recibir un turno de 11h", () => {
    const asistencial: ContractType = {
      ...fullTime, id: "ct-asist", name: "Asistencial",
      max_hours_per_day: 12, max_hours_per_week: 48,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-asist" });
    const tpl = makeTemplate({
      id: "tpl-12h", name: "12h", start_time: "07:00", end_time: "19:00",
    });

    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-12h"] },
      [emp], [tpl], [], [],
      { maxHoursPerWeek: 40, maxHoursPerDay: 10,
        minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-12h", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [asistencial], defaultWeights,
    );

    // Con cap global 10h, sin contract caps el turno de 12h NO se asignaría.
    // Con contract.max_hours_per_day = 12 sí.
    expect(result.entries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm run test -- schedule-generator
```
Expected: FAIL — el slot no se asigna porque `slot.durationHours (12) > constraints.maxHoursPerDay (10)`.

- [ ] **Step 3: Modificar `filterCandidates`**

Buscar la línea (sección INVIOLABLES):

```ts
    if (slot.durationHours > constraints.maxHoursPerDay) continue;
```

Reemplazar con:

```ts
    const contract = ctx.contractTypes.get(employee.contract_type_id);
    const dayCap = contract?.max_hours_per_day ?? constraints.maxHoursPerDay;
    if (slot.durationHours > dayCap) continue;
```

NOTA: como `contract` también se usa más abajo en la sección CONTRACTUAL, mover la declaración una sola vez al principio (después del bloque assignedDates). Si ya estaba declarado abajo, eliminar la duplicación.

En la sección CONTRACTUAL donde se calcula `effectiveWeekly`, cambiar:

```ts
    const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
    const effectiveWeekly = Math.min(globalCap, contractCap, employee.max_hours_per_week);
```

a:

```ts
    const weekHardCap = contract?.max_hours_per_week
      ?? contract?.target_hours_per_week
      ?? Number.POSITIVE_INFINITY;
    const effectiveWeekly = Math.min(constraints.maxHoursPerWeek, weekHardCap, employee.max_hours_per_week);
```

- [ ] **Step 4: Modificar `computeExceededCaps`**

Misma lógica que arriba — cambiar el cálculo de `effectiveWeekly` para usar `max_hours_per_week ?? target_hours_per_week ?? Infinity`.

- [ ] **Step 5: Modificar `scoreCandidate` (la penalización por saturación)**

En el bloque agregado en T3 anterior (penalización ≥85%):

```ts
  const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
  const effectiveWeekly = Math.min(
    ctx.constraints.maxHoursPerWeek,
    contractCap,
    employee.max_hours_per_week,
  );
```

Cambiar `contractCap` a:

```ts
  const contractCap = contract?.max_hours_per_week
    ?? contract?.target_hours_per_week
    ?? Number.POSITIVE_INFINITY;
```

- [ ] **Step 6: PASS**

```bash
npm run test -- schedule-generator
```
Expected: PASS, 258 tests total (257 + 1 nuevo).

- [ ] **Step 7: Build + suite**

```bash
npm run build && npm run test
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(schedule): caps contractuales (day/week) con fallback al global"
```

---

## Task 4: Form `/contract-types`

**Files:**
- Modify: `src/app/(authenticated)/contract-types/page.tsx`

- [ ] **Step 1: Leer la página**

Identificar el form de creación/edición de contract_types. Probablemente usa shadcn Input + Label + Button.

- [ ] **Step 2: Agregar 2 inputs**

Agregar después de `target_hours_per_week`:

```tsx
<FormField label="Máximo horas por día" >
  <Input
    type="number" min={1} max={24}
    value={form.max_hours_per_day ?? ""}
    onChange={(e) => setForm({ ...form, max_hours_per_day: e.target.value ? Number(e.target.value) : null })}
    placeholder="Vacío = usar global"
  />
  <p className="text-xs text-muted-foreground">Vacío para usar el límite global de Restricciones laborales.</p>
</FormField>

<FormField label="Máximo horas por semana">
  <Input
    type="number" min={1} max={84}
    value={form.max_hours_per_week ?? ""}
    onChange={(e) => setForm({ ...form, max_hours_per_week: e.target.value ? Number(e.target.value) : null })}
    placeholder="Vacío = usar global"
  />
  <p className="text-xs text-muted-foreground">Cap duro semanal. Distinto del target (aspiracional).</p>
</FormField>
```

(Adaptar nombres de variables locales y campos según el patrón del archivo existente.)

- [ ] **Step 3: Asegurar que el INSERT/UPDATE incluya los campos**

Donde el form persiste a Supabase, incluir `max_hours_per_day` y `max_hours_per_week` en el payload.

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(authenticated\)/contract-types/page.tsx
git commit -m "feat(contracts): form de /contract-types con max_hours_per_day y per_week"
```

---

## Task 5: Nota en `/settings`

**Files:**
- Modify: `src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Encontrar la sección de "Restricciones laborales"**

Donde están los inputs `maxHoursPerDay` y `maxHoursPerWeek`. Agregar una nota debajo:

```tsx
<p className="text-xs text-muted-foreground">
  Estos valores se aplican como default. Cada tipo de contrato puede sobrescribirlos en{" "}
  <Link href="/contract-types" className="underline">/contract-types</Link>.
</p>
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(authenticated\)/settings/page.tsx
git commit -m "feat(settings): nota sobre caps por contract_type"
```

---

## Task 6: CLAUDE.md + push + smoke

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección "Equity Model" donde habla de `contract_types`, agregar mención:

> Los `contract_types` también pueden definir `max_hours_per_day` y `max_hours_per_week` (caps duros, distintos de `target_hours_per_week` que es aspiracional). Si null, caen al global de `labor_constraints`. Caso de uso: personal asistencial (12h/día) vs administrativo (10h/día).

- [ ] **Step 2: Build + suite final**

```bash
npm run build && npm run test
```
Expected: build clean, 258 tests.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: caps contractuales en CLAUDE.md"
git push origin main
```

- [ ] **Step 4: Smoke local o Vercel**

1. `/contract-types` → editar "Full-time" → poner `max_hours_per_day = 12`. Guardar.
2. `/schedule` → si hay un turno de 11h en plantillas, regenerar; verificar que se asigna a un empleado con ese contract.
3. Validar BD: `SELECT name, max_hours_per_day, max_hours_per_week FROM contract_types;` muestra los nuevos valores.

---

## Self-review

- Spec §2-§7 todo cubierto en tasks 1-6.
- Tipos consistentes (`max_hours_per_day` y `max_hours_per_week` en types + form + engine).
- TDD para el cambio del engine.
- 6 tasks chicos, ~1.5 hrs de trabajo.
