# Spec — Fase 2: Demanda de personal para festivos (staffing)

**Fecha:** 2026-06-29
**Estado:** Aprobado (diseño)
**Rama:** `feature/holiday-staffing`

## Contexto y motivación

Es la Fase 2 del trabajo de festivos (la Fase 1 — disponibilidad por empleado — ya está en producción). Resuelve el caso "se trabaja el festivo **pero con un horario diferente** al normal" (y su variante "el festivo no se opera").

Hoy la matriz de Necesidades (`staffing_requirements`) modela la demanda **solo por día de la semana** (`day_of_week` 0-6, recurrente). El motor (`buildDemandSlots`, `src/lib/schedule-generator.ts:101-144`) trata un festivo **exactamente como su día de la semana**: mapea `fecha → date.getDay()` y nada más. No hay forma de decir "los festivos esta posición abre 9-13 con 1 persona" ni "los festivos esta posición no opera".

En este modelo **el horario lo define el turno** (`shift_template`), no el empleado ni la posición. Por eso un horario distinto de festivo se logra con un **turno de festivo** (un `shift_template` normal, ej. "Festivo 9-13") referenciado por la demanda de festivo.

## Decisiones cerradas

- **Semántica "Reemplaza" (por posición):** si una posición tiene perfil de festivo (≥1 fila `is_holiday=true`), en días festivos esa posición usa **solo** su perfil de festivo; se ignora su demanda de día de semana. Una posición sin perfil de festivo se comporta como hoy (festivo = su día de semana). Retrocompatible: sin configurar nada, nada cambia.
- **UI:** una **8ª columna "Festivo"** junto a Dom-Sáb en los tabs de la matriz.
- **Modelo:** columna `is_holiday BOOLEAN` en `staffing_requirements` (no tabla separada). Las filas festivas usan `day_of_week = 0` como **sentinela** (el perfil de festivo no varía según en qué día caiga el festivo — YAGNI). El `UNIQUE` incluye `is_holiday`.
- **Horario distinto = turno de festivo:** el admin crea un `shift_template` normal y lo usa en la columna Festivo. **No** se modifica `shift_templates` (no se agrega flag de festivo).
- **Festivos cubiertos:** cualquier festivo de la sede según `isHoliday(date, locationId, holidays)` — nacional (`location_id IS NULL`) o de sede. No se distingue tipo de festivo.

## Fuera de alcance

- Variar la demanda de festivo según el día de la semana en que cae (festivo-domingo ≠ festivo-martes).
- Distinguir tipos de festivo (religioso, cívico, etc.).
- Cambiar cómo se modela el horario (sigue siendo el del turno).

---

## Componente 1 — Migración (`061_holiday_staffing.sql`)

**Archivo:** `supabase/migrations/061_holiday_staffing.sql`

1. **Columna:** `ALTER TABLE staffing_requirements ADD COLUMN is_holiday BOOLEAN NOT NULL DEFAULT false;`
2. **Recrear UNIQUE** (constraint actual de migración 006: `UNIQUE(location_id, position_id, shift_template_id, day_of_week)`):
   ```sql
   ALTER TABLE staffing_requirements DROP CONSTRAINT <nombre_actual>;
   ALTER TABLE staffing_requirements
     ADD CONSTRAINT staffing_requirements_unique
     UNIQUE (location_id, position_id, shift_template_id, day_of_week, is_holiday);
   ```
   (El nombre actual se confirma en el plan vía `pg_constraint`.)
3. **`CREATE OR REPLACE FUNCTION save_staffing_diff`** (origen: `supabase/migrations/032_staffing_audit.sql:8-78`) con `is_holiday` en sus **4 puntos**:
   - El temp table `_desired`: agregar `(r->>'is_holiday')::BOOLEAN AS is_holiday`.
   - El `NOT EXISTS` del DELETE: agregar `AND d.is_holiday = sr.is_holiday`.
   - El INSERT: agregar la columna `is_holiday` (valor de `_desired`).
   - El `ON CONFLICT`: `(location_id, position_id, shift_template_id, day_of_week, is_holiday)`.
   - Se preserva todo lo demás (permission gate, `SECURITY DEFINER SET search_path = public`, contadores).

**Riesgo crítico (obstáculo del análisis):** si `is_holiday` no entra al UNIQUE **y** al `ON CONFLICT`/`NOT EXISTS`, una fila festiva y su gemela no-festiva del mismo `(location, position, shift, dow)` colisionan: el upsert pisa una con otra y el DELETE borra de más.

## Componente 2 — Tipos

- `src/lib/types.ts:183` (`StaffingRequirement`): agregar `is_holiday: boolean;`.
- Regenerar `src/lib/supabase/database.types.ts` (skill `/regen-types`) tras aplicar la migración.

## Componente 3 — Helpers (`src/lib/staffing-helpers.ts`)

El `CellKey` gana una 4ª parte para `is_holiday` (0/1): `"pos|shift|dow|h"`.
- `makeCellKey(positionId, shiftTemplateId, dayOfWeek, isHoliday: boolean)` → `` `${pos}|${shift}|${dow}|${isHoliday ? 1 : 0}` ``.
- `parseCellKey` devuelve `{position_id, shift_template_id, day_of_week, is_holiday}`.
- `StaffingCell` gana `is_holiday: boolean`.
- `diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift` operan sobre keys opacas → propagan `is_holiday` automáticamente vía `parseCellKey`. (Nota del análisis: `diffStaffing` no se usa desde la UI hoy; el diff se arma inline en `staffing-matrix.tsx:handleSave` con `parseCellKey`, que sí debe emitir `is_holiday`.)

## Componente 4 — Motor (`buildDemandSlots`, `src/lib/schedule-generator.ts`)

