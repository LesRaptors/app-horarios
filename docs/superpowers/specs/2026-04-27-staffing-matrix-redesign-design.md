# Rediseño de la matriz de necesidades (`/necesidades`) — Fase A

**Fecha:** 2026-04-27
**Estado:** spec aprobado, pendiente plan de implementación
**Scope:** Fase A del rediseño. Fase B (overrides por fecha + heatmap diferencial vs realidad) queda diferida y será un spec aparte.

## 1. Objetivo

Mejorar la UX de la matriz de necesidades de personal en `/necesidades` (alias en sidebar de `/staffing`), atacando los 3 pain points que el cliente identificó:

1. **Escala** — con muchos turnos × posiciones × 7 días, la página actual tiene mucho scroll vertical.
2. **Repetitividad** — definir el mismo número en L–V es tedioso.
3. **Falta de contexto** — al definir el número, el admin no sabe si es realista (cuánta gente tiene, cuánto ha logrado cubrir en la práctica).

Adicionalmente: arreglar el bug de race condition del delete-all-then-insert en el guardado actual.

## 2. Audiencia

- Admin de la organización: edita necesidades en cualquier sede.
- Manager: edita necesidades solo de su sede (RLS ya gobierna esto).
- Empleado: no entra a esta página.

## 3. Decisiones del brainstorming (resumen)

- **Layout:** 3 tabs alternos sobre los mismos datos: **Por turno**, **Por posición**, **Heatmap demanda**.
- **Modelo semanal:** se mantienen las 7 columnas de día (sin patrón L–V/S/D); el alivio para la repetitividad va por copy-paste.
- **Contexto al lado del input:** capacidad teórica (cuenta de empleados con esa posición en la sede) + sparkline pequeño con la cobertura real reciente (últimas 4 semanas).
- **Overrides por fecha:** *fuera de scope en Fase A.* Quedan para Fase B.
- **Heatmap (Fase A):** colorea por demanda absoluta. La variante "diferencial vs realidad" llega en Fase B.

## 4. Cambios al data model (migración 032)

```sql
-- 032_staffing_audit.sql
ALTER TABLE staffing_requirements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION touch_staffing_requirements()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_staffing_requirements
  BEFORE UPDATE ON staffing_requirements
  FOR EACH ROW EXECUTE FUNCTION touch_staffing_requirements();
```

No cambios a RLS — el patrón existente sigue cubriendo (admin escribe cualquiera; manager su sede).

## 5. RPC `save_staffing_diff`

```sql
CREATE OR REPLACE FUNCTION save_staffing_diff(
  p_location_id UUID,
  p_rows JSONB  -- [{position_id, shift_template_id, day_of_week, required_count}]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inserted_count INT := 0;
  updated_count INT := 0;
  deleted_count INT := 0;
  user_id UUID := auth.uid();
BEGIN
  -- Permission gate (admin o manager con location coincidente).
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Tabla temporal con el desired state.
  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count
  FROM jsonb_array_elements(p_rows) r;

  -- DELETE: filas existentes no presentes en el desired (o presentes con count=0).
  WITH del AS (
    DELETE FROM staffing_requirements sr
     WHERE sr.location_id = p_location_id
       AND NOT EXISTS (
         SELECT 1 FROM _desired d
          WHERE d.position_id = sr.position_id
            AND d.shift_template_id = sr.shift_template_id
            AND d.day_of_week = sr.day_of_week
            AND d.required_count > 0
       )
     RETURNING 1
  ) SELECT count(*) INTO deleted_count FROM del;

  -- UPSERT: filas con count > 0.
  WITH ups AS (
    INSERT INTO staffing_requirements
      (location_id, position_id, shift_template_id, day_of_week, required_count, updated_by)
    SELECT p_location_id, position_id, shift_template_id, day_of_week, required_count, user_id
      FROM _desired WHERE required_count > 0
    ON CONFLICT (location_id, position_id, shift_template_id, day_of_week)
    DO UPDATE SET
      required_count = EXCLUDED.required_count,
      updated_by = user_id
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO inserted_count, updated_count
  FROM ups;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'deleted', deleted_count
  );
END;
$$;
```

