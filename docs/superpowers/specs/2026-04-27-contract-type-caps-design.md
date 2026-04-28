# Caps por contract_type — diseño

**Fecha:** 2026-04-27
**Scope:** Permitir que `max_hours_per_day` y `max_hours_per_week` se configuren por tipo de contrato, no solo globalmente. Casos de uso: personal asistencial (12h/día) vs administrativo (10h/día) en clínicas. Cambio acotado.

## 1. Motivación

Hoy `labor_constraints` (en `app_settings`) define `maxHoursPerDay = 10` y `maxHoursPerWeek = 40` global. Pero la legislación colombiana permite **12h/día** para personal asistencial sanitario (Decreto 1042/1978 y desarrollos posteriores), mientras el administrativo se mantiene en 10h. Hoy el modelo no permite expresar esto.

## 2. Cambio al data model

**Migración 033:**

```sql
ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS max_hours_per_day INT,
  ADD COLUMN IF NOT EXISTS max_hours_per_week INT;
```

Ambas nullable. Si null → cae al global de `labor_constraints`.

Seed defaults razonables:
```sql
-- Sin definir / Full-time / Part-time / Fin de semana → null (usan global)
-- El admin puede editar para crear "Asistencial Full-time" con 12h/día.
```

## 3. Cambio al tipo TS (`src/lib/types.ts`)

```ts
export interface ContractType {
  // ... existentes
  max_hours_per_day: number | null;
  max_hours_per_week: number | null;
}
```

## 4. Cambio al motor (`src/lib/schedule-generator.ts`)

En `filterCandidates`, sección INVIOLABLES, donde hoy chequea `slot.durationHours > constraints.maxHoursPerDay`:

```ts
const dayCap = contract?.max_hours_per_day ?? constraints.maxHoursPerDay;
if (slot.durationHours > dayCap) continue;
```

En sección CONTRACTUAL donde calcula `effectiveWeekly`:

```ts
const weekCap = contract?.max_hours_per_week ?? contract?.target_hours_per_week ?? constraints.maxHoursPerWeek;
const effectiveWeekly = Math.min(weekCap, employee.max_hours_per_week);
```

Misma lógica en `computeExceededCaps` y en el `scoreCandidate` de la penalización por saturación.

NOTA: `target_hours_per_week` es un *target* aspiracional (cuántas horas idealmente recibe el empleado al mes). `max_hours_per_week` es un *cap* duro (máximo legal). Pueden coexistir: un Full-time tiene target 40 y cap 48 (8 extras max).

## 5. Cambio al UI

**`/contract-types`** (`src/app/(authenticated)/contract-types/page.tsx`):
- Agregar 2 inputs al form: "Máximo horas por día" y "Máximo horas por semana".
- Help text: "Dejar vacío para usar el límite global de Restricciones laborales."

**`/settings`** (`src/app/(authenticated)/settings/page.tsx`):
- Agregar nota debajo de "Máximo horas por día/semana": *"Estos valores se aplican como default. Cada tipo de contrato puede sobrescribirlos en /contract-types."*

## 6. Tests

- **Vitest** en `schedule-generator.test.ts`: 1 test nuevo — empleado con `contract.max_hours_per_day = 12` puede recibir un turno de 11h, pero otro con `null` (cae a global = 10) no puede.
- **Sin tests de UI**.

## 7. Entregables

1. Migración 033.
2. Tipo TS actualizado.
3. Motor con fallback contract → global.
4. Form `/contract-types` con 2 inputs nuevos.
5. Nota en `/settings`.
6. CLAUDE.md actualizado (sección Equity Model habla de contract_types — agregar mención de los nuevos campos).

## 8. No incluido

- Validar que `max_hours_per_day` no sea menor al turno más corto (validación cosmética, no crítica).
- Migrar `target_hours_per_week` a usar el nuevo `max_hours_per_week` — los 2 conviven; semánticamente distintos.
- Cap por **posición** (más granular). Si más adelante se necesita, sería capa adicional.
