# Reglas de descanso parametrizables — diseño

**Fecha:** 2026-04-29
**Scope:** Sistema plug-in de reglas de descanso configurables por contract_type. Cubre los 5 patrones más comunes en Colombia: ciclo trabajo/descanso, rotación de findes, descanso post-noches, máximo noches consecutivas, día compensatorio.

## 1. Motivación

Hoy el motor solo permite expresar:
- 6 días consecutivos máximo (Art. 161 CST, inviolable global).
- Disponibilidad binaria por contract (`available_sundays`/`holidays`/`nights`).

No expresa:
- "Trabaja 4 días, descansa 3" (rotación de plataformas, 4×3 hospitalario).
- "Cada 2 findes, libre" (farmacia, retail).
- "Tras 3 noches, requiere 2 días libres" (norma sector salud).
- "Máximo 3 noches consecutivas".
- "Si trabajó domingo, día compensatorio dentro de 7 días" (Art. 179 CST).

Es muy común en Colombia y restringir el modelo a una sola regla limita el caso de uso real.

## 2. Modelo

### 2.1. Tabla nueva `contract_rest_rules`

```sql
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
```

Un contract type puede tener 0 o más reglas. Todas se aplican como inviolables (AND).

### 2.2. Forma de `params` por tipo de regla

```ts
// work_cycle: trabajar N días, descansar M días, en ciclo continuo.
type WorkCycleParams = {
  work_days: number;      // 1-30
  rest_days: number;      // 1-30
  cycle_start_date: string; // ISO date "2026-04-06"
};

// weekend_rotation: cada N semanas, fines de semana libres (offset 0 ó 1).
type WeekendRotationParams = {
  every_n_weeks: number;   // 2-4
  offset: 0 | 1;           // qué grupo de semanas (par/impar)
  include_saturday: boolean;
  include_sunday: boolean;
};

// post_night_rest: tras N noches consecutivas, requiere M días de descanso.
type PostNightRestParams = {
  nights_threshold: number;  // 1-7
  rest_days_required: number; // 1-7
};

// max_consecutive_nights: tope duro de turnos nocturnos seguidos.
type MaxConsecutiveNightsParams = {
  max: number;  // 1-7
};

// compensatory_day: si trabajó dom/fest, requiere día libre dentro de N días.
type CompensatoryDayParams = {
  applies_to: "sundays" | "holidays" | "both";
  within_days: number;  // 3-14
};
```

### 2.3. Por contract type, no por empleado

Decisión: las reglas viven a nivel `contract_type`, no `profile`. Razones:
- Reduce duplicación: 20 empleados con el mismo contract heredan las mismas reglas.
- Si un empleado individual necesita un patrón distinto, se le crea un contract dedicado (es liviano: contract es solo una plantilla).
- Excepción: el `cycle_start_date` del `work_cycle` es global del contract — todos los empleados de ese contract entran al ciclo en la misma fecha. Si distintos empleados deben tener distintos anchors (ej. arrancar en grupos), se modela con N contracts (Asistencial-A, Asistencial-B) con start_date distintos.

### 2.4. Aplicación en el motor

`filterCandidates` (`src/lib/schedule-generator.ts`) agrega una nueva sección INVIOLABLE:

```ts
// REST RULES: cada regla del contract se evalúa; si alguna dice "es día de descanso", continue.
if (contract && ctx.restRulesByContract.has(contract.id)) {
  const rules = ctx.restRulesByContract.get(contract.id)!;
  const isRest = rules.some((rule) =>
    isRestDay(rule, slot, employee, tracker, ctx)
  );
  if (isRest) continue;
}
```

`isRestDay(rule, slot, employee, tracker, ctx): boolean` es una función pura, una implementación por `rule_type`.

## 3. Helpers puros (TDD por cada uno)

`src/lib/rest-rules.ts`:

```ts
export function isRestDay(
  rule: RestRule,
  date: string,
  template: ShiftTemplate,
  recentEntries: ScheduleEntry[],  // del empleado, ordenadas por date
): boolean;

export function isWorkCycleRest(params: WorkCycleParams, date: string): boolean;
export function isWeekendRotationRest(params: WeekendRotationParams, date: string): boolean;
export function isPostNightRest(params: PostNightRestParams, date: string, recent: ScheduleEntry[]): boolean;
export function exceedsMaxConsecutiveNights(params: MaxConsecutiveNightsParams, recent: ScheduleEntry[], slotIsNight: boolean): boolean;
export function needsCompensatory(params: CompensatoryDayParams, date: string, recent: ScheduleEntry[]): boolean;
```

Tests por regla — ~3-4 cada una, total ~18 tests nuevos.

## 4. UI

### 4.1. En `/contract-types` (form de edición)

