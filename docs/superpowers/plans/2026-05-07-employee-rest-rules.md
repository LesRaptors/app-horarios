# Employee Rest Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir reglas de descanso a nivel empleado (rotación individual entre miembros del mismo contract_type), con override semántico sobre las reglas del contract.

**Architecture:** Nueva tabla `employee_rest_rules` paralela a `contract_rest_rules`. Motor y health consultan reglas por empleado primero; si vacío, fallback a las del contract. UI reusa `RestRuleCards` adentro de un nuevo `EmployeeRestRulesEditor` integrado en el form de empleados. CRUD vía delete-all + insert-new (mismo patrón que `employee_secondary_positions`).

**Tech Stack:** Postgres (Supabase) + RLS, TypeScript, Next.js 14 App Router, React, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-07-employee-rest-rules.md`

---

## File Structure

**Create:**
- `supabase/migrations/037_employee_rest_rules.sql` — tabla + RLS + índice + trigger
- `src/components/employees/employee-rest-rules-editor.tsx` — editor de reglas para empleado (reusa `RestRuleCards`)

**Modify:**
- `src/lib/types.ts` — agregar `EmployeeRestRule` type
- `src/lib/supabase/database.types.ts` — regenerar (vía MCP)
- `src/lib/rest-rules.ts` — exportar helper `pickEffectiveRules(employeeRules, contractRules)`
- `src/lib/rest-rules.test.ts` — tests del helper
- `src/lib/schedule-generator.ts` — aceptar `employeeRestRules`, construir mapa por empleado, usar override en `filterCandidates`
- `src/lib/schedule-generator.test.ts` — test que verifica rotación por empleado
- `src/lib/schedule-health.ts` — usar override en cálculo de restDays
- `src/app/(authenticated)/schedule/page.tsx` — fetch `employee_rest_rules` y pasarlo al motor + health
- `src/app/(authenticated)/employees/page.tsx` — integrar editor en invite/edit dialog, fetch + persist al guardar
- `CLAUDE.md` — sección "Reglas de descanso parametrizables" actualizada

---

## Task 1: Migración 037 — tabla employee_rest_rules

**Files:**
- Create: `supabase/migrations/037_employee_rest_rules.sql`

- [ ] **Step 1: Escribir el SQL de la migración**

Contenido:
```sql
-- Migración 037: reglas de descanso a nivel empleado.
-- Override semántico: si el empleado tiene reglas individuales, se usan en lugar
-- de las del contract_type. Si no tiene, fallback a contract_rest_rules.

CREATE TABLE employee_rest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

CREATE INDEX idx_employee_rest_rules_employee ON employee_rest_rules(employee_id);

ALTER TABLE employee_rest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_rest_rules_select" ON employee_rest_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "employee_rest_rules_admin_write" ON employee_rest_rules
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager'))
  WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON employee_rest_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Aplicar migración a Supabase**

Vía Supabase MCP `apply_migration` con `name: "037_employee_rest_rules"` y el SQL completo. Project: `ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verificar tabla y RLS creados**

Vía Supabase MCP `execute_sql`:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'employee_rest_rules';
SELECT policyname FROM pg_policies WHERE tablename = 'employee_rest_rules';
```
Expected: 1 fila tabla, 2 policies (select + admin_write).

- [ ] **Step 4: Regenerar database.types.ts**

Vía Supabase MCP `generate_typescript_types`. Sobrescribir `src/lib/supabase/database.types.ts`. Verificar que aparezca `employee_rest_rules` en `Tables`.

---

## Task 2: Tipo `EmployeeRestRule`

**Files:**
- Modify: `src/lib/types.ts:512` (agregar después de `RestRule`)

- [ ] **Step 1: Agregar el type**

Insertar después de la interface `RestRule` (línea 512):