Notas:

- `SECURITY DEFINER` para que el cliente pueda llamarla sin necesidad de privilegios directos en la tabla.
- La unique constraint `(location_id, position_id, shift_template_id, day_of_week)` que ya existe (migración 006) hace funcionar el `ON CONFLICT`.
- Toda la operación corre dentro de la transacción implícita de la función → atomicidad gratis.

## 6. Componentes UI

Estructura nueva en `src/components/staffing/`:

| Componente | Responsabilidad |
|---|---|
| `StaffingMatrix` (orquestador) | Header con selector de sede + tabs + estado `draft` + acciones globales (Guardar / Descartar). |
| `StaffingTabByShift` | Una `<Card>` por turno (colapsable). Dentro: tabla posición × 7 días. |
| `StaffingTabByPosition` | Una `<Card>` por posición. Dentro: tabla turno × 7 días. |
| `StaffingTabHeatmap` | Una sola tabla densa: filas = (turno × posición), 7 columnas. Cada celda colorea por demanda absoluta. |
| `StaffingCell` | Átomo editable. Props: `value`, `capacity`, `recentCoverage: number[]`, `onChange`. |
| `Sparkline` | Componente puro SVG. Recibe `number[]` y un alto fijo. Sin dependencias nuevas. |
| `RowCopyMenu` / `ColumnCopyMenu` | Menús contextuales en cabecera de fila/columna con atajos de replicación. |

Reusos: `Tabs`, `Card`, `Tooltip`, `DropdownMenu`, `Badge` de shadcn (todos ya están).

## 7. Hook `useStaffingMatrix(locationId)`

Dispara 5 queries en paralelo:

1. `staffing_requirements` (filtrado por `location_id`).
2. `positions` (filtrado por `location_id` vía join con `departments`).
3. `shift_templates` (filtrado por `location_id`).
4. **Capacidad teórica:** cuenta de `profiles` activos por `position_id` en esa sede. Incluye posición primaria + posiciones secundarias (`employee_secondary_positions`).
5. **Cobertura real reciente:** agregado de `schedule_entries` de las últimas 4 semanas, agrupado por `(position_id, shift_template_id, day_of_week)`, devuelve un mapa `key → number[4]` (uno por semana).

Retorna:
```ts
{
  loading: boolean;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  persisted: Record<CellKey, number>;        // valores en BD
  capacity: Record<UUID, number>;             // cuenta empleados por position_id
  recentCoverage: Record<CellKey, number[]>;  // [w-3, w-2, w-1, w0]
  refetch: () => void;
}

type CellKey = `${UUID}|${UUID}|${number}`; // position|shift|dayOfWeek
```

## 8. Edición y persistencia (data flow)

- `StaffingMatrix` mantiene `draft: Record<CellKey, number>` con celdas modificadas.
- Cada `StaffingCell` lee `draft[key] ?? persisted[key] ?? 0`.
- Header sticky muestra badge "N cambios sin guardar" cuando `Object.keys(draft).length > 0`.
- **Guardar:** llama `supabase.rpc('save_staffing_diff', { p_location_id, p_rows })` con todas las celdas (no solo el draft — el desired state es la matriz completa). Tras éxito: refetch + clear draft + toast "N celdas actualizadas (X nuevas, Y modificadas, Z borradas)".
- **Descartar:** confirm modal y limpia `draft`.
- **Cambio de sede con `draft` sucio:** confirm modal "Tienes N cambios sin guardar — ¿descartar?".

### Atajos de copy/replicate

Todos modifican `draft` localmente sin disparar la RPC:

- **Replicar L → M-V** (en cabecera de columna L): copia el valor de cada celda con `day_of_week=1` a `day_of_week ∈ [2,3,4,5]` para todas las (posición × turno) visibles en el tab actual.
- **Replicar este día a toda la semana** (en cualquier cabecera de día): copia ese día a los otros 6.
- **Copiar este turno completo a otro turno** (en cabecera del turno en tab "Por turno"): selecciona el turno de destino vía dropdown.
- **Replicar fila** (en cabecera de fila de posición): copia el valor del primer día con dato a los días vacíos de esa fila.

