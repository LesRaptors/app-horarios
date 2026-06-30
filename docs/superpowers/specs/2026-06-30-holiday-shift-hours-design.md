# Spec — Horario especial en festivos por turno

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feature/holiday-shift-hours`

## Contexto y motivación

Hoy, para que un empleado trabaje un festivo con un horario distinto al habitual (mismo turno, misma cobertura, solo cambian las horas), el único camino es la Fase 2 (perfil de festivo en Necesidades + posiblemente crear una plantilla de turno aparte). Eso es un reproceso desproporcionado para el caso más común:

> "Tengo un turno L–V de 8am a 5pm. El empleado trabaja festivos. Cuando su turno cae en festivo, solo quiero que sea de 10am a 3pm y que el día quede cubierto."

**Hallazgo habilitante:** cada `schedule_entries` ya guarda **sus propias horas** (`start_time`/`end_time`), copiadas del turno al generar. Todo lo aguas abajo —cálculo de horas para equidad (`employee_equity_rollups`), nómina, grilla de `/schedule`, export PDF/Excel— lee del registro, **no** del turno en runtime. Por eso basta con que el motor escriba las horas correctas en el festivo; nada más cambia.

El motor (`buildDemandSlots` en `schedule-generator.ts`) ya recorre fechas sabiendo si cada día es festivo (`isHol = hasDemand && isHoliday(dateStr, locationId, holidays)`). Solo falta elegir las horas correctas al construir el turno de ese día.

## Decisiones cerradas

- **El horario de festivo vive en el turno** (`shift_templates`), no por empleado. Se define una vez; aplica a todos los que tengan ese turno. (Confirmado con el usuario.)
- **Opcional, retrocompatible:** `NULL` = sin horario especial = comportamiento actual intacto.
- **Descanso propio en festivo** con default 0 (una jornada reducida normalmente no lleva el mismo almuerzo; reusar el descanso normal daría horas mal contadas en nómina).
- **Ortogonal a la Fase 2:** si una posición tiene perfil de festivo en Necesidades, el turno que ese perfil pide usa su horario de festivo si lo tiene. Las dos features se combinan sin conflicto.
- **"No trabaja festivos"** sigue siendo la disponibilidad del empleado (`available_holidays`), sin cambios.

## Fuera de alcance

- Horario de festivo por empleado (solo por turno).
- Horarios especiales para otros días (sábados, vísperas, etc.).
- Badge/indicador visual nuevo en la grilla: las horas distintas + el día ya marcado como festivo bastan en v1.
- Cambiar `is_night` en festivos: el turno conserva su `is_night` normal.

---

## Pieza 1 — Datos (`shift_templates`, migración `062_holiday_shift_hours.sql`)

Tres columnas nuevas, todas `NULL`-ables:

```sql
ALTER TABLE shift_templates
  ADD COLUMN holiday_start_time     time NULL,
  ADD COLUMN holiday_end_time       time NULL,
  ADD COLUMN holiday_break_minutes  integer NULL;
```

- Semántica: un turno "tiene horario de festivo" cuando `holiday_start_time IS NOT NULL` (en ese caso `holiday_end_time` también debe estar presente — garantizado por la UI).
- Sin backfill. Sin cambios de RLS (solo `ADD COLUMN`; las policies existentes de `shift_templates` siguen aplicando).
- Regenerar `src/lib/supabase/database.types.ts` con el MCP de Supabase tras aplicar.
- Test SQL en `supabase/tests/` con patrón `BEGIN ... ROLLBACK`: inserta un turno con horario de festivo y verifica que las columnas persisten; verifica que las columnas son nullable (insert sin ellas funciona).

## Pieza 2 — Tipos (`src/lib/types.ts`)

Agregar a `interface ShiftTemplate`:

```ts
holiday_start_time: string | null;
holiday_end_time: string | null;
holiday_break_minutes: number | null;
```

## Pieza 3 — Motor (`src/lib/schedule-generator.ts`)

**Separar dos conceptos hoy fusionados.** El código actual calcula `const isHol = hasDemand && isHoliday(...)` — fusiona "el día es festivo" con "hay demanda" porque el perfil de festivo (REEMPLAZA) solo existe con demanda. El horario de festivo del turno, en cambio, debe aplicar **siempre que el día sea festivo**, incluso en modo sin-demanda (`useDemandRequirements = false`). Por eso se introduce una variable independiente:

```ts
for (const date of dates) {
  const dateStr = formatDateISO(date);
  const dow = date.getDay();
  if (config.excludeDates.includes(dateStr)) continue;
  const isHolidayDate = isHoliday(dateStr, locationId, holidays); // para horas del turno
  const isHol = hasDemand && isHolidayDate;                       // para perfil de festivo (REEMPLAZA)
  // ... ramas existentes sin cambios estructurales ...
}
```

`pushSlot` recibe `isHolidayDate` (NO `isHol`) y elige las horas:

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
      shiftTemplateId: template.id, startTime, endTime, breakMinutes: breakMin,
      durationHours: duration, template });
  }
};
```

