# Supernumerario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Empleado floater (`is_floater=true`) que el motor usa solo cuando los primarios saturan, vía un nuevo Pase 1.5 entre los pases existentes.

**Architecture:** Mig 035 agrega `is_floater` a profiles. Motor extendido con Pase 1.5 que usa floaters. Form de empleados con switch + multi-pick de posiciones secundarias.

**Tech Stack:** Postgres, TypeScript, shadcn (Switch, Checkbox), Vitest. Sin nuevas dependencias.

---

## Task 1: Mig 035 + tipo TS

**Files:**
- Create: `supabase/migrations/035_profile_is_floater.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Mig SQL**

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_floater BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_floater IS
  'Empleado supernumerario: el motor lo usa solo cuando primarios saturan. Sus secondary_positions definen qué cubre.';
```

Aplicar via `mcp__plugin_supabase_supabase__apply_migration` (project_id `ugkvuinkynvtuiutwlkd`, name `035_profile_is_floater`).

Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_floater';` → 1 row.

- [ ] **Step 2: Tipo TS**

En `src/lib/types.ts`, agregar `is_floater: boolean` al `Profile` interface. También a `ProfileWithPositions` si es relevante para el motor.

- [ ] **Step 3: Build + tests**

`npm run build && npm run test` → 260 tests passing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/035_profile_is_floater.sql src/lib/types.ts
git commit -m "feat(profile): mig 035 + tipo — is_floater para supernumerarios"
```

---

## Task 2: Motor con Pase 1.5 (TDD)

**Files:**
- Modify: `src/lib/schedule-generator.ts`
- Modify: `src/lib/schedule-generator.test.ts`

- [ ] **Step 1: 2 tests nuevos**

Append a `src/lib/schedule-generator.test.ts`:

```ts
describe("supernumerario (floater)", () => {
  it("floater no se usa si hay primario disponible", () => {
    const primary = makeEmployee({ id: "e-pri", position_id: "pos-1", is_floater: false });
    const floater = makeEmployee({
      id: "e-flo",
      position_id: "pos-other",
      is_floater: true,
      secondary_positions: [{ position_id: "pos-1" }],
    });
    const tpl = makeTemplate({ id: "tpl-m" });

    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e-pri", "e-flo"], shiftTemplateIds: ["tpl-m"] },
      [primary, floater], [tpl], [], [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const assigned = result.entries[0];
    expect(assigned?.employee_id).toBe("e-pri");
  });

  it("floater se usa cuando primario está en cap inviolable", () => {
    const primary = makeEmployee({ id: "e-pri", position_id: "pos-1" });
    const floater = makeEmployee({
      id: "e-flo",
      position_id: "pos-other",
      is_floater: true,
      secondary_positions: [{ position_id: "pos-1" }],
    });
    const tpl = makeTemplate({ id: "tpl-m" });

    // Primario con 6 días consecutivos previos (lun-sáb 30 mar - 4 abr).
    const existingEntries: ScheduleEntry[] = [
      "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "s1", employee_id: "e-pri", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none",
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));

    // Demand: domingo 5 abril (día 7 consecutivo para primary → cap inviolable).
    const result = generateSchedule(
      { scheduleId: "s1", year: 2026, month: 3,
        employeeIds: ["e-pri", "e-flo"], shiftTemplateIds: ["tpl-m"] },
      [primary, floater], [tpl], existingEntries, [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 0, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const assigned = result.entries.find((e) => e.date === "2026-04-05");
    expect(assigned?.employee_id).toBe("e-flo");
  });
});
```

- [ ] **Step 2: FAIL**

`npm run test -- schedule-generator` → FAIL.

- [ ] **Step 3: Modificar `positionEligibility`**

Buscar dónde se construye el map de eligibilidad por posición. Hay que **separar primary vs floater** en la estructura. Hoy es `{ primary: string[]; secondary: string[] }`. Cambiar a `{ primary: string[]; floater: string[] }` (donde floater = empleados is_floater=true cuya posición secundaria coincide).

Construcción:

```ts
for (const emp of selectedEmployees) {
  if (emp.is_floater) {
    // El floater se considera "floater" para todas sus secondary_positions.
    for (const sp of emp.secondary_positions ?? []) {
      const e = positionEligibility.get(sp.position_id) ?? { primary: [], floater: [] };
      e.floater.push(emp.id);
      positionEligibility.set(sp.position_id, e);
    }
    // Si también tiene una position_id primaria distinta, NO entra como primary
    // (un floater nunca es primary, su rol es ser comodín).
  } else {
    // Empleado regular: primary por su position_id, y también para secondary_positions.
    const e = positionEligibility.get(emp.position_id) ?? { primary: [], floater: [] };
    e.primary.push(emp.id);
    positionEligibility.set(emp.position_id, e);
    for (const sp of emp.secondary_positions ?? []) {
      const e2 = positionEligibility.get(sp.position_id) ?? { primary: [], floater: [] };
      // Las secondaries de un empleado NO floater siguen contando como primary
      // (su comportamiento previo).
      e2.primary.push(emp.id);
      positionEligibility.set(sp.position_id, e2);
    }
  }
}
```

NOTA: si existía `e.secondary` (string[]), el cambio es renombrarlo o simplemente fusionarlo con primary cuando no sea floater. Verificar el código actual y adaptar.

- [ ] **Step 4: 3 pases en el loop principal**

En `generateSchedule`, donde está el loop principal sobre `demandSlots`:

```ts
for (const slot of demandSlots) {
  const eligibility = positionEligibility.get(slot.positionId);
  if (!eligibility || (eligibility.primary.length === 0 && eligibility.floater.length === 0)) {
    warnings.push({ kind: "no_employees_in_position", ... });
    continue;
  }

  // Pase 1: solo primarios, strict.
  let chosen: string | null = null;
  let overtimeCaps: CapExcessKind[] = [];

  if (eligibility.primary.length > 0) {
    const pass1 = filterCandidates(eligibility.primary, slot, ..., false);
    chosen = pickBestCandidate(pass1, ...);
  }

  // Pase 1.5: floaters strict, solo si Pase 1 falló.
  if (!chosen && eligibility.floater.length > 0) {
    const pass15 = filterCandidates(eligibility.floater, slot, ..., false);
    chosen = pickBestCandidate(pass15, ...);
  }

  // Pase 2: todos (primarios + floaters), relaxed.
  if (!chosen) {
    const allCandidates = [...eligibility.primary, ...eligibility.floater];
    const pass2 = filterCandidates(allCandidates, slot, ..., true);
    chosen = pickBestCandidate(pass2, ...);
    if (chosen) {
      overtimeCaps = computeExceededCaps(...);
    }
  }

  // ... resto sigue igual (warning si !chosen, persist entry, update tracker)
}
```

- [ ] **Step 5: PASS**

`npm run test -- schedule-generator` → PASS, 262 tests total.

- [ ] **Step 6: Build + suite**

`npm run build && npm run test`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts
git commit -m "feat(schedule): Pase 1.5 floater — supernumerario solo cuando primarios saturan"
```

---

## Task 3: Form de empleados con switch + multi-pick

**Files:**
- Modify: `src/components/employees/employee-form.tsx` (o el archivo que sea el form)
- Modify: `src/app/(authenticated)/employees/page.tsx` (persistencia)

- [ ] **Step 1: Leer el form actual**

Identificar el componente form. Identificar cómo persiste hoy (campos del Profile).

- [ ] **Step 2: Agregar al form**

```tsx
{/* Después de los campos básicos (nombre, posición primaria, contrato) */}
<FormField label="Supernumerario">
  <div className="flex items-center gap-2">
    <Switch
      checked={form.is_floater}
      onCheckedChange={(v) => setForm({ ...form, is_floater: v, floater_positions: v ? form.floater_positions : [] })}
    />
    <span className="text-sm">Cubre múltiples posiciones</span>
  </div>
  <p className="text-xs text-muted-foreground">
    Se asigna solo cuando los empleados primarios no alcanzan.
  </p>
</FormField>

{form.is_floater && (
  <FormField label="Posiciones que puede cubrir">
    {/* positions agrupadas por departamento */}
    {departmentGroups.map((dep) => (
      <div key={dep.id} className="border rounded-md p-2 mb-2">
        <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
          {dep.name}
        </p>
        {dep.positions.map((p) => {
          // Excluir la position primaria — es default, no se selecciona.
          if (p.id === form.position_id) return null;
          return (
            <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <Checkbox
                checked={form.floater_positions.includes(p.id)}
                onCheckedChange={(v) => {
                  if (v) {
                    setForm({ ...form, floater_positions: [...form.floater_positions, p.id] });
                  } else {
                    setForm({ ...form, floater_positions: form.floater_positions.filter(id => id !== p.id) });
                  }
                }}
              />
              {p.name}
            </label>
          );
        })}
      </div>
    ))}
  </FormField>
)}
```

NOTA: necesitás cargar las posiciones agrupadas por departamento. Si el form recibe `positions: Position[]` y cada `position.department`, agrupás localmente.

- [ ] **Step 3: Persistencia**

Al guardar:
1. UPDATE/INSERT en `profiles` con `is_floater = form.is_floater`.
2. DELETE existentes en `employee_secondary_positions WHERE employee_id = X`.
3. Si is_floater Y `floater_positions.length > 0`: INSERT bulk en `employee_secondary_positions`.

Si `is_floater = false` se borran las secondary_positions (porque ya no son floater). NOTA: si en el futuro las "secundarias" se usan para algo más que floater, esta lógica habría que afinarla. Por ahora todo lo que está en `employee_secondary_positions` se considera "posiciones que cubre como floater" — coherente.

- [ ] **Step 4: Build**

`npm run build`. Si falla por instalación de Switch/Checkbox, instalar:

```bash
npx shadcn@latest add switch checkbox
```

- [ ] **Step 5: Commit**

```bash
git add src/components/employees src/app/\(authenticated\)/employees/page.tsx
git commit -m "feat(employees): switch supernumerario + multi-pick de posiciones a cubrir"
```

---

## Task 4: Badge en tabla de empleados

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx` (o donde se renderiza la tabla)

- [ ] **Step 1: Agregar badge**

En la columna del nombre del empleado, si `employee.is_floater`:

```tsx
{employee.is_floater && (
  <Badge variant="outline" className="ml-2 text-xs">Supernumerario</Badge>
)}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/\(authenticated\)/employees/page.tsx
git commit -m "feat(employees): badge Supernumerario en tabla"
```

---

## Task 5: CLAUDE.md + push + smoke

- [ ] **Step 1: CLAUDE.md**

Después de la sección de "Equity Model", agregar:

```markdown
### Supernumerarios (`is_floater`)

Empleados con `profiles.is_floater = true` son comodines: el motor los usa SOLO cuando los empleados primarios para una posición no pueden cubrir el slot (Pase 1.5 entre el Pase 1 strict y el Pase 2 extras). Sus posiciones cubribles se definen en `employee_secondary_positions`. Esto reduce extras forzados sin sobrecargar al floater. Form en `/employees` permite marcar el switch + seleccionar posiciones agrupadas por departamento.
```

- [ ] **Step 2: Build + suite + push**

```bash
npm run build && npm run test
git add CLAUDE.md
git commit -m "docs: supernumerarios en CLAUDE.md"
git push origin main
```

- [ ] **Step 3: Smoke**

1. `/employees` → editar Sebastian Sotelo (Coordinador de Compras, solo 1 turno) → marcar Supernumerario + cubrir [Aux. Farmacia, Aux. Recepción] → guardar.
2. BD: `SELECT first_name, is_floater FROM profiles WHERE first_name='Sebastian';` → `is_floater=true`. `SELECT * FROM employee_secondary_positions WHERE employee_id=...;` → 2 rows.
3. `/employees` → ver badge "Supernumerario" en su fila.
4. `/schedule` → re-auto-generar abril 2026 → verificar que Sebastian solo cubre slots cuando los primarios fallan (en lugar de extras forzados).
5. Validar en `/equidad` que la cobertura sin extras subió.

---

## Self-review

- Spec §2-§7 cubierto.
- Tipos consistentes.
- TDD para 2 tests del motor.
- Mig deja `employee_secondary_positions` sin tocar (ya existe).
- Smoke valida el flujo completo.