Helpers puros (testables):

```ts
function diffStaffing(
  persisted: Record<CellKey, number>,
  desired: Record<CellKey, number>
): { inserts: Cell[]; updates: Cell[]; deletes: Cell[] };

function replicateAcrossDays(
  draft: Record<CellKey, number>,
  sourceDay: number,
  targetDays: number[],
  scope: { positionIds: UUID[]; shiftTemplateIds: UUID[] }
): Record<CellKey, number>;

function replicateShiftToShift(
  draft: Record<CellKey, number>,
  sourceShiftId: UUID,
  targetShiftId: UUID,
  scope: { positionIds: UUID[] }
): Record<CellKey, number>;
```

## 9. Errores y edge cases

| Caso | Comportamiento |
|---|---|
| Capacidad teórica = 0 | Badge `·0` en rojo + banda ámbar "Sin empleados con esta posición". No bloquea guardar. |
| Demanda > capacidad | Banda ámbar "Excede capacidad teórica (N)". No bloquea. |
| Sparkline sin datos | Oculto, se muestra `—` mudo. |
| Sede sin posiciones o sin turnos | Empty state con CTA a `/positions` o `/shifts`. |
| RPC falla | Toast de error crudo. `draft` intacto para reintentar. |
| Race entre 2 admins | Last-write-wins por celda. `updated_by`/`updated_at` deja huella. |
| Cambio de sede con draft sucio | Confirm modal. |

Sin lock optimista (`version` column) — la fricción no compensa para esta pantalla.

## 10. Testing

**Vitest (pure logic):**
- `diffStaffing` — 5 tests (sin cambios, solo inserts, solo updates, solo deletes, mezcla).
- `replicateAcrossDays` — 3 tests (un día → muchos, override de valor existente, scope filtra).
- `replicateShiftToShift` — 2 tests (turno con celdas → vacío, turno con celdas → con celdas).

**SQL test** en `supabase/tests/save_staffing_diff_test.sql`:
- Pre-poblar 3 rows manualmente.
- Llamar la RPC con payload que actualice 1, borre 1 e inserte 1.
- Asertar conteo final + que `updated_by` se llenó + que la RPC retornó `{inserted:1, updated:1, deleted:1}`.
- Patrón `BEGIN ... ROLLBACK`.

**Sin tests de componentes** (consistente con el resto del repo).

**Smoke manual:**
- Abrir `/necesidades` como admin, editar 3 celdas en tab "Por turno", guardar, recargar, validar persistencia.
- Replicar lunes a M-V, guardar, validar.
- Cambiar a tab "Heatmap demanda", validar coloreado.
- Verificar `updated_by` en la BD apunta al admin.

## 11. Sidebar y rutas

- Sidebar item ya existe (`/staffing` con label "Necesidades"). Sin cambios.
- Página: `src/app/(authenticated)/staffing/page.tsx` (modificar — el wrapper queda; toda la matriz pasa al nuevo orquestador).

## 12. Entregables

1. Migración `032_staffing_audit.sql` + RPC `save_staffing_diff`.
2. Componentes nuevos en `src/components/staffing/` (7 archivos).
3. Helpers puros en `src/lib/staffing-helpers.ts` + tests Vitest.
4. SQL test en `supabase/tests/save_staffing_diff_test.sql`.
5. Página `src/app/(authenticated)/staffing/page.tsx` actualizada.
6. CLAUDE.md actualizado con la sección de `/necesidades` y la RPC.

## 13. Diferido a Fase B

- Tabla `staffing_overrides (location_id, date, position_id, shift_template_id, required_count)` con UNIQUE (location_id, date, position_id, shift_template_id).
- UI para crear/editar overrides desde la matriz (modal "agregar excepción para una fecha específica").
- Tab "Heatmap" cambia de "demanda absoluta" a "diferencial vs realidad" usando `schedule_entries` reales.
- Multiplicador semanal (Black Friday, etc.) — c) no fue elegido en Fase A, pero queda anotado.
