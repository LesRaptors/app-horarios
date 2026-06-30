# Lote "Contratos y disponibilidad por empleado" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir disponibilidad de festivos/domingos/noches por empleado, traducir los tipos de contrato al español, exigir tipo de contrato al crear empleados, y sembrar contratos base en español a organizaciones nuevas.

**Architecture:** 3 migraciones SQL (traducción de datos; UNIQUE per-org + seed-on-org-create; columnas de disponibilidad en `profiles`), un cambio puntual en el motor de scheduling para que el empleado pise al contrato, y cambios de UI/API en la página de empleados. Sigue los patrones existentes del proyecto.

**Tech Stack:** Next.js 14 App Router, Supabase/Postgres + RLS, TypeScript, Vitest, shadcn/ui (Radix Select).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-29-contracts-availability-design.md`.
- UI en **español**, acentos correctos. Sin emojis (usar texto/lucide).
- Migraciones: header en español, `BEGIN; … COMMIT;`. Siguiente número correlativo (la más alta hoy es `056`).
- `day_of_week` convención JS (no aplica aquí). Snake_case en SQL.
- Tras cada migración aplicada: regenerar `src/lib/supabase/database.types.ts` (skill `/regen-types`).
- Aplicar migraciones vía Supabase MCP `apply_migration` (project `ugkvuinkynvtuiutwlkd`) tras revisión de `migration-reviewer`. El usuario pre-autoriza apply a Cloud (no hay entorno local).
- Traducciones fijas: `Full-time → Tiempo completo`, `Part-time → Medio tiempo`, `Asistencial Full-time → Asistencial tiempo completo`. No tocar `Fin de semana` ni `Sin definir`.
- Commits terminan con: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Rama: `feature/contracts-availability` (ya creada; spec ya committeado en `13b9c01`).

## File Structure

- `supabase/migrations/057_translate_contract_names.sql` — UPDATE de nombres (Pieza 1).
- `supabase/migrations/058_contract_types_per_org_seed.sql` — UNIQUE per-org + `seed_default_contract_types()` + trigger (Pieza 4).
- `supabase/migrations/059_employee_availability_overrides.sql` — 3 columnas nullable en `profiles` (Pieza 3).
- `supabase/tests/058_seed_contract_types.sql` — test SQL (BEGIN/ROLLBACK) del seed.
- `src/lib/schedule-generator.ts:286-288` — motor lee `emp.available_X ?? contract.available_X`.
- `src/lib/types.ts:45-66` — interfaz `Profile` gana 3 campos opcionales.
- `src/lib/schedule-generator.test.ts` — test del override.
- `src/app/api/employees/demo/route.ts`, `src/app/api/employees/invite/route.ts` — aceptan `contract_type_id`.
- `src/app/(authenticated)/employees/page.tsx` — selects de contrato (demo/invite/editar) + sección "Disponibilidad" en editar.

---

### Task 1: Migración 057 — Traducir nombres de contratos (Pieza 1)

**Files:**
- Create: `supabase/migrations/057_translate_contract_names.sql`

**Interfaces:**
- Consumes: tabla `contract_types` existente.
- Produces: filas con nombres en español. Ningún consumidor de código depende de los nombres viejos (el badge usa `name === "Sin definir"`, que no se toca).

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/057_translate_contract_names.sql`:

```sql
-- Migration 057: Traducir nombres de tipos de contrato al español
--
-- ¿Qué hace?
--   - Renombra los tipos de contrato sembrados en inglés (migración 014).
--   - No toca 'Fin de semana' ni 'Sin definir' (ya en español; 'Sin definir'
--     se compara por nombre en la UI y debe permanecer estable).
--
-- ¿Por qué?
--   La app es para mercado latinoamericano; no debe mostrar inglés.

BEGIN;

UPDATE contract_types SET name = 'Tiempo completo'            WHERE name = 'Full-time';
UPDATE contract_types SET name = 'Medio tiempo'               WHERE name = 'Part-time';
UPDATE contract_types SET name = 'Asistencial tiempo completo' WHERE name = 'Asistencial Full-time';

COMMIT;
```

- [ ] **Step 2: Revisar con migration-reviewer**

Despachar el subagent `migration-reviewer` sobre `057_translate_contract_names.sql`. Resolver bloqueadores si los hay.

- [ ] **Step 3: Aplicar la migración**

