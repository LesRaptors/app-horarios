# Spec — Resolver las 2 limitaciones del horario de festivos

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feature/holiday-limitations`

## Contexto y motivación

El feature "horario especial en festivos por turno" (mergeado en `796b800`) dejó dos limitaciones documentadas en CLAUDE.md. El usuario pidió resolverlas.

**Hallazgo que acota la #2:** el salario base de la nómina NO depende de las horas — se prorratea por días calendario (convención 30 días, `payroll-engine.ts` Stage 2). Las horas solo generan **recargos** (nocturno 35%, dominical, festivo) y **horas extra**. Por eso "contar horas laboradas netas" afecta únicamente los recargos pagados y el `total_hours` de equidad; el sueldo base no se mueve.

## Decisiones cerradas

- **Limitación 1:** aviso diagnóstico en la generación (no validación en el form, que no conoce el contrato de cada empleado).
- **Limitación 2:** horas laboradas = rango − descanso (netas). El descanso se descuenta **de las horas de menor recargo primero** (ordinaria → nocturna → dominical → festiva). Confirmado con el usuario.
- **Retrocompatibilidad:** el descanso persistido en el entry es nullable; históricos NULL = 0 descuento (comportamiento bruto actual), desacopla el deploy (igual que `is_night`/`063`).
- No hay nómina electrónica DIAN; el impacto de la #2 es interno (pago neto, provisiones, costo empleador).

## Fuera de alcance

- Cambiar el salario base (es por días, correcto).
- Detectar horas extra automáticamente (siguen marcándose con `overtime_status='approved'`).
- Restar el descanso a turnos donde el descanso cae en horas ordinarias sin recargo → el pago no cambia (solo la equidad); es el comportamiento correcto, no un caso especial.

---

## Parte 1 — Aviso de turno de festivo sin cubrir por exceder el tope diario

**Problema:** si el horario de festivo de un turno (`slot.durationHours`, ya neto del descanso) supera el tope diario del contrato (`dayCap`), el inviolable `if (slot.durationHours > dayCap) continue;` (`schedule-generator.ts:314`) filtra a todos los candidatos en ambos pases. El turno queda sin cubrir con un warning genérico (`no_safe_candidate`/`coverage_gap`) que no explica la causa.

**Solución:** un warning específico.

### Pieza 1.1 — Nuevo tipo de warning (`src/lib/types.ts`)
Agregar al union `AutoGenWarning`:
```ts
| { kind: "holiday_hours_exceed_cap"; positionId: string; date: string; shiftTemplateId: string; holidayHours: number; maxDayCap: number }
```

### Pieza 1.2 — Emisión en el motor (`src/lib/schedule-generator.ts`)
Cuando un slot queda sin candidato safe (ambos pases vacíos), antes de emitir `no_safe_candidate`/`coverage_gap`, comprobar: si el slot corre en un festivo con horario de festivo aplicado (`isHolidayDate` y el turno tiene `holiday_start_time`) **y** `slot.durationHours` excede el `dayCap` de **todos** los candidatos elegibles de esa posición (i.e. `slot.durationHours > maxDayCap`, donde `maxDayCap` = el tope diario más alto entre los empleados candidatos de la posición — `is_healthcare?12 : (contract.max_hours_per_day ?? constraints.maxHoursPerDay)`), emitir `holiday_hours_exceed_cap` con `holidayHours = slot.durationHours` y `maxDayCap`. Este warning reemplaza al genérico para ese slot (no ambos).

- Si `maxDayCap` no se puede exceder por nadie, el diagnóstico es certero. Si el slot quedó sin cubrir por otra razón (descanso, días consecutivos), se emite el warning genérico como hoy.

### Pieza 1.3 — Mensaje en el diálogo (`src/components/schedule/auto-generate-dialog.tsx`)
En el agrupador de warnings, agregar el caso `holiday_hours_exceed_cap` con un mensaje claro en español, p. ej.: *"El horario de festivo de {posición} ({holidayHours} h) supera el tope diario del contrato ({maxDayCap} h), así que nadie puede cubrirlo en festivos. Reducí el horario de festivo del turno."* Con acción/enlace al turno si el patrón existente lo permite.

### Tests (Parte 1)
Vitest en `schedule-generator.test.ts`: un turno diurno con horario de festivo de 11h, contrato con `max_hours_per_day=10`, en un festivo con demanda → el resultado NO asigna el slot **y** `result.warnings` contiene `holiday_hours_exceed_cap` con `holidayHours=11`, `maxDayCap=10`. Control: horario de festivo de 8h → se asigna (sin warning).

---

## Parte 2 — Horas laboradas netas (descontar el descanso)

El descanso efectivo del turno se persiste en el entry y se descuenta en la equidad y en los recargos de nómina.

### Pieza 2.1 — Persistir el descanso en el entry (migración `064_schedule_entry_break_minutes.sql`)
```sql
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS break_minutes integer;
```
- Nullable. NULL = "la app no computó el descanso" → 0 descuento (histórico/bruto). Sin backfill.
- Reescribir `recompute_equity_rollup` (usar la versión VIGENTE en cloud — la de `063` con el `COALESCE(se.is_night, st.is_night)` — verificarla con `pg_get_functiondef` antes de reescribir) para restar el descanso en `total_hours`:
```sql
COALESCE(SUM(
  EXTRACT(EPOCH FROM (
    (se.date + se.end_time) +
      CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
    - (se.date + se.start_time)
  )) / 3600
  - COALESCE(se.break_minutes, 0) / 60.0
), 0)::NUMERIC(6,2)
```
  `COALESCE(se.break_minutes, 0)` → históricos NULL restan 0 (retrocompatible).
- Test SQL (`supabase/tests/064_...`): columna existe (integer nullable) + el trigger contiene `COALESCE(se.break_minutes, 0)`. Patrón `BEGIN...ROLLBACK`.
- Regenerar `database.types.ts`; agregar `break_minutes: number | null` a `ScheduleEntry` en `types.ts`.

### Pieza 2.2 — Motor y diálogo escriben el descanso
- **Motor** (`schedule-generator.ts`): el entry de salida incluye `break_minutes: slot.breakMinutes` (ya existe en `DemandSlot`, computado por `effectiveShiftHours`, e incluye `holiday_break_minutes`).
- **Diálogo manual** (`schedule/page.tsx` onSave, insert y update): `break_minutes` = `effectiveShiftHours(tpl, dialogIsHolidayDate).breakMinutes` cuando hay plantilla; `0` cuando es turno manual sin plantilla (no hay descanso definido para horas manuales).
- El insert batch del auto-generate (`auto-generate-dialog.tsx`, spread `{...e}`) propaga `break_minutes` sin cambio (confirmar).
- Cascada de tipos: los literales `ScheduleEntry` de test agregan `break_minutes` (null, o el valor que el test amerite).

### Pieza 2.3 — Nómina descuenta el descanso (regla: menor recargo primero)
En `payroll-engine.ts`, tanto `computeSurcharges` (Stage 4, ~L311) como `computeOvertime` (Stage 5, ~L402):

1. Al recorrer las horas del entry (`decomposeEntryIntoHours` sigue produciendo horas enteras), además de `nightHours`/`sundayHours`/`holidayHours`, contar `ordinaryHours` = horas sin ningún recargo (`!isNight && !isSunday && !isHol`). (En overtime, el equivalente por bucket.)
2. Tras el bucle, `breakHours = (entry.break_minutes ?? 0) / 60`.
3. Descontar `breakHours` **en orden de menor recargo**: primero de `ordinaryHours`, luego del bucket de menor porcentaje de recargo, y así sucesivamente, propagando el remanente (`deduct`), sin bajar de 0:
   - orden: ordinaria → nocturna (0.35) → dominical (`cfg.sunday_surcharge_pct`) → festiva (`cfg.holiday_surcharge_pct`). Si dos porcentajes empatan, el orden entre ellos es indiferente.
   - Los buckets resultantes son fraccionarios (son `number`); las fórmulas `Math.round(bucket × VH × pct)` ya los aceptan.
4. Descontar de `ordinaryHours` no afecta el pago (no hay pago por hora ordinaria; el base es por día) — solo el remanente que cae en buckets con recargo cambia montos. Esto cumple el ejemplo: turno festivo íntegro 12h con 30 min → `holidayHours` 11.5; turno diurno normal → el descanso sale de ordinarias, el pago no cambia.

- Extraer la lógica de descuento a un helper puro y testeable (p. ej. `deductBreakFromBuckets(buckets, breakHours)` en `payroll-engine-helpers.ts`), con orden de prioridad explícito, para poder testearla aislada.
- `break_minutes` llega al engine vía `entry.break_minutes` (nuevo campo en el `schedule_entries` que el engine ya recibe). No hace falta leer el template.

### Tests (Parte 2)
- **Helper `deductBreakFromBuckets`** (unit, `payroll-engine-helpers.test.ts`): descuenta de ordinaria primero; si el break excede ordinaria, del menor recargo; nunca baja de 0; break 0 → sin cambio.
- **`computeSurcharges`/`computeOvertime`**: un turno festivo 12h con `break_minutes=30` → `holidayHours` efectivas 11.5 → monto = `Math.round(11.5 × VH × pct)`. Un turno diurno 8h con `break_minutes=60` → recargos sin cambio (el descuento sale de ordinarias).
- Actualizar los ~10 tests de montos existentes que usen entries con descanso (la mayoría de fixtures no tienen descanso → `break_minutes` null/ausente → 0 descuento → intactos).
- **Trigger SQL** (opcional funcional): insertar un entry con `break_minutes` y verificar `total_hours` neto en el rollup.

---

## Validación

- Flujo `/superpowers`: spec → plan → subagent-driven → `/code-review` de rama.
- Reviewers especializados: `migration-reviewer` (migración 064 + trigger, verificar versión vigente), `schedule-algorithm-reviewer` (warning + break en el motor), **`security-reviewer`** (superficie de nómina — el cambio toca montos pagados).
- `npm run typecheck` y `npm run test` verdes.

## Criterios de éxito

- [ ] Turno de festivo que excede el tope diario → warning `holiday_hours_exceed_cap` claro en la generación; no bloquea otros turnos.
- [ ] `schedule_entries.break_minutes` persiste el descanso efectivo (migración 064); motor y diálogo lo escriben; retrocompatible (NULL → 0).
- [ ] Equidad `total_hours` resta el descanso.
- [ ] Nómina paga los recargos sobre horas netas, descontando el descanso de menor recargo primero; el sueldo base no cambia.
- [ ] Tests de nómina actualizados; `typecheck` + `test` verdes; `/code-review` y `security-reviewer` sin bloqueadores.

## Riesgos

- **Nómina = dinero.** Cambiar el conteo de horas afecta montos internos (IBC, deducciones, provisiones, costo empleador). Mitigación: helper de descuento aislado + tests + `security-reviewer`. No hay salida DIAN.
- **Coordinación de deploy** (como en `063`): la columna nullable + el `COALESCE` en el trigger hacen la migración 064 segura de aplicar antes que el código. La nómina lee `entry.break_minutes ?? 0`, así que con históricos NULL descuenta 0 (bruto) hasta que los nuevos entries persistan el descanso.
- **Regla de descuento en turnos mixtos** (cruzan diurno/nocturno): la regla "menor recargo primero" es determinista y justa; cubierta por tests del helper.