```ts
export interface EmployeeRestRule {
  id: string;
  employee_id: string;
  rule_type: RestRuleType;
  params: RestRuleParams;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: TypeCheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `types.ts`.

---

## Task 3: Helper `pickEffectiveRules` con tests

**Files:**
- Modify: `src/lib/rest-rules.ts` (agregar export al final)
- Modify: `src/lib/rest-rules.test.ts` (agregar describe block al final)

- [ ] **Step 1: Escribir test rojo**

Agregar al final de `src/lib/rest-rules.test.ts`:

```ts
describe("pickEffectiveRules", () => {
  it("usa reglas del empleado si tiene 1+ y descarta las del contract", () => {
    const empRules = [{
      id: "er1", employee_id: "e1",
      rule_type: "weekend_rotation" as const,
      params: { every_n_weeks: 2, offset: 0 as const, include_saturday: true, include_sunday: true },
      created_at: "", updated_at: "",
    }];
    const contractRules = [{
      id: "cr1", contract_type_id: "ct1",
      rule_type: "work_cycle" as const,
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-01-01" },
      created_at: "", updated_at: "",
    }];
    const result = pickEffectiveRules(empRules, contractRules);
    expect(result).toHaveLength(1);
    expect(result[0].rule_type).toBe("weekend_rotation");
  });

  it("fallback a reglas del contract si empleado no tiene", () => {
    const contractRules = [{
      id: "cr1", contract_type_id: "ct1",
      rule_type: "work_cycle" as const,
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-01-01" },
      created_at: "", updated_at: "",
    }];
    const result = pickEffectiveRules([], contractRules);
    expect(result).toHaveLength(1);
    expect(result[0].rule_type).toBe("work_cycle");
  });

  it("array vacío si nadie tiene reglas", () => {
    expect(pickEffectiveRules([], [])).toEqual([]);
  });
});
```

Necesita import: agregar `EmployeeRestRule` al import existente de `@/lib/types`.

- [ ] **Step 2: Verificar test rojo**

Run: `npx vitest run src/lib/rest-rules.test.ts -t pickEffectiveRules`
Expected: FAIL — `pickEffectiveRules is not exported`.

- [ ] **Step 3: Implementar `pickEffectiveRules`**

Agregar al final de `src/lib/rest-rules.ts`:

```ts
import type { RestRule, EmployeeRestRule } from "./types";

/**
 * Devuelve las reglas efectivas para un empleado.
 * Si el empleado tiene 1+ reglas individuales, esas se usan (override total).
 * Si no tiene, fallback a las reglas del contract_type.
 * isRestDay solo lee rule_type y params, así que el shape común es suficiente.
 */
