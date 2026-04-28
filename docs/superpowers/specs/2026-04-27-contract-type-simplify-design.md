# Simplificación del modelo de contract types

**Fecha:** 2026-04-27
**Scope:** Reemplazar 7 inputs numéricos confusos por 3 inputs + 4 switches. Quitar caps trimestrales (no exigidos por ley) y targets aspiracionales (el algoritmo ya los balancea solo).

## 1. Motivación

El form actual mezcla caps duros con targets aspiracionales sin distinguirlos visualmente. El admin tiene que conocer la ley laboral colombiana para llenarlo. Y los caps trimestrales de domingos/festivos son convención de RRHH, no exigencia legal — agregan rigidez sin valor.

Verificado: la ley CST NO impone máximo trimestral de domingos/festivos. El balanceo equitativo entre empleados ya lo hace el algoritmo via `rolling_rollup_sums` + scoring penalties.

## 2. Modelo nuevo

**Lo que el admin configura** (form simplificado):

| Campo | Tipo | Default | Significado |
|---|---|---|---|
| `name` | string | — | "Asistencial Full-time", etc. |
| `description` | string? | null | descripción opcional |
| `weekly_hours_mode` | `"full" \| "partial"` | `"full"` | Completa = 44h (ley 2101); Parcial = custom |
| `weekly_hours` | int? | null si full | si parcial, horas semanales (24, 30, etc.) |
| `is_healthcare` | bool | false | si true → 12h/día (Decreto 1042/1978); si false → 10h/día |
| `available_sundays` | bool | true | si false → nunca recibe domingos |
| `available_holidays` | bool | true | si false → nunca recibe festivos |
| `available_nights` | bool | true | si false → nunca recibe turnos nocturnos |

**Lo que aplica el algoritmo automáticamente:**

- **Inviolables (ley CST)**:
  - Máx horas/día = 12 si `is_healthcare`, 10 si no.
  - Máx 6 días consecutivos sin descanso (Art. 161).
  - Mín 12h descanso entre turnos.
- **Cap blando que marca "Extra"**:
  - Si supera `weekly_hours` (44 default o el parcial) → `weekly_hours` extra.
- **Disponibilidad por switch**:
  - Si `available_sundays = false` → inviolable: no se asigna en domingo.
  - Análogo para festivos y noches.
- **Equidad sin caps duros**:
  - Scoring penaliza por `rolling_rollup_sums.sundays/saturdays/nights/holidays` para que el reparto sea equitativo entre los que SÍ están disponibles.

**Caps trimestrales: ELIMINADOS.** Targets aspiracionales: ELIMINADOS.

## 3. Migración 034

```sql
-- 034: simplificación de contract_types.

ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS weekly_hours_mode TEXT NOT NULL DEFAULT 'full' CHECK (weekly_hours_mode IN ('full','partial')),
  ADD COLUMN IF NOT EXISTS weekly_hours INT,
  ADD COLUMN IF NOT EXISTS is_healthcare BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_sundays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_holidays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_nights BOOLEAN NOT NULL DEFAULT true;

-- Marcar columnas viejas como deprecated (no las borramos para no romper data).
COMMENT ON COLUMN contract_types.max_sundays_per_quarter IS 'DEPRECATED — el algoritmo ahora balancea equitativamente vía rolling_rollups. Mantener en BD por compatibilidad.';
COMMENT ON COLUMN contract_types.max_holidays_per_quarter IS 'DEPRECATED — idem.';
COMMENT ON COLUMN contract_types.target_saturdays_per_month IS 'DEPRECATED — scoring balancea sábados.';
COMMENT ON COLUMN contract_types.target_nights_per_month IS 'DEPRECATED — reemplazado por available_nights.';
COMMENT ON COLUMN contract_types.target_hours_per_week IS 'DEPRECATED — usar weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_week IS 'DEPRECATED — derivado de weekly_hours.';
COMMENT ON COLUMN contract_types.max_hours_per_day IS 'DEPRECATED — derivado de is_healthcare.';

-- Migrar valores razonables a las columnas nuevas para los contract types existentes.
UPDATE contract_types SET
  weekly_hours_mode = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN 'full'
    ELSE 'partial'
  END,
  weekly_hours = CASE
    WHEN target_hours_per_week IS NULL OR target_hours_per_week >= 44 THEN NULL
    ELSE target_hours_per_week
  END,
  is_healthcare = false,                           -- por default todos no asistencial; el admin marca después
  available_sundays = (max_sundays_per_quarter > 0),
  available_holidays = (max_holidays_per_quarter > 0),
  available_nights = COALESCE(target_nights_per_month, 1) > 0;
```

## 4. Cambios al motor

**`src/lib/schedule-generator.ts`** — `filterCandidates`:

```ts
// INVIOLABLES adicionales:
if (!contract?.available_sundays && dayOfWeek(slot.date) === 0) continue;
if (!contract?.available_holidays && isHoliday(slot.date, ctx.locationId, ctx.holidays)) continue;
if (!contract?.available_nights && isNightShift(slot.template)) continue;

// Cap horas/día (ya existe — ajustar):
const dayCap = contract?.is_healthcare ? 12 : 10;  // override del global solo si is_healthcare es definido
// fallback al global si no hay contract
```

**`computeExceededCaps`**:
- Quitar chequeos de `max_sundays_per_quarter` y `max_holidays_per_quarter`.
- `weekly_hours` ahora deriva de `contract.weekly_hours ?? 44` (default 44h Ley 2101).

**`scoreCandidate`**:
- Quitar el uso de `target_saturdays_per_month` y `target_nights_per_month` (no se usan como bonus).
- Mantener las penalizaciones por rolling rollups (esa es la equidad real).

## 5. Cambios al UI

**`/contract-types`**: rediseño completo del form.

```tsx
<FormField label="Nombre" required>
  <Input ...>
</FormField>
<FormField label="Descripción">
  <Textarea ...>
</FormField>

<FormField label="Tipo de jornada">
  <RadioGroup>
    <Radio value="full">Completa (44 h/semana — Ley 2101)</Radio>
    <Radio value="partial">Parcial</Radio>
  </RadioGroup>
  {weekly_hours_mode === "partial" && (
    <Input type="number" placeholder="Horas/semana" />
  )}
</FormField>

<Switch> Personal asistencial (12h/día vs 10h/día) </Switch>

<div>
  <Label>Días disponibles:</Label>
  <Switch> Domingos </Switch>
  <Switch> Festivos </Switch>
  <Switch> Noches </Switch>
</div>
```

La tabla principal de `/contract-types` se simplifica: columnas Nombre, Empleados, Jornada, Asistencial, Disponibilidad, Acciones.

## 6. Tests

- 1 test nuevo en `schedule-generator.test.ts`: empleado con `available_sundays = false` no recibe domingo aunque sea elegible por todo lo demás.
- 1 test nuevo: empleado con `weekly_hours = 24` (parcial) marca `weekly_hours` extra al pasar de 24h.

## 7. Entregables

1. Migración 034 con columnas nuevas + comments deprecating las viejas + UPDATE de migración.
2. Tipo TS `ContractType` con campos nuevos.
3. Motor con nuevas inviolables y cap derivado de jornada.
4. Form `/contract-types` rediseñado.
5. Tabla `/contract-types` con columnas simplificadas.
6. CLAUDE.md actualizado.

## 8. No incluido

- Borrar las columnas viejas de la BD (son comments, mantenemos para no romper código que aún las pueda referenciar). Cleanup futuro.
- Migrar los `employee_equity_rollups` (no afectados).