- Las **tres** llamadas a `pushSlot` (rama perfil de festivo, rama día de semana, rama `else` sin demanda) pasan `isHolidayDate`.
- `isHol` se sigue usando **solo** en la condición `if (isHol && holidayPositions.has(posId))` (rama del perfil de festivo). Su semántica no cambia.
- `calcDurationHours` (ya existe, línea 52) maneja cruce de medianoche (`totalMin < 0 → +24h`), así que un horario de festivo nocturno funciona sin cambios.
- Como el slot escribe `startTime`/`endTime`/`breakMinutes` al registro (ya hoy, línea ~610), equidad, nómina, grilla y export quedan correctos automáticamente.

## Pieza 4 — UI (`src/app/(authenticated)/shifts/page.tsx`)

En el formulario de turno (crear/editar), debajo de los campos de horario normal:

- Estado nuevo: `formHasHolidayHours: boolean`, `formHolidayStart: string`, `formHolidayEnd: string`, `formHolidayBreak: number`.
- Un **`<Switch>` "Horario especial en festivos"** (apagado por defecto). Reusar el patrón de switch ya presente en el form (el de `is_night`).
- Al **encender**: aparecen 3 campos — **Hora de inicio**, **Hora de fin**, **Minutos de descanso** (default 0). Prefill de inicio/fin con los valores normales como punto de partida.
- Al **apagar** (o al guardar con el switch apagado): persistir las 3 columnas como `NULL`.
- Al **editar** un turno existente: `formHasHolidayHours = item.holiday_start_time != null`, y precargar los 3 campos si aplica.
- En `handleSave`, incluir en el `upsert`: `holiday_start_time`, `holiday_end_time`, `holiday_break_minutes` (los tres `null` si el switch está apagado).
- Validación (cliente): si el switch está encendido, inicio y fin son obligatorios. Permitir cruce de medianoche (no exigir fin > inicio; igual que el turno normal).
- **Modern-web-guidance:** invocar la skill antes de tocar el form (switch + inputs condicionales con `aria` correcto, label asociado, estado del grupo de campos). El form ya existe; mantener su patrón.
- Opcional (nice-to-have, no bloqueante): en la tabla de turnos, mostrar el horario de festivo como segunda línea cuando exista (ej. "Festivos: 10:00–15:00").

## Pieza 5 — Tests (Vitest, `src/lib/schedule-generator.test.ts`)

Casos sobre `generateSchedule`/`buildDemandSlots` (usar el helper de setup existente del archivo):

1. **Festivo + turno con horario de festivo** → el registro generado en el día festivo tiene `start_time`/`end_time` = horario de festivo y la duración reducida correcta.
2. **Festivo + turno SIN horario de festivo** → horas normales (regresión: no rompe el comportamiento actual).
3. **Día normal + turno con horario de festivo** → horas normales (el horario de festivo NO se aplica fuera de festivos).
4. **Perfil de festivo (Necesidades, `is_holiday`) + turno con horario de festivo** → el turno del perfil usa las horas de festivo (las dos features se combinan).
5. **Modo sin demanda (`useDemandRequirements = false`) + festivo + turno con horario de festivo** → usa las horas de festivo (valida que `isHolidayDate` aplica independiente de `hasDemand`, que es justo la separación introducida en la Pieza 3).

## Validación

- Flujo `/superpowers`: spec → plan → implementar (subagent-driven) → `/code-review` de rama.
- Reviewers especializados: `migration-reviewer` (migración 062 + regen de tipos + test SQL) y `schedule-algorithm-reviewer` (cambio en `pushSlot`/`buildDemandSlots` contra el spec de equidad e inviolables).
- `npm run typecheck` y `npm run test` verdes.

## Criterios de éxito

- [ ] Un turno puede tener horario de festivo opcional (3 columnas, migración 062 aplicada + tipos regenerados).
- [ ] El motor escribe las horas de festivo en los registros de días festivos cuando el turno las tiene; horas normales en cualquier otro caso.
- [ ] Equidad/nómina cuentan las horas reducidas del festivo (verificado vía las horas del registro).
- [ ] El form de `/shifts` permite activar/editar/desactivar el horario de festivo, retrocompatible (turnos sin él intactos).
- [ ] Se combina con el perfil de festivo de Necesidades sin conflicto.
- [ ] `typecheck` + `test` verdes; `/code-review` sin bloqueadores.

## Riesgos

- **Exactitud de horas en nómina:** el descanso de festivo debe contarse bien (por eso campo propio con default 0). Cubierto por el test 1.
- **Cruce de medianoche en horario de festivo nocturno:** `calcDurationHours` ya lo maneja; el test puede incluir un caso nocturno si el turno base es `is_night`.
- **Confusión con la Fase 2:** documentar en CLAUDE.md que "horario de festivo del turno" = solo cambian las horas; "perfil de festivo en Necesidades" = cambia qué se necesita. Son complementarias.