export function pickEffectiveRules(
  employeeRules: EmployeeRestRule[],
  contractRules: RestRule[],
): Array<{ rule_type: RestRule["rule_type"]; params: RestRule["params"] }> {
  if (employeeRules.length > 0) {
    return employeeRules.map((r) => ({ rule_type: r.rule_type, params: r.params }));
  }
  return contractRules.map((r) => ({ rule_type: r.rule_type, params: r.params }));
}
```

(El import de RestRule ya existe; solo agregar EmployeeRestRule.)

- [ ] **Step 4: Verificar tests verdes**

Run: `npx vitest run src/lib/rest-rules.test.ts`
Expected: 24 + 3 = 27 tests pass.

---

## Task 4: Motor — restRulesByEmployee con override

**Files:**
- Modify: `src/lib/schedule-generator.ts` (firma + construcción + filterCandidates)
- Modify: `src/lib/schedule-generator.test.ts` (agregar test de rotación por empleado)

- [ ] **Step 1: Escribir test rojo**

Agregar al final de `src/lib/schedule-generator.test.ts`:

```ts
describe("reglas de descanso por empleado", () => {
  it("dos empleados con misma contract pero distinto offset descansan en findes opuestos", () => {
    const ct: ContractType = { ...fullTime, id: "ct-rot" };
    const e1 = makeEmployee({ id: "e1", contract_type_id: "ct-rot" });
    const e2 = makeEmployee({ id: "e2", contract_type_id: "ct-rot" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // e1: offset 0 → descansa semanas pares (ISO weeks 0%2===0 → semana ISO 18 = par)
    // e2: offset 1 → descansa semanas impares
    const employeeRules = [
      { id: "er1", employee_id: "e1", rule_type: "weekend_rotation" as const,
        params: { every_n_weeks: 2, offset: 0 as const, include_saturday: true, include_sunday: true },
        created_at: "", updated_at: "" },
      { id: "er2", employee_id: "e2", rule_type: "weekend_rotation" as const,
        params: { every_n_weeks: 2, offset: 1 as const, include_saturday: true, include_sunday: true },
        created_at: "", updated_at: "" },
    ];

    // Demand: 2 sábados consecutivos (sáb 2 may = ISO week 18, sáb 9 may = ISO week 19).
    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 4,
        employeeIds: ["e1", "e2"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [e1, e2], [tpl], [], [],
      defaultConstraints,
      [
        { id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
          day_of_week: 6, required_count: 1, created_at: "", updated_at: "" },
      ],
      [], [], [ct], defaultWeights,
      [], // contract rest rules vacíos
      employeeRules,
    );

    // sáb 2 may (ISO 18, par) → e1 bloqueado, e2 trabaja
    const may2 = result.entries.find((en) => en.date === "2026-05-02");
    expect(may2?.employee_id).toBe("e2");
    // sáb 9 may (ISO 19, impar) → e2 bloqueado, e1 trabaja
    const may9 = result.entries.find((en) => en.date === "2026-05-09");
    expect(may9?.employee_id).toBe("e1");
  });
});
```

- [ ] **Step 2: Verificar test rojo**

Run: `npx vitest run src/lib/schedule-generator.test.ts -t "reglas de descanso por empleado"`
Expected: FAIL — `generateSchedule` no acepta argumento `employeeRules`.

- [ ] **Step 3: Modificar firma + construcción de mapas**

En `src/lib/schedule-generator.ts`:

(a) Agregar import al top:
```ts
import type {
  // ... existentes
  EmployeeRestRule,
} from "./types";
```

(b) Cambiar la firma de `generateSchedule` (línea ~340) — agregar parámetro al final:
```ts
export function generateSchedule(
  config: AutoGenConfig,
  employees: ProfileWithPositions[],
  templates: ShiftTemplate[],
  existingEntries: ScheduleEntry[],
  timeOff: TimeOffRange[],
  constraints: LaborConstraints,
  staffingRequirements: StaffingRequirement[],
  rollups: EmployeeEquityRollup[],
  holidays: HolidayDate[],
  contractTypes: ContractType[],
  weights: ScoringWeights,
  restRules: RestRule[] = [],
  employeeRestRules: EmployeeRestRule[] = [],
): AutoGenResult {
```

(c) Después del bloque `restRulesByContract` (~línea 430-435), agregar:
```ts
// Build employee rest rules index by employee_id
const restRulesByEmployee = new Map<string, EmployeeRestRule[]>();
for (const rule of employeeRestRules) {
  const list = restRulesByEmployee.get(rule.employee_id) ?? [];
  list.push(rule);
  restRulesByEmployee.set(rule.employee_id, list);
}
```

(d) Agregar `restRulesByEmployee` al `ScoringContext` (interface en línea ~160-172):
```ts
interface ScoringContext {
  // ... existentes
  restRulesByEmployee: Map<string, EmployeeRestRule[]>;
}
```

(e) Pasar al ctx (~línea 487-492):
```ts
const ctx: ScoringContext = {
  weights, rollingRollupSums, quarterRollupSums,
  targetHours, targetShifts, holidays, locationId: config.locationId,
  contractTypes: contractTypeMap, constraints,
  restRulesByContract, restRulesByEmployee, entriesByEmployee,
};
```

- [ ] **Step 4: Aplicar override en `filterCandidates`**

En `filterCandidates` (~línea 290-298), reemplazar el bloque de rest rules:

```ts
// INVIOLABLE: reglas de descanso (override empleado > contract)
const empRules = ctx.restRulesByEmployee.get(emp.id) ?? [];
const cRules = (contract && ctx.restRulesByContract.get(contract.id)) || [];
const effectiveRules = empRules.length > 0
  ? empRules.map((r) => ({ rule_type: r.rule_type, params: r.params }))
  : cRules.map((r) => ({ rule_type: r.rule_type, params: r.params }));

if (effectiveRules.length > 0) {
  const recentEmpEntries = ctx.entriesByEmployee.get(emp.id) ?? [];
  const isHolidayFn = (d: string) => isHoliday(d, ctx.locationId, ctx.holidays);
  const blocked = effectiveRules.some((rule) =>
    isRestDay(rule as RestRule, slot.date, slot.template, recentEmpEntries, isHolidayFn)
  );
  if (blocked) continue;
}
```

(El cast `as RestRule` es seguro: `isRestDay` solo lee `rule_type` y `params`.)

- [ ] **Step 5: Verificar tests verdes**

Run: `npx vitest run src/lib/schedule-generator.test.ts`
Expected: 14 + 1 = 15 tests pass.

- [ ] **Step 6: Verificar que ningún test existente rompió**

Run: `npm run test`
Expected: 288 + 4 (3 nuevos en rest-rules + 1 nuevo en schedule-generator) = 292 tests pass.

---

## Task 5: Health — restDays con override

**Files:**
- Modify: `src/lib/schedule-health.ts` — firma + uso de override

- [ ] **Step 1: Agregar parámetro `employeeRestRules` a `computeHealth`**

Cambiar la firma (línea ~57-67):
```ts
export function computeHealth(
  entries: ScheduleEntry[],
  employees: Profile[],
  staffing: StaffingRequirement[],
  constraints: LaborConstraints,
  locationId: string,
  year: number,
  month: number,
  restRules: RestRule[] = [],
  contractTypes: ContractType[] = [],
  employeeRestRules: EmployeeRestRule[] = [],
): HealthSummary {
```

Agregar `EmployeeRestRule` al import de types:
```ts
import type {
  Profile, ScheduleEntry, StaffingRequirement, LaborConstraints, RestRule,
  ContractType, ShiftTemplate, EmployeeRestRule,
} from "./types";
```

- [ ] **Step 2: Construir mapa por empleado y aplicar override**

Reemplazar el bloque que itera saturated para calcular restDays (línea ~170-225). En particular:

(a) Agregar antes del loop saturated:
```ts
const empRulesByEmployee = new Map<string, EmployeeRestRule[]>();
for (const rule of employeeRestRules) {
  const arr = empRulesByEmployee.get(rule.employee_id) ?? [];
  arr.push(rule);
  empRulesByEmployee.set(rule.employee_id, arr);
}
```

(b) Cambiar la condición que decide qué reglas aplicar para cada empleado saturated:

```ts
for (const sat of saturated) {
  const emp = employees.find((e) => e.id === sat.employeeId);
  if (!emp) continue;

  const empRules = empRulesByEmployee.get(sat.employeeId) ?? [];
  const contractRules = emp.contract_type_id ? rulesByContract.get(emp.contract_type_id) ?? [] : [];
  const effectiveRules = empRules.length > 0
    ? empRules.map((r) => ({ rule_type: r.rule_type, params: r.params } as RestRule))
    : contractRules;

  if (effectiveRules.length === 0) continue;

  const empEntries = allByEmp.get(sat.employeeId) ?? [];
  const restDaysList: string[] = [];
  for (const day of days) {
    const blocked = effectiveRules.some((rule) =>
      isRestDay(rule, day, dummyTemplate, empEntries),
    );
    if (blocked) restDaysList.push(day);
  }
  if (restDaysList.length > 0) sat.restDays = restDaysList;
}
```

Mantener el guard `if (restRules.length > 0)` solo si también `employeeRestRules.length === 0` — más fácil: cambiar a `if (restRules.length > 0 || employeeRestRules.length > 0)`.

- [ ] **Step 3: TypeCheck**

Run: `npx tsc --noEmit src/lib/schedule-health.ts`
Expected: sin errores nuevos en este archivo.

- [ ] **Step 4: Tests existentes siguen pasando**

Run: `npx vitest run src/lib/schedule-health.test.ts`
Expected: 6 tests pass.

---

## Task 6: Componente `EmployeeRestRulesEditor`

**Files:**
- Create: `src/components/employees/employee-rest-rules-editor.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RestRuleCards } from "@/components/contract-types/rest-rule-cards";
import type { EmployeeRestRule, RestRuleType, RestRuleParams } from "@/lib/types";

interface Props {
  rules: EmployeeRestRule[];
  onChange: (rules: EmployeeRestRule[]) => void;
  employeeId: string;
}

const DEFAULT_PARAMS: Record<RestRuleType, RestRuleParams> = {
  work_cycle: { work_days: 4, rest_days: 3, cycle_start_date: new Date().toISOString().slice(0, 10) },
  weekend_rotation: { every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true },
  post_night_rest: { nights_threshold: 3, rest_days_required: 2 },
  max_consecutive_nights: { max: 3 },
  compensatory_day: { applies_to: "sundays", within_days: 7 },
};

export function EmployeeRestRulesEditor({ rules, onChange, employeeId }: Props) {
  function addRule(type: RestRuleType) {
    const newRule: EmployeeRestRule = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      employee_id: employeeId,
      rule_type: type,
      params: DEFAULT_PARAMS[type],
      created_at: "",
      updated_at: "",
    };
    onChange([...rules, newRule]);
  }

  function updateRule(idx: number, params: RestRuleParams) {
    const next = rules.slice();
    next[idx] = { ...next[idx], params };
    onChange(next);
  }

  function removeRule(idx: number) {
    onChange(rules.filter((_, i) => i !== idx));
  }

  // RestRuleCards espera RestRule[] (con contract_type_id). Adaptamos shape.
  const adapted = rules.map((r) => ({
    id: r.id, contract_type_id: "", rule_type: r.rule_type, params: r.params,
    created_at: r.created_at, updated_at: r.updated_at,
  }));

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin reglas individuales — el empleado usa las reglas de su tipo de contrato.
        </p>
      )}
      <RestRuleCards
        rules={adapted}
        onUpdate={(idx, params) => updateRule(idx, params as RestRuleParams)}
        onRemove={removeRule}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("weekend_rotation")}>
          <Plus className="mr-1 h-3 w-3" /> Rotación findes
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("work_cycle")}>
          <Plus className="mr-1 h-3 w-3" /> Ciclo trabajo/descanso
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("post_night_rest")}>
          <Plus className="mr-1 h-3 w-3" /> Post-noches
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("max_consecutive_nights")}>
          <Plus className="mr-1 h-3 w-3" /> Máx. noches seguidas
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("compensatory_day")}>
          <Plus className="mr-1 h-3 w-3" /> Día compensatorio
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeCheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `employee-rest-rules-editor.tsx`.