- **Ampliar firma:** `buildDemandSlots(config, dates, templates, staffingRequirements, holidays: HolidayDate[], locationId: string)`. El call-site (`:488`, dentro de `generateSchedule`) ya tiene `holidays` (param `:358`) y `config.locationId`.
- **Índices** (junto al `reqMap` actual `pos_shift_dow → count`, solo filas `is_holiday=false`):
  - `reqMapHoliday`: `pos_shift → count` (solo filas `is_holiday=true`).
  - `holidayPositions: Set<string>`: posiciones con ≥1 fila `is_holiday=true`.
- **En el loop**, para cada `date`: `const isHol = isHoliday(dateStr, locationId, holidays)` (`isHoliday` ya importado de `equity-helpers`). Dentro del bloque `hasDemand`, para cada `posId`:
  - Si `isHol && holidayPositions.has(posId)` → `count = reqMapHoliday.get(`${posId}_${templateId}`) ?? 0` (perfil festivo, ignora `dow`).
  - Si no → `count = reqMap.get(`${posId}_${templateId}_${dow}`) ?? 0` (comportamiento actual).
- El branch `else` (sin `useDemandRequirements`) no cambia.

## Componente 5 — UI de la matriz

- **`src/hooks/use-staffing-matrix.ts:54-58`**: al construir `persistedMap`, incluir `r.is_holiday` en `makeCellKey`.
- **`src/components/staffing/staffing-matrix.tsx:69-71`** (`handleSave`): al armar `rows` con `parseCellKey`, emitir `is_holiday`. (Obstáculo: el RPC manda TODO el desired state; si `handleSave` no incluye las filas festivas, el RPC las borra en el primer guardado.)
- **Los 3 tabs** (`staffing-tab-by-shift.tsx`, `staffing-tab-by-position.tsx`, `staffing-tab-heatmap.tsx`): agregar una 8ª columna "Festivo" tras Dom-Sáb. La columna festiva usa `makeCellKey(pos, shift, 0, true)` (sentinela `dow=0`, `isHoliday=true`); las columnas Dom-Sáb usan `makeCellKey(pos, shift, dayIndex, false)`. Header con label "Festivo" y un resaltado análogo al `isWeekend` del heatmap. El heatmap solo soporta edición simple (no recibe `recentCoverage` ni handlers de replicación).
- **Replicación:** las acciones "Replicar lunes a M-V" siguen operando solo sobre las columnas de día de semana (no tocan la columna festiva). No se agrega replicación hacia/desde Festivo en este lote.

## Testing

- **Vitest (motor, lógica pura):** en `src/lib/schedule-generator.test.ts`:
  - Posición CON perfil de festivo: en una fecha festiva genera slots del turno de festivo (ej. required=1 turno "Festivo") y NO del turno de día de semana. Verificar el horario del entry = el del turno de festivo.
  - Perfil de festivo con `required=0` (no opera): en festivo no se generan slots para esa posición/turno.
  - Posición SIN perfil de festivo: en festivo se comporta como su día de semana (retrocompat).
  - Una fecha NO festiva ignora el perfil de festivo.
- **Vitest (helpers):** `staffing-helpers.test.ts` si existe — `makeCellKey`/`parseCellKey` round-trip con `is_holiday`.
- **SQL test (`supabase/tests/061_holiday_staffing.sql`, BEGIN/ROLLBACK):** insertar vía `save_staffing_diff` un set con una fila festiva y una no-festiva del mismo `(pos, shift, dow)`; verificar que coexisten (no se pisan) y que un re-guardado sin la festiva la borra solo a ella.

## Validación

Flujo `/superpowers`: spec → plan → implementar → `/code-review`. Reviewers:
- `migration-reviewer` (migración + RPC).
- `schedule-algorithm-reviewer` (cambio en `buildDemandSlots`).
- `modern-web-guidance` antes de tocar la UI de los tabs.
- `npm run typecheck` + `npm run test` verdes; regenerar `database.types.ts`.
- Smoke E2E opcional: configurar un perfil de festivo en `/staffing` y generar un horario que cubra un festivo.

## Criterios de éxito

- [ ] `staffing_requirements.is_holiday` existe; el `UNIQUE` lo incluye; `save_staffing_diff` discrimina festivo de no-festivo (coexisten sin pisarse).
- [ ] La matriz de Necesidades muestra una columna "Festivo" editable en los 3 tabs; guardar persiste las filas festivas sin borrar las de día de semana.
- [ ] El motor, en un festivo, usa el perfil de festivo de la posición (si lo tiene), con el horario del turno de festivo; `required=0` → no opera; sin perfil → comportamiento actual.
- [ ] Una fecha no festiva ignora el perfil de festivo.
- [ ] `npm run typecheck` y `npm run test` verdes; `/code-review` sin bloqueadores.

## Riesgos

- **UNIQUE/ON CONFLICT/DELETE** deben incluir `is_holiday` en los tres — el punto más delicado (lo cubre `migration-reviewer` + el SQL test).
- **Dos formatos de key** (UI `|`, motor `_`) se extienden por separado; mantener consistencia el sentinela `dow=0`.
- **`handleSave` debe emitir las filas festivas** desde el primer guardado o el RPC las borra.
- **El turno de festivo debe estar entre los `config.shiftTemplateIds`** seleccionados en el dialog de auto-generación, o el motor no lo itera y el perfil festivo no se aplica. Es responsabilidad del admin seleccionar tanto los turnos normales como el de festivo. (El filtrado por demanda hace que cada turno solo genere slots en su contexto: el turno normal en días de semana, el de festivo en festivos.) No se agrega lógica para auto-incluir el turno de festivo en este lote; se documenta en la UI de la columna Festivo.
