# Salud del horario — algoritmo + UX más estricto

**Fecha:** 2026-04-27
**Estado:** spec aprobado, pendiente plan
**Scope:** Hacer visible la saturación real del horario y prevenir que se asignen turnos consecutivos que violan la ley laboral colombiana. Alcance único — no decomponer.

## 1. Motivación

Hoy el algoritmo `generateSchedule` tiene 2 pases:
- Pase 1 estricto (rechaza caps contractuales).
- Pase 2 relajado (sólo respeta inviolables — descanso 12h, no doble turno, max horas/día).

Si en Pase 1 nadie es elegible, cae a Pase 2 y asigna a alguien marcando "Extra" en `pending`. El admin nunca ve un slot vacío, pero tampoco se da cuenta de que alguien quedó con 7+ días consecutivos. El cap `consecutive_days` debería ser **inviolable** según el Art. 161 del Código Sustantivo del Trabajo (1 día de descanso obligatorio cada 6 días) — no debería absorberse silenciosamente.

Caso real verificado en prod: en abril 2026 con 3 farmacéuticas para 90 turnos/mes (déficit de ~24 turnos), Valentina Celis quedó con 10 días consecutivos sin que el admin lo viera.

## 2. Cambios al algoritmo (`src/lib/schedule-generator.ts`)

### 2.1. `consecutive_days` inviolable

Mover el chequeo de `tracker.consecutiveDays + 1 > maxConsecutiveDays` de la sección "CONTRACTUAL" a la sección "INVIOLABLES" en `filterCandidates`. Esto significa:
- Pase 1: descarta candidatos con cap.
- Pase 2 (`allowOvertime`): **también** descarta candidatos con cap.

Si en Pase 2 no hay nadie, el slot queda como `no_safe_candidate` warning (ya existe la categoría). El admin lo ve explícitamente en la dialog post-generación.

### 2.2. Scoring penaliza proximidad a caps

Extender `scoreCandidate` para incluir un factor que penalice candidatos cercanos a sus caps:

```ts
// Nuevo: penalización por holgura baja en consecutive_days
const consecutiveSlack = constraints.maxConsecutiveDays - tracker.consecutiveDays;
const consecutiveSlackPenalty = consecutiveSlack <= 1 ? -50 : 0;

// Nuevo: penalización por holgura baja en weekly_hours
const weekHoursUsed = tracker.weeklyHours[week] || 0;
const weekHoursPctUsed = weekHoursUsed / effectiveWeekly;
const weeklyHoursPenalty = weekHoursPctUsed >= 0.85 ? -30 : 0;
```

Esto se suma al score; un candidato cercano a saturarse pesa menos que uno con holgura, prefiriéndose el segundo aunque tenga ligeramente menos affinity por posición secundaria, etc.

### 2.3. Nuevo warning kind: `coverage_gap`

Agregar a `CapExcessKind`/`AutoGenWarning` un nuevo kind:

```ts
| { kind: "coverage_gap"; positionId: string; date: string; shiftTemplateId: string;
    reason: "all_at_cap" | "no_eligible" }
```

Se emite cuando un slot quedó sin cubrir explícitamente porque todos los candidatos elegibles ya estaban en cap inviolable. Distinto de `no_employees_in_position` (no hay nadie con la posición) o `no_safe_candidate` (existe pero falla inviolables como descanso 12h).

## 3. Cambios al UI

### 3.1. Banner sticky en `/schedule`

Cuando el horario activo (mes mostrado, sede mostrada) tenga ≥1 turnos `overtime_status=pending` o ≥1 slots faltantes (warnings persistidos), mostrar un banner sticky arriba de la grilla:

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠ 8 turnos pendientes de aprobación · 3 turnos sin cubrir        │
│   [Revisar →]                                                    │
└──────────────────────────────────────────────────────────────────┘
```

Componente: `<ScheduleHealthBanner />` en `src/components/schedule/`.
Click en "Revisar" abre el dashboard inline (3.3) o navega a `/solicitudes` para los pending.

### 3.2. Dialog post-auto-gen mejorada

Reorganizar `auto-generate-dialog.tsx` sección de resultados (líneas ~681-720). En vez de groupear sólo por `kind`, agregar un sub-resumen al inicio del bloque de resultados:

```
Resultado:
  ✓ 124 turnos asignados sin extras
  ⏱ 12 turnos requieren aprobación de horas extra
  ✗ 5 slots quedaron sin cubrir

Detalles por empleado:
  • Valentina Celis — 5 extras (Días consecutivos)
  • Sara Romero — 2 extras (Horas semana)

Slots sin cubrir:
  • Lun 6 abr · Aux. Farmacia · Mañana
  • Mar 7 abr · Aux. Farmacia · Tarde
  • ...