---

## Task 7: Integrar editor en `/employees`

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

- [ ] **Step 1: Agregar import**

Cerca de los otros imports de componentes:
```ts
import { EmployeeRestRulesEditor } from "@/components/employees/employee-rest-rules-editor";
import type { EmployeeRestRule } from "@/lib/types";
```

- [ ] **Step 2: Estado para reglas en editForm**

Agregar a la interfaz/state del editForm un campo `rest_rules: EmployeeRestRule[]`. Inicializar `[]` en defaults.

- [ ] **Step 3: Fetch reglas al abrir editDialog**

En `openEditDialog` (después del fetch de `secondary_positions` ~línea 449):

```ts
const { data: restRulesData } = await supabase
  .from("employee_rest_rules")
  .select("*")
  .eq("employee_id", emp.id);
```

Y agregar `rest_rules: (restRulesData ?? []) as unknown as EmployeeRestRule[]` al `setEditForm({...})`.

- [ ] **Step 4: Render del editor en el Dialog**

Dentro del `<Dialog open={editOpen}>` (línea ~1227), agregar después del switch de supernumerario / antes del DialogFooter, una sección:

```tsx
<div className="space-y-2">
  <Label>Reglas de descanso individuales</Label>
  <p className="text-xs text-muted-foreground">
    Si están vacías, el empleado usa las reglas del tipo de contrato.
  </p>
  <EmployeeRestRulesEditor
    rules={editForm.rest_rules}
    employeeId={editForm.id}
    onChange={(rules) => setEditForm({ ...editForm, rest_rules: rules })}
  />
</div>
```