Aplicar vía Supabase MCP `apply_migration` (name: `translate_contract_names`, project `ugkvuinkynvtuiutwlkd`).

- [ ] **Step 4: Verificar el resultado**

Run (Supabase MCP `execute_sql`):
```sql
select name, organization_id from contract_types order by name;
```
Expected: aparecen "Tiempo completo", "Medio tiempo", "Asistencial tiempo completo"; ya NO aparecen "Full-time"/"Part-time"/"Asistencial Full-time". "Fin de semana" y "Sin definir" intactos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/057_translate_contract_names.sql
git commit -m "feat(contracts): traduce nombres de tipos de contrato al español

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migración 058 — UNIQUE per-org + seed de contratos base (Pieza 4)

**Files:**
- Create: `supabase/migrations/058_contract_types_per_org_seed.sql`
- Create: `supabase/tests/058_seed_contract_types.sql`

**Interfaces:**
- Consumes: tablas `contract_types`, `organizations`.
- Produces: función `seed_default_contract_types(p_org_id uuid)`; trigger `trg_seed_contract_types AFTER INSERT ON organizations`; constraint `contract_types_org_name_key UNIQUE(organization_id, name)`.

- [ ] **Step 1: Escribir la migración**

Contexto de schema (verificado en Cloud): en `contract_types`, las únicas columnas `NOT NULL` sin default son `name` y `organization_id`. `weekly_hours_mode` default `'full'`, `is_healthcare` default `false`, `available_sundays/holidays/nights` default `true`, `max_sundays_per_quarter` default `6`, `max_holidays_per_quarter` default `3`. El constraint UNIQUE actual se llama `contract_types_name_key` (`UNIQUE (name)`). No hay colisiones `(organization_id, name)`.

Create `supabase/migrations/058_contract_types_per_org_seed.sql`:

```sql
-- Migration 058: contract_types per-org + seed automático en orgs nuevas
--
-- ¿Qué hace?
--   - Cambia UNIQUE(name) global -> UNIQUE(organization_id, name).
--   - Crea seed_default_contract_types(org) que siembra 5 tipos base en español.
--   - Trigger AFTER INSERT ON organizations que llama al seed para toda org nueva.
--
-- ¿Por qué?
--   Hoy las orgs nuevas nacen sin ningún tipo de contrato; el UNIQUE global
--   impedía que dos orgs tuvieran el mismo nombre.

BEGIN;

-- 1. UNIQUE per-org
ALTER TABLE contract_types DROP CONSTRAINT IF EXISTS contract_types_name_key;
ALTER TABLE contract_types
  ADD CONSTRAINT contract_types_org_name_key UNIQUE (organization_id, name);

-- 2. Función de seed (idempotente)
CREATE OR REPLACE FUNCTION seed_default_contract_types(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO contract_types
    (name, description, weekly_hours_mode, weekly_hours, is_healthcare,
     available_sundays, available_holidays, available_nights, organization_id)
  VALUES
    ('Sin definir', 'Tipo por defecto. El admin debe asignar un tipo real.',
       'full', NULL, false, true, true, true, p_org_id),
    ('Tiempo completo', 'Jornada completa (44h Ley 2101).',
       'full', NULL, false, true, true, true, p_org_id),
    ('Medio tiempo', 'Jornada parcial.',
       'partial', 24, false, true, true, true, p_org_id),
    ('Fin de semana', 'Cubre sábados y domingos.',
       'partial', 24, false, true, true, false, p_org_id),
    ('Asistencial tiempo completo', 'Personal sanitario, 12h/día.',
       'full', NULL, true, true, true, true, p_org_id)
  ON CONFLICT (organization_id, name) DO NOTHING;
END;
$$;

-- 3. Trigger: sembrar al crear una org
CREATE OR REPLACE FUNCTION trg_seed_contract_types_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_default_contract_types(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_contract_types ON organizations;
CREATE TRIGGER trg_seed_contract_types
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION trg_seed_contract_types_fn();

COMMIT;
```

- [ ] **Step 2: Escribir el test SQL (BEGIN/ROLLBACK)**

Create `supabase/tests/058_seed_contract_types.sql`:

```sql
-- Test 058: crear una org siembra 5 contratos base en español.
BEGIN;

INSERT INTO organizations (name, slug, plan, status, country)
VALUES ('Test Seed Org', 'test-seed-org-xyz', 'starter', 'trialing', 'CO');

DO $$
DECLARE
  v_org UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug = 'test-seed-org-xyz';

  SELECT count(*) INTO v_count FROM contract_types WHERE organization_id = v_org;
  ASSERT v_count = 5, format('Esperaba 5 contratos base, obtuve %s', v_count);

  ASSERT EXISTS (SELECT 1 FROM contract_types
    WHERE organization_id = v_org AND name = 'Tiempo completo'),
    'Falta Tiempo completo';
  ASSERT EXISTS (SELECT 1 FROM contract_types
    WHERE organization_id = v_org AND name = 'Fin de semana' AND available_nights = false),
    'Fin de semana debe tener available_nights = false';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Revisar con migration-reviewer**

Despachar `migration-reviewer` sobre `058_contract_types_per_org_seed.sql`. Foco: SECURITY DEFINER + search_path en ambas funciones, idempotencia del trigger, que el DROP CONSTRAINT use IF EXISTS.

- [ ] **Step 4: Correr el test SQL ANTES de aplicar (debe pasar contra el schema ya con la migración)**

La migración aún no está aplicada, así que el trigger no existe todavía. Aplicar primero (Step 5), luego correr el test.

- [ ] **Step 5: Aplicar la migración**

Supabase MCP `apply_migration` (name: `contract_types_per_org_seed`).

- [ ] **Step 6: Correr el test SQL**

Ejecutar el contenido de `supabase/tests/058_seed_contract_types.sql` vía Supabase MCP `execute_sql`.
Expected: ejecuta sin error (los `ASSERT` pasan) y hace ROLLBACK (no deja datos).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/058_contract_types_per_org_seed.sql supabase/tests/058_seed_contract_types.sql
git commit -m "feat(contracts): UNIQUE per-org + seed de contratos base en orgs nuevas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tipo de contrato obligatorio al crear empleado (Pieza 2)

**Files:**
- Modify: `src/app/api/employees/demo/route.ts`
- Modify: `src/app/api/employees/invite/route.ts`
- Modify: `src/app/(authenticated)/employees/page.tsx` (forms demo/invite/editar + handlers)

**Interfaces:**
- Consumes: estado `contracts: ContractType[]` ya cargado en `page.tsx:256/339`. `effectiveOrgId` de `useAuth`.
- Produces: endpoints que aceptan `contract_type_id` en el body y lo validan/persisten.

- [ ] **Step 1: API demo — aceptar y validar `contract_type_id`**

Modify `src/app/api/employees/demo/route.ts`:
- En el destructuring del body (`~32-39`) agregar `contract_type_id`:

```ts
    const {
      first_name,
      last_name,
      role,
      position_id,
      location_id,
      max_hours_per_week,
      contract_type_id,
    } = body;
```

- Agregar validación de requerido tras la validación de nombre (`~47`):

```ts
    if (!contract_type_id) {
      return NextResponse.json(
        { error: "El tipo de contrato es obligatorio" },
        { status: 400 }
      );
    }
```

- Validar pertenencia al org (junto a las otras `assertSameOrg`, `~83-84`):

```ts
      await assertSameOrg(adminSupabase, callerOrg, contract_type_id, "contract_types");
```

- Incluir en `insertData` (`~92-104`):

```ts
      contract_type_id,
```

- [ ] **Step 2: API invite — aceptar y validar `contract_type_id`**

Modify `src/app/api/employees/invite/route.ts`:
- Destructuring del body (`~32-41`) agregar `contract_type_id`.
- Tras resolver `callerOrg` y antes del invite, validar requerido:

```ts
    if (!contract_type_id) {
      return NextResponse.json(
        { error: "El tipo de contrato es obligatorio" },
        { status: 400 }
      );
    }
```

- Validar pertenencia junto a las otras `assertSameOrg` (`~66-67`):

```ts
      await assertSameOrg(adminSupabase, callerOrg, contract_type_id, "contract_types");
```

- Setearlo SIEMPRE en `updateData` (`~138-145`) — el profile lo crea el trigger con el default, así que aquí lo sobreescribimos:

```ts
      const updateData: Record<string, unknown> = { contract_type_id };
      if (phone) updateData.phone = phone;
      // … resto igual