```

Mantener compatibilidad con la dialog existente; sólo se mejora el rendering del bloque de resultados.

### 3.3. Mini-dashboard "Salud del horario"

Sección expansible en `/schedule` (debajo del header, encima de la grilla, colapsada por default). Componente nuevo `<ScheduleHealthPanel />`. Incluye:

| Métrica | Valor | Visual |
|---|---|---|
| Cobertura sin extras | 124/144 | barra verde 86% |
| Cobertura con extras | 139/144 | barra ámbar 96% |
| Slots faltantes | 5 | número rojo |
| Empleados saturados (≥85% horas semana) | 2 | lista clickeable |
| Empleados con días consecutivos ≥6 (post fix: nadie) | 0 | mostrar "0 — todos respetan descanso semanal" |

Se calcula client-side a partir de los entries del horario activo (sin queries adicionales). El componente recibe `entries: ScheduleEntry[]`, `employees: Profile[]`, `staffingRequirements: StaffingRequirement[]`, `constraints: LaborConstraints` y derive todo.

## 4. Componentes nuevos

| Archivo | Status | Responsabilidad |
|---|---|---|
| `src/lib/schedule-health.ts` | create | helpers puros: `computeHealth(entries, employees, staffing, constraints): HealthSummary` |
| `src/lib/schedule-health.test.ts` | create | tests Vitest (~6 casos) |
| `src/components/schedule/schedule-health-banner.tsx` | create | banner sticky |
| `src/components/schedule/schedule-health-panel.tsx` | create | panel expansible |
| `src/lib/schedule-generator.ts` | modify | mover `consecutive_days` a inviolables, agregar penalización en score, emitir `coverage_gap` warning |
| `src/lib/types.ts` | modify | agregar `coverage_gap` al union `AutoGenWarning` |
| `src/components/schedule/auto-generate-dialog.tsx` | modify | nuevo bloque de resumen + lista de empleados afectados + lista de faltantes |
| `src/app/(authenticated)/schedule/page.tsx` | modify | montar `<ScheduleHealthBanner />` y `<ScheduleHealthPanel />` |
| `src/lib/schedule-generator.test.ts` | modify | nuevos tests para `consecutive_days` inviolable + penalización |

## 5. Tipos nuevos

```ts
// src/lib/schedule-health.ts
export interface HealthSummary {
  totalRequired: number;
  totalAssigned: number;
  totalAssignedNoExtras: number;
  totalPendingExtras: number;
  totalGaps: number;
  saturatedEmployees: Array<{
    employeeId: string;
    name: string;
    weekHoursPct: number;        // 0..1+
    consecutiveDays: number;
    flags: ("near_weekly_cap" | "near_consecutive_cap" | "exceeded")[];
  }>;
  gapsByDay: Array<{ date: string; positionId: string; shiftTemplateId: string }>;
}

export function computeHealth(
  entries: ScheduleEntry[],
  employees: Profile[],
  staffing: StaffingRequirement[],
  constraints: LaborConstraints
): HealthSummary;
```

## 6. Edge cases

| Caso | Comportamiento |
|---|---|
| Mes sin horario generado | Banner oculto, panel muestra "Genera el horario para ver salud". |
| Horario archivado | Banner oculto (sólo aplica a draft/published). |
| Sin staffing requirements para la sede | Panel muestra "Configura necesidades primero" + link a `/necesidades`. |
| Cobertura 100% sin extras | Banner oculto. Panel muestra estado "saludable" en verde. |
| `consecutive_days` inviolable + déficit real de personal | Warnings `coverage_gap` masivos. Panel los muestra agrupados por (posición × turno). El admin sabe exactamente cuántos turnos no se pueden cubrir. |

## 7. Testing

**Vitest**:
- `computeHealth` — 6 casos: vacío, 100% sin extras, mezcla extras+gaps, todos saturados, sólo extras, sólo gaps.
- `generateSchedule` — 2 casos nuevos:
  1. Empleado con 6 días consecutivos + 1 slot el día 7 → no se asigna, queda warning `coverage_gap`.
  2. Tres candidatos donde 2 están al 90% horas semana y 1 está al 50% → el 50% gana por scoring.

Sin tests de UI.

## 8. Deliverables

1. `schedule-generator.ts` con `consecutive_days` inviolable + score penalty + nuevo warning kind.
2. `schedule-health.ts` + tests Vitest.
3. 2 componentes UI: banner + panel.
4. Modificación de `auto-generate-dialog.tsx` (bloque de resumen).
5. Mount en `/schedule/page.tsx`.
6. CLAUDE.md actualizado con la lógica de `coverage_gap` y la sección "Salud del horario".

## 9. No incluido (fuera de scope)

- Sugerencias automáticas tipo "contratá X personas más para cerrar el gap" — interesante pero requiere modelo predictivo, lo dejamos para después.
- Notificaciones push / email cuando aparece un gap — el banner alcanza por ahora.
- Re-asignar manualmente desde el panel de salud (drag & drop) — se hace desde la grilla normal.
- Política de descanso obligatorio configurable por empresa (ahora `maxConsecutiveDays = 6` global) — futuro si algún cliente requiere otra cifra.