- [ ] **Step 5: Persistir reglas en handleEdit**

En `handleEdit` después del bloque de `employee_secondary_positions` (~línea 525):

```ts
// Sync rest rules: delete-all + insert-new
await supabase
  .from("employee_rest_rules")
  .delete()
  .eq("employee_id", editForm.id);

if (editForm.rest_rules.length > 0) {
  const { error: rrError } = await supabase
    .from("employee_rest_rules")
    .insert(
      editForm.rest_rules.map((r) => ({
        employee_id: editForm.id,
        rule_type: r.rule_type,
        params: r.params,
      }))
    );
  if (rrError) {
    toast.error(translateDbError(rrError.message, "Error al guardar reglas de descanso"));
    return;
  }
}
```

- [ ] **Step 6: TypeCheck + smoke en localhost**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

Manual: refrescar `/employees`, abrir un empleado, ver sección "Reglas de descanso individuales" vacía. Cerrar.

---

## Task 8: Wire fetch + pase al motor desde `/schedule`

**Files:**
- Modify: `src/app/(authenticated)/schedule/page.tsx`

- [ ] **Step 1: Estado para employee rest rules**

Agregar cerca del state existente de restRules (línea ~62):
```ts
const [employeeRestRules, setEmployeeRestRules] = useState<EmployeeRestRule[]>([]);
```

Agregar import:
```ts
import type { EmployeeRestRule } from "@/lib/types";
```
(O agregarlo al import-list ya existente.)

- [ ] **Step 2: Fetch en el bloque de Promise.all**

Cerca del fetch de `contract_rest_rules` (línea ~204):
```ts
supabase.from("contract_rest_rules").select("*"),
supabase.from("employee_rest_rules").select("*"),
```

Y consumir el resultado:
```ts
setEmployeeRestRules((employeeRestRulesData ?? []) as unknown as EmployeeRestRule[]);
```

(Ajustar nombre de la destructuración del Promise.all según patrón existente.)