Después de los campos básicos:

```
Reglas de descanso

¿Qué patrón aplica este contrato?

◉ Sin reglas especiales
○ Asistencial sanitario
  → max 3 noches consecutivas + post-noche 2d libres
○ Rotación 4×3
○ Rotación de findes alternados
○ Personalizado

[si elige preset o Personalizado, se muestran las cards de reglas activas]
```

### 4.2. Cada regla como card editable

```
┌─ Ciclo trabajo/descanso ─────────────  [×] ┐
│ Trabaja: [4] días                          │
│ Descansa: [3] días                         │
│ Inicio del ciclo: [📅 06 abr 2026]         │
│                                             │
│ ▶ Ver próximos 14 días                      │
└─────────────────────────────────────────────┘
```

### 4.3. Preview de 14 días

Mini grilla mostrando ✓/─ por día según las reglas combinadas:

```
Lun 6  Mar 7  Mié 8  Jue 9  Vie 10  Sáb 11  Dom 12
 ✓     ✓     ✓     ✓      ─      ─      ─
Lun 13 Mar 14 Mié 15 Jue 16 Vie 17  Sáb 18  Dom 19
 ✓     ✓     ✓     ✓      ─      ─      ─

✓ puede trabajar     ─ descanso por regla
```

### 4.4. Validaciones

Mostrar warnings (no bloqueantes) cuando:
- 2 reglas son redundantes (ej. weekend_rotation + available_sundays=false).
- El anchor del ciclo está muy futuro.
- Sin candidatos elegibles para todos los slots típicos del contract (alerta proactiva).

### 4.5. Tabla `/contract-types`

Nueva columna "Reglas" con resumen:
- "Sin reglas"
- "Ciclo 4×3"
- "Findes alternados"
- "Asistencial: 3 noches max + post-noche 2d"
- "3 reglas activas" (si son muchas)

### 4.6. Tabla `/employees`

Badge gris al lado del nombre con la regla principal del contract (si tiene): "Ciclo 4×3", "Findes alt.", etc.

### 4.7. Panel "Salud del horario" (`/schedule`)

Cuando un empleado fue descartado para un slot por una regla, en la sección de saturados expandir:
> *Juan Pérez · descanso por regla "Ciclo 4×3" los días: 10, 11, 12, 17, 18, 19...*

## 5. Migración 036

```sql
CREATE TABLE contract_rest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type_id UUID NOT NULL REFERENCES contract_types(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'work_cycle', 'weekend_rotation', 'post_night_rest',
    'max_consecutive_nights', 'compensatory_day'
  )),
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_rest_rules_contract ON contract_rest_rules(contract_type_id);

ALTER TABLE contract_rest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_rules_select" ON contract_rest_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rest_rules_admin_write" ON contract_rest_rules FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager'))
  WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contract_rest_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 6. Tipos TS

```ts
// types.ts
export type RestRuleType =
  | "work_cycle" | "weekend_rotation" | "post_night_rest"
  | "max_consecutive_nights" | "compensatory_day";

export interface RestRule {
  id: string;
  contract_type_id: string;
  rule_type: RestRuleType;
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

## 7. Tests

### 7.1. Vitest puros (`rest-rules.test.ts`)
- `isWorkCycleRest`: 4 tests (en día trabajo, en día descanso, al inicio del ciclo, antes del anchor → false).
- `isWeekendRotationRest`: 4 tests (semana de descanso sáb, semana de descanso dom, semana de trabajo, offset 1).
- `isPostNightRest`: 3 tests (tras 3 noches → true días 4 y 5, día 6 → false, sin noches recientes → false).
- `exceedsMaxConsecutiveNights`: 3 tests.
- `needsCompensatory`: 4 tests.

Total: ~18 tests.

### 7.2. Test de integración generator
- 1 test: contract con `work_cycle (4, 3)` — verificar que el motor descarta los días de descanso.

## 8. Entregables

1. Migración 036 + tipos.
2. Helpers puros + 18 tests Vitest.
3. Motor con sección REST RULES.
4. Form `/contract-types` con presets + cards editables + preview 14 días.
5. Persistencia (delete/insert de reglas al guardar contract).
6. Columna "Reglas" en tabla `/contract-types`.
7. Badge en `/employees` con resumen de reglas.
8. Texto explicativo en panel "Salud del horario" cuando descarte por regla.
9. CLAUDE.md.

## 9. No incluido (futuro)

- Reglas a nivel empleado (sobreescriben las del contract).
- Visualización de calendario completo del mes con código de color (vista expandida del preview).
- Sugerencias automáticas: "Detectamos que 3 empleados podrían ser rotación 4×3 — ¿aplicar?".
- Reglas custom definidas por el admin con DSL.