```

- [ ] **Step 3: UI — agregar `contract_type_id` a los 3 form states**

Modify `src/app/(authenticated)/employees/page.tsx`:
- En `InviteForm` (`~102-112`) y `emptyInviteForm` (`~114-124`): agregar `contract_type_id: string` (default `""`).
- En el `DemoForm`/state del demo (`~228-236`): agregar `contract_type_id: ""`.
- En `EditForm` (`~129-148`) y su `emptyEditForm`: agregar `contract_type_id: string`.
- Al abrir el dialog de editar (donde se popula `editForm` desde la fila), setear `contract_type_id: emp.contract_type_id`.

- [ ] **Step 4: UI — agregar el `Select` de contrato a los 3 dialogs**

En cada dialog (Crear demo `~1681-1872`, Invitar `~1044-1260`, Editar `~1265-1676`), agregar un bloque `Select` siguiendo el patrón del `Select` de Sede ya presente. Ejemplo para el demo (replicar en invite/editar con su form state):

```tsx
<div>
  <label htmlFor="demo-contract" className="text-sm font-medium">
    Tipo de contrato <span className="text-destructive">*</span>
  </label>
  <Select
    value={demoForm.contract_type_id}
    onValueChange={(v) => setDemoForm({ ...demoForm, contract_type_id: v })}
  >
    <SelectTrigger id="demo-contract">
      <SelectValue placeholder="Seleccionar tipo de contrato" />
    </SelectTrigger>
    <SelectContent>
      {contracts.map((c) => (
        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

En el dialog de editar, usar `editForm`; en invitar, `inviteForm`.

- [ ] **Step 5: UI — validar requerido en los handlers y enviar al API**

- `handleDemoCreate` (`~639-659`): agregar guard al inicio y mandar `contract_type_id`:

```ts
    if (!demoForm.contract_type_id) {
      toast.error("Selecciona el tipo de contrato");
      return;
    }
```
y en el body del fetch agregar `contract_type_id: demoForm.contract_type_id`.

- `handleInvite` (handler del invite): mismo guard sobre `inviteForm.contract_type_id` + agregar al body del fetch.
- `handleEdit`: en el `update` del profile principal, incluir `contract_type_id: editForm.contract_type_id` (este dialog ahora también puede cambiar el contrato).

- [ ] **Step 6: Verificar typecheck + build local de la página**

Run: `npm run typecheck`
Expected: exit 0 (sin errores de tipo nuevos).

- [ ] **Step 7: Revisar con security-reviewer**

Despachar `security-reviewer` sobre los dos endpoints modificados. Foco: validación de pertenencia del `contract_type_id` al org efectivo (no cross-tenant), requerido server-side (no confiar solo en la UI).

- [ ] **Step 8: Commit**

```bash
git add src/app/api/employees/demo/route.ts src/app/api/employees/invite/route.ts "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(employees): tipo de contrato obligatorio al crear/invitar/editar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migración 059 + tipos + motor — override de disponibilidad (Pieza 3, backend)

**Files:**
- Create: `supabase/migrations/059_employee_availability_overrides.sql`
- Modify: `src/lib/types.ts:45-66` (interfaz `Profile`)
- Modify: `src/lib/schedule-generator.ts:286-288`
- Modify: `src/lib/schedule-generator.test.ts`

**Interfaces:**
- Consumes: `profiles`, objeto `emp` (Profile) y `contract` en `filterCandidates`.
- Produces: `profiles.available_sundays/holidays/nights` (BOOLEAN NULL); el motor resuelve `emp.available_X ?? contract.available_X`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/059_employee_availability_overrides.sql`:

```sql
-- Migration 059: override de disponibilidad por empleado
--
-- ¿Qué hace?
--   - Agrega available_sundays/holidays/nights (BOOLEAN NULL) a profiles.
--   - NULL = hereda del contract_type; true/false = override del empleado.
--
-- ¿Por qué?
--   Hoy la disponibilidad solo vive en contract_types; no se puede expresar
--   "este empleado puntual no trabaja festivos" sin crear un contrato dedicado.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS available_sundays  BOOLEAN,
  ADD COLUMN IF NOT EXISTS available_holidays BOOLEAN,
  ADD COLUMN IF NOT EXISTS available_nights   BOOLEAN;

COMMENT ON COLUMN profiles.available_holidays IS
  'NULL = hereda del contract_type; true/false = override individual.';

COMMIT;
```

(No requiere cambios de RLS: `profiles_update_admin` ya permite a admin/manager actualizar cualquier columna; `profiles_update_own` sigue restringido a `phone`.)

- [ ] **Step 2: Revisar con migration-reviewer y aplicar**

Despachar `migration-reviewer`. Luego aplicar vía `apply_migration` (name: `employee_availability_overrides`).

- [ ] **Step 3: Regenerar tipos**

Ejecutar skill `/regen-types` (regenera `src/lib/supabase/database.types.ts` desde Cloud).

- [ ] **Step 4: Actualizar la interfaz `Profile`**

Modify `src/lib/types.ts` — en `Profile` (`~45-66`), tras `is_floater: boolean;` (`~58`) agregar (opcionales para no romper mocks existentes):

```ts
  available_sundays?: boolean | null;
  available_holidays?: boolean | null;
  available_nights?: boolean | null;
```

- [ ] **Step 5: Escribir el test del motor (TDD — primero el test)**

Modify `src/lib/schedule-generator.test.ts` — agregar un test que verifique el override. Usa el helper `makeEmployee` existente (acepta `Partial<ProfileWithPositions>`):

```ts
it("override de empleado: available_holidays=false impide asignar en festivo aunque el contrato lo permita", () => {
  const holidays = [{ id: "h1", date: "2026-04-09", name: "Test", location_id: null, created_at: "" }];
  const emp = makeEmployee({ id: "e-no-fest", available_holidays: false });
  const tpl = makeTemplate({ id: "tpl-m" });

  const result = generateSchedule(
    { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
      shiftTemplateIds: [tpl.id], employeeIds: [emp.id] },
    [emp], [tpl],
    [{ id: "sr", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
       day_of_week: 4, required_count: 1, created_at: "", updated_at: "" }],
    { /* contractTypes: el contrato de emp tiene available_holidays=true por default */ } as never,
    holidays,
  );

  // 2026-04-09 es jueves y festivo (Jueves Santo). El empleado no debe estar asignado ese día.
  const onHoliday = result.entries.filter(
    (e) => e.employee_id === "e-no-fest" && e.date === "2026-04-09"
  );
  expect(onHoliday.length).toBe(0);
});
```

NOTA para el implementador: ajustar la firma de `generateSchedule` y la construcción de `contractTypes` a la forma real usada en los otros tests del archivo (revisar un test existente de `schedule-generator.test.ts` para copiar la forma exacta de `AutoGenConfig` y del mapa de contratos). El contrato del empleado debe tener `available_holidays: true` para probar que el override (false a nivel empleado) gana.

- [ ] **Step 6: Correr el test — debe FALLAR**

Run: `npm run test -- schedule-generator`
Expected: el nuevo test FALLA (el motor aún lee solo `contract.available_holidays`, que es true, así que asigna en festivo).

- [ ] **Step 7: Implementar el override en el motor**

Modify `src/lib/schedule-generator.ts:285-288` — reemplazar el bloque:

```ts
    // INVIOLABLES: disponibilidad (override empleado > contract)
    const availSundays  = emp.available_sundays  ?? contract?.available_sundays;
    const availHolidays = emp.available_holidays ?? contract?.available_holidays;
    const availNights   = emp.available_nights   ?? contract?.available_nights;
    if (availSundays  === false && dayOfWeek(slot.date) === 0) continue;
    if (availHolidays === false && isHoliday(slot.date, ctx.locationId, ctx.holidays)) continue;
    if (availNights   === false && isNightShift(slot.template)) continue;
```

- [ ] **Step 8: Correr el test — debe PASAR**

Run: `npm run test -- schedule-generator`
Expected: PASS. Y `npm run test` completo sigue verde (504+1 nuevos).

- [ ] **Step 9: Revisar con schedule-algorithm-reviewer**

Despachar `schedule-algorithm-reviewer` (se tocó `schedule-generator.ts`). Verificar que el override respeta la semántica inviolable y que `?? ` preserva el comportamiento cuando el empleado es `NULL`.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/059_employee_availability_overrides.sql src/lib/supabase/database.types.ts src/lib/types.ts src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(scheduling): override de disponibilidad festivos/domingos/noches por empleado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — sección "Disponibilidad" en editar empleado (Pieza 3, frontend)

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx` (EditForm + dialog editar + handleEdit)

**Interfaces:**
- Consumes: `EditForm` (de Task 3), `editForm.available_*`, el `update` del profile en `handleEdit`.
- Produces: persistencia de los 3 overrides desde el dialog de editar.

- [ ] **Step 1: Agregar los 3 campos al EditForm state**

Modify `page.tsx` — en `EditForm` (`~129-148`) agregar:

```ts
  available_sundays: boolean | null;
  available_holidays: boolean | null;
  available_nights: boolean | null;
```

En `emptyEditForm` y al popular el form al abrir editar, setear desde el empleado:

```ts
  available_sundays: emp.available_sundays ?? null,
  available_holidays: emp.available_holidays ?? null,
  available_nights: emp.available_nights ?? null,
```

- [ ] **Step 2: Agregar la sección "Disponibilidad" al dialog de editar**

En el dialog de editar, cerca de "Reglas de descanso individuales" (`~1519-1533`), agregar una sección con 3 selects tri-estado. Helper de mapeo: el valor del Select es un string `"inherit" | "yes" | "no"` que mapea a `null | true | false`.

```tsx
<div className="space-y-3">
  <p className="text-sm font-medium">Disponibilidad</p>
  <p className="text-xs text-muted-foreground">
    Pisa la disponibilidad del tipo de contrato para este empleado.
  </p>
  {([
    ["available_sundays", "Domingos"],
    ["available_holidays", "Festivos"],
    ["available_nights", "Noches"],
  ] as const).map(([key, label]) => {
    const current = editForm[key];
    const asStr = current === null || current === undefined ? "inherit" : current ? "yes" : "no";
    return (
      <div key={key} className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <Select
          value={asStr}
          onValueChange={(v) =>
            setEditForm({
              ...editForm,
              [key]: v === "inherit" ? null : v === "yes",
            })
          }
        >
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">Hereda del contrato</SelectItem>
            <SelectItem value="yes">Disponible</SelectItem>
            <SelectItem value="no">No disponible</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  })}
</div>
```

- [ ] **Step 3: Persistir en handleEdit**

En `handleEdit`, en el `update` del profile principal, incluir:

```ts
      available_sundays: editForm.available_sundays,
      available_holidays: editForm.available_holidays,
      available_nights: editForm.available_nights,
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(employees): sección Disponibilidad (override por empleado) en editar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Validación final

**Files:** ninguno nuevo — valida el lote.

- [ ] **Step 1: Suite y typecheck verdes**

Run: `npm run test` → 504 previos + el nuevo del override, todos verdes.
Run: `npm run typecheck` → exit 0.

- [ ] **Step 2: Verificar la traducción y el seed en Cloud**

Run (Supabase MCP `execute_sql`):
```sql
select name from contract_types where organization_id = '00000000-0000-0000-0000-000000000001' order by name;
```
Expected: nombres en español (Les Raptors).

- [ ] **Step 3: `/code-review` del diff de la rama**

Correr `/code-review` sobre `main...feature/contracts-availability`. Foco: endpoints (validación cross-tenant del `contract_type_id`), el `??` del motor, la migración del trigger, y la UI tri-estado. Arreglar bloqueadores.

- [ ] **Step 4: Commit de fixes (si `/code-review` encontró algo)**

```bash
git add -A
git commit -m "fix: ajustes de code-review en lote contratos/disponibilidad

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review del plan

**Spec coverage:**
- Pieza 1 (traducir) → Task 1 ✓
- Pieza 2 (contrato obligatorio: endpoints + UI demo/invite/editar) → Task 3 ✓
- Pieza 3 (override disponibilidad: migración + tipos + motor + test + UI) → Tasks 4 y 5 ✓
- Pieza 4 (UNIQUE per-org + seed + trigger) → Task 2 ✓
- Validación (reviewers + /code-review + typecheck/test) → en cada task + Task 6 ✓
- Follow-up del default cross-tenant: documentado en spec, fuera de alcance (no task) ✓

**Placeholder scan:** el código de migraciones, motor y endpoints es literal. El único punto con "ajustar a la forma real" es el test del motor (Step 5 de Task 4), donde se indica copiar la firma exacta de `generateSchedule`/`AutoGenConfig` de un test vecino — es una instrucción de fidelidad al código existente, no un placeholder de lógica.

**Type consistency:** `available_sundays/holidays/nights` (`boolean | null`) consistentes entre migración 059, `Profile`, motor (`?? `), `EditForm` y handlers. Nombres de tareas, archivos y migraciones (057/058/059) coherentes.