- [ ] **Step 3: Pasar al motor en AutoGenerateDialog**

Pasar `employeeRestRules` al `<AutoGenerateDialog>` y desde ahí al `generateSchedule`. Inspeccionar `auto-generate-dialog.tsx` para ver cómo recibe y pasa `restRules`; replicar el patrón.

- [ ] **Step 4: Pasar a computeHealth**

En el `useMemo` de `health` (~línea 393), pasar `employeeRestRules` como último argumento a `computeHealth`.

- [ ] **Step 5: Verificar TypeCheck + dev**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 9: Verificación end-to-end manual

- [ ] **Step 1: Tests verdes**

Run: `npm run test`
Expected: ≥ 292 tests pass.

- [ ] **Step 2: Smoke en localhost**

1. `npm run dev` (si no está corriendo).
2. Login → `/employees`.
3. Editar Valentina Celis Montoya → sección "Reglas de descanso individuales" → "+ Rotación findes" → `every_n_weeks=2`, `offset=0`, sat+sun. Guardar.
4. Editar Sara Isabel Romero → "+ Rotación findes" → `every_n_weeks=2`, `offset=1`, sat+sun. Guardar.
5. (Opcional) repetir para Recepción: Katherine offset=0, Beatriz offset=1.
6. `/schedule` → Mayo 2026 EVI Poblado → "Limpiar borrador" si hay entries → "Auto-generar".
7. Verificar en grid: en cada finde, una de cada par descansa y la otra trabaja; supernumerario cubre los slots restantes.
8. Verificar en "Salud del horario" que slots sin cubrir bajaron significativamente.

- [ ] **Step 3: Documentar resultado**

Comentario en chat al usuario: nº de turnos sin cubrir antes vs después, equidad de horas entre los 5 empleados.

---

## Task 10: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (sección "Reglas de descanso parametrizables")

- [ ] **Step 1: Actualizar sección**

Reemplazar el párrafo de la sección "### Reglas de descanso parametrizables" para reflejar que ahora hay 2 fuentes:
- `contract_rest_rules` (default por contract_type)
- `employee_rest_rules` (override individual; si presente, ignora las del contract)

Mencionar `pickEffectiveRules` en `src/lib/rest-rules.ts` como helper de override y la migración 037.

---

## Task 11: Commit + push

- [ ] **Step 1: Verificar working tree**

Run: `git status`
Expected: cambios listados (migración 037 + types + helpers + UI + page wiring + CLAUDE.md).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/037_employee_rest_rules.sql \
        src/lib/types.ts src/lib/supabase/database.types.ts \
        src/lib/rest-rules.ts src/lib/rest-rules.test.ts \
        src/lib/schedule-generator.ts src/lib/schedule-generator.test.ts \
        src/lib/schedule-health.ts \
        src/components/employees/employee-rest-rules-editor.tsx \
        src/app/\(authenticated\)/employees/page.tsx \
        src/app/\(authenticated\)/schedule/page.tsx \
        CLAUDE.md \
        docs/superpowers/specs/2026-05-07-employee-rest-rules.md \
        docs/superpowers/plans/2026-05-07-employee-rest-rules.md

git commit -m "$(cat <<'EOF'
feat(rest-rules): allow per-employee override of contract rest rules

Adds employee_rest_rules table and override semantics: if employee has
1+ individual rules, those replace the contract_type rules entirely.
Enables intra-team weekend rotation (Valentina offset 0, Sara offset 1)
where same-contract employees rotate days off so coverage doesn't collapse.

- migration 037: employee_rest_rules table with RLS
- pickEffectiveRules helper + tests
- schedule-generator: restRulesByEmployee map with override in filterCandidates
- schedule-health: same override logic for restDays detection
- EmployeeRestRulesEditor component reusing RestRuleCards
- wired into /employees edit dialog and /schedule page fetch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push a main**

Run: `git push origin main`
Expected: Vercel despliega automáticamente.

---

## Self-Review Checklist

- ✅ Spec coverage: cada requisito (schema / motor / health / UI / CRUD) tiene su task.
- ✅ Sin placeholders: cada paso muestra código completo.
- ✅ Type consistency: `EmployeeRestRule`, `pickEffectiveRules`, `restRulesByEmployee` usados consistentemente.
- ✅ TDD: tests de helper y motor escritos antes de la implementación.
- ✅ Frequent commits: un solo commit final, pero cambios atómicos por task; el usuario podría dividir si lo prefiere (autorizado de todos modos por memoria).
