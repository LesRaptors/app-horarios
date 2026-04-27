# Staffing Matrix Redesign (Fase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox `- [ ]` syntax.

**Goal:** Implementar el rediseño de `/necesidades` Fase A — 3 tabs (Por turno, Por posición, Heatmap demanda), capacidad teórica + sparkline por celda, copy-paste, audit (`updated_by`), y RPC `save_staffing_diff` que reemplaza el delete-all-then-insert con un diff atómico.

**Architecture:** El orquestador `<StaffingMatrix />` carga datos vía hook `useStaffingMatrix(locationId)` (5 queries paralelas), mantiene `draft` local, y persiste vía RPC `save_staffing_diff` (idempotente, transaccional). Las 3 tabs comparten el mismo estado y reciben helpers de copy-paste para mutar `draft`. Helpers puros con TDD para `diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind v3, shadcn/ui (Tabs, Card, Tooltip, DropdownMenu, Badge), Supabase (Postgres + RLS), Vitest. Sin nuevas dependencias.

**Convención de keys:** `CellKey = "${positionId}|${shiftTemplateId}|${dayOfWeek}"` (pipe separator).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/032_staffing_audit.sql` | create | `updated_by` column + RPC `save_staffing_diff` |
| `supabase/tests/save_staffing_diff_test.sql` | create | SQL test del diff (BEGIN/ROLLBACK) |
| `src/lib/staffing-helpers.ts` | create | helpers puros: `diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift`, `makeCellKey`, `parseCellKey` |
| `src/lib/staffing-helpers.test.ts` | create | tests Vitest |
| `src/components/ui/sparkline.tsx` | create | componente puro SVG |
| `src/components/staffing/staffing-cell.tsx` | create | átomo editable: input + capacidad + sparkline + bandas |
| `src/components/staffing/staffing-tab-by-shift.tsx` | create | tab 1 — Card por turno con tabla posición × 7 días |
| `src/components/staffing/staffing-tab-by-position.tsx` | create | tab 2 — Card por posición con tabla turno × 7 días |
| `src/components/staffing/staffing-tab-heatmap.tsx` | create | tab 3 — tabla densa coloreada por demanda absoluta |
| `src/hooks/use-staffing-matrix.ts` | create | 5 queries paralelas, retorna persisted/capacity/recentCoverage |
| `src/components/staffing/staffing-matrix.tsx` | rewrite | orquestador: header + tabs + draft + Guardar/Descartar |
| `src/app/(authenticated)/staffing/page.tsx` | modify | mantiene auth gate; actualiza llamada al orquestador (props simplificados; el hook hace el fetch) |
| `src/lib/types.ts` | modify | agregar `updated_by` y `updated_at` opcionales en `StaffingRequirement` |
| `CLAUDE.md` | modify | sección breve sobre `/necesidades` y la RPC |

---

## Convention reminders

- **Spanish UI**, normalized accents (más, días, posición, retención).
- **No emojis** en source files; usar lucide icons.
- TDD estricto para los helpers puros (write failing test → run FAIL → implement → run PASS → commit).
- `npm run build && npm run test` antes de cada commit. Nunca declarar DONE sin verificar.
- Migración: `mcp__plugin_supabase_supabase__apply_migration` (project_id `ugkvuinkynvtuiutwlkd`). Escribir el SQL también a `supabase/migrations/032_*.sql` para mantener el repo en sync.
- SQL tests: `mcp__plugin_supabase_supabase__execute_sql` para verificación.
- `updated_at` + trigger `set_updated_at` ya existen en `staffing_requirements` (migración 006). NO recrearlos.
- La unique constraint `(location_id, position_id, shift_template_id, day_of_week)` ya existe (migración 006:49). El `ON CONFLICT` de la RPC depende de ella.

---

## Task 1: Migración 032 + RPC save_staffing_diff

**Files:**
- Create: `supabase/migrations/032_staffing_audit.sql`

- [ ] **Step 1: Escribir el SQL**

```sql
-- Migración 032: audit en staffing_requirements + RPC save_staffing_diff.

-- 1. Audit column. updated_at + trigger ya existen (migración 006).
ALTER TABLE staffing_requirements
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. RPC: aplica un diff atómico contra el desired state.
CREATE OR REPLACE FUNCTION save_staffing_diff(
  p_location_id UUID,
  p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT := 0;
  updated_count INT := 0;
  deleted_count INT := 0;
  user_id UUID := auth.uid();
BEGIN
  -- Permission gate.
  IF NOT (
    get_user_role() = 'admin' OR
    (get_user_role() = 'manager' AND get_user_location_id() = p_location_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Desired state en tabla temporal.
  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT
    (r->>'position_id')::UUID AS position_id,
    (r->>'shift_template_id')::UUID AS shift_template_id,
    (r->>'day_of_week')::INT AS day_of_week,
    (r->>'required_count')::INT AS required_count
  FROM jsonb_array_elements(p_rows) r;

  -- DELETE: filas existentes que no estan en el desired (o estan con count=0).
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

  -- UPSERT: count > 0.
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

GRANT EXECUTE ON FUNCTION save_staffing_diff(UUID, JSONB) TO authenticated;
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Tool: `mcp__plugin_supabase_supabase__apply_migration`. Args: name=`032_staffing_audit`, project_id=`ugkvuinkynvtuiutwlkd`.

- [ ] **Step 3: Verificar**

Run via `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name='staffing_requirements' AND column_name='updated_by';
SELECT proname FROM pg_proc WHERE proname='save_staffing_diff';
```

Expected: `updated_by` presente, `save_staffing_diff` listada.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/032_staffing_audit.sql
git commit -m "feat(staffing): mig 032 — updated_by + RPC save_staffing_diff"
```

---

## Task 2: Helpers puros con TDD (`diffStaffing`, `replicateAcrossDays`, `replicateShiftToShift`)

**Files:**
- Create: `src/lib/staffing-helpers.ts`
- Create: `src/lib/staffing-helpers.test.ts`

- [ ] **Step 1: Escribir los tests fallando**

Crear `src/lib/staffing-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  diffStaffing,
  replicateAcrossDays,
  replicateShiftToShift,
  makeCellKey,
} from "./staffing-helpers";

const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";

describe("makeCellKey", () => {
  it("usa pipe como separador", () => {
    expect(makeCellKey(P1, S1, 1)).toBe(`${P1}|${S1}|1`);
  });
});

describe("diffStaffing", () => {
  it("sin cambios — todo vacío", () => {
    expect(diffStaffing({}, {})).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  it("solo inserts: persisted vacío, desired con valores > 0", () => {
    const desired = { [makeCellKey(P1, S1, 1)]: 3 };
    const r = diffStaffing({}, desired);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0]).toEqual({ position_id: P1, shift_template_id: S1, day_of_week: 1, required_count: 3 });
    expect(r.updates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo updates: misma key con distinto valor", () => {
    const persisted = { [makeCellKey(P1, S1, 1)]: 2 };
    const desired = { [makeCellKey(P1, S1, 1)]: 5 };
    const r = diffStaffing(persisted, desired);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].required_count).toBe(5);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo deletes: persisted con valor, desired = 0 o ausente", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1)]: 2,
      [makeCellKey(P2, S1, 2)]: 4,
    };
    const desired = { [makeCellKey(P1, S1, 1)]: 0 };  // 0 = delete
    const r = diffStaffing(persisted, desired);
    expect(r.deletes).toHaveLength(2);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(0);
  });

  it("mezcla insert + update + delete + sin cambio", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1)]: 3,  // sin cambio
      [makeCellKey(P1, S1, 2)]: 4,  // se borra
      [makeCellKey(P2, S1, 1)]: 1,  // se actualiza
    };
    const desired = {
      [makeCellKey(P1, S1, 1)]: 3,  // sin cambio
      [makeCellKey(P2, S1, 1)]: 5,  // update
      [makeCellKey(P1, S2, 3)]: 2,  // insert
    };
    const r = diffStaffing(persisted, desired);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].required_count).toBe(2);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].required_count).toBe(5);
    expect(r.deletes).toHaveLength(1);
    expect(r.deletes[0].day_of_week).toBe(2);
  });
});

describe("replicateAcrossDays", () => {
  const scope = { positionIds: [P1, P2], shiftTemplateIds: [S1] };

  it("copia day=1 (lunes) a [2,3,4,5] (martes-viernes)", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P2, S1, 1)]: 3,
    };
    const out = replicateAcrossDays(draft, 1, [2, 3, 4, 5], scope);
    expect(out[makeCellKey(P1, S1, 2)]).toBe(4);
    expect(out[makeCellKey(P1, S1, 5)]).toBe(4);
    expect(out[makeCellKey(P2, S1, 3)]).toBe(3);
    // No tocar el original
    expect(out[makeCellKey(P1, S1, 1)]).toBe(4);
  });

  it("override de valores existentes en target days", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S1, 2)]: 99,  // este se sobrescribe
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P1, S1, 2)]).toBe(4);
  });

  it("scope filtra: ignora posiciones fuera del scope", () => {
    const P3 = "00000000-0000-0000-0000-000000000003";
    const draft = {
      [makeCellKey(P3, S1, 1)]: 7,  // fuera del scope
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P3, S1, 2)]).toBeUndefined();
  });
});

describe("replicateShiftToShift", () => {
  const scope = { positionIds: [P1, P2] };

  it("copia todas las celdas de S1 a S2 manteniendo position+day", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S1, 2)]: 5,
      [makeCellKey(P2, S1, 3)]: 1,
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1)]).toBe(4);
    expect(out[makeCellKey(P1, S2, 2)]).toBe(5);
    expect(out[makeCellKey(P2, S2, 3)]).toBe(1);
    // Original sin tocar
    expect(out[makeCellKey(P1, S1, 1)]).toBe(4);
  });

  it("override de celdas existentes en S2", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S2, 1)]: 99,  // se sobrescribe
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1)]).toBe(4);
  });
});
```

- [ ] **Step 2: Verificar FAIL**

Run: `npm run test -- staffing-helpers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar helpers**

Crear `src/lib/staffing-helpers.ts`:

```ts
export interface StaffingCell {
  position_id: string;
  shift_template_id: string;
  day_of_week: number;
  required_count: number;
}

export type CellKey = string;  // "positionId|shiftTemplateId|dayOfWeek"

export function makeCellKey(
  positionId: string,
  shiftTemplateId: string,
  dayOfWeek: number
): CellKey {
  return `${positionId}|${shiftTemplateId}|${dayOfWeek}`;
}

export function parseCellKey(key: CellKey): {
  position_id: string;
  shift_template_id: string;
  day_of_week: number;
} {
  const [position_id, shift_template_id, dayStr] = key.split("|");
  return {
    position_id,
    shift_template_id,
    day_of_week: Number(dayStr),
  };
}

export interface DiffResult {
  inserts: StaffingCell[];
  updates: StaffingCell[];
  deletes: StaffingCell[];
}

export function diffStaffing(
  persisted: Record<CellKey, number>,
  desired: Record<CellKey, number>
): DiffResult {
  const inserts: StaffingCell[] = [];
  const updates: StaffingCell[] = [];
  const deletes: StaffingCell[] = [];

  // Insert / update / sin-cambio: iterar sobre desired.
  for (const [key, value] of Object.entries(desired)) {
    if (value <= 0) continue;  // 0 no se inserta — se trata como delete abajo si existe
    const prev = persisted[key];
    const cell = { ...parseCellKey(key), required_count: value };
    if (prev === undefined) {
      inserts.push(cell);
    } else if (prev !== value) {
      updates.push(cell);
    }
  }

  // Delete: iterar sobre persisted que no estan en desired o estan con value <= 0.
  for (const [key, prev] of Object.entries(persisted)) {
    const desiredValue = desired[key];
    if (desiredValue === undefined || desiredValue <= 0) {
      deletes.push({ ...parseCellKey(key), required_count: prev });
    }
  }

  return { inserts, updates, deletes };
}

export function replicateAcrossDays(
  draft: Record<CellKey, number>,
  sourceDay: number,
  targetDays: number[],
  scope: { positionIds: string[]; shiftTemplateIds: string[] }
): Record<CellKey, number> {
  const out: Record<CellKey, number> = { ...draft };
  for (const positionId of scope.positionIds) {
    for (const shiftTemplateId of scope.shiftTemplateIds) {
      const sourceKey = makeCellKey(positionId, shiftTemplateId, sourceDay);
      const sourceValue = draft[sourceKey];
      if (sourceValue === undefined) continue;
      for (const targetDay of targetDays) {
        out[makeCellKey(positionId, shiftTemplateId, targetDay)] = sourceValue;
      }
    }
  }
  return out;
}

export function replicateShiftToShift(
  draft: Record<CellKey, number>,
  sourceShiftId: string,
  targetShiftId: string,
  scope: { positionIds: string[] }
): Record<CellKey, number> {
  const out: Record<CellKey, number> = { ...draft };
  for (const [key, value] of Object.entries(draft)) {
    const parsed = parseCellKey(key);
    if (parsed.shift_template_id !== sourceShiftId) continue;
    if (!scope.positionIds.includes(parsed.position_id)) continue;
    out[makeCellKey(parsed.position_id, targetShiftId, parsed.day_of_week)] = value;
  }
  return out;
}
```

- [ ] **Step 4: Verificar PASS**

Run: `npm run test -- staffing-helpers`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/staffing-helpers.ts src/lib/staffing-helpers.test.ts
git commit -m "feat(staffing): helpers puros — diffStaffing, replicate (12 tests)"
```

---

## Task 3: SQL test del RPC

**Files:**
- Create: `supabase/tests/save_staffing_diff_test.sql`

- [ ] **Step 1: Escribir el test**

Crear `supabase/tests/save_staffing_diff_test.sql`:

```sql
-- Test: save_staffing_diff aplica diff correctamente y setea updated_by.
-- Patrón BEGIN/ROLLBACK para no afectar datos reales.

BEGIN;

-- Setup: tomar IDs reales existentes (admin profile + 1 location + 2 positions + 1 shift template).
-- Si tu DB de prueba está vacía, deberías crear un seed antes; aquí asumimos data básica.
DO $$
DECLARE
  v_admin_id UUID;
  v_location_id UUID;
  v_pos1 UUID;
  v_pos2 UUID;
  v_shift UUID;
  v_result JSONB;
  v_count INT;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_location_id FROM locations LIMIT 1;
  SELECT id INTO v_pos1 FROM positions p JOIN departments d ON d.id = p.department_id WHERE d.location_id = v_location_id LIMIT 1;
  SELECT id INTO v_pos2 FROM positions p JOIN departments d ON d.id = p.department_id WHERE d.location_id = v_location_id AND p.id <> v_pos1 LIMIT 1;
  SELECT id INTO v_shift FROM shift_templates WHERE location_id = v_location_id LIMIT 1;

  IF v_admin_id IS NULL OR v_location_id IS NULL OR v_pos1 IS NULL OR v_pos2 IS NULL OR v_shift IS NULL THEN
    RAISE NOTICE 'Skip: faltan datos seed (admin/location/positions/shift) — re-correr en una DB con datos.';
    RETURN;
  END IF;

  -- Pre-poblar 2 rows.
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count)
    VALUES (v_location_id, v_pos1, v_shift, 1, 3);
  INSERT INTO staffing_requirements (location_id, position_id, shift_template_id, day_of_week, required_count)
    VALUES (v_location_id, v_pos2, v_shift, 2, 4);

  -- Simular auth.uid() = admin (la fn usa auth.uid()). En este test, reemplazamos vía SET LOCAL.
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- Llamar el RPC: actualiza pos1/day1 a 7, borra pos2/day2 (ausente en payload), inserta pos1/day3 con 5.
  v_result := save_staffing_diff(
    v_location_id,
    jsonb_build_array(
      jsonb_build_object('position_id', v_pos1, 'shift_template_id', v_shift, 'day_of_week', 1, 'required_count', 7),
      jsonb_build_object('position_id', v_pos1, 'shift_template_id', v_shift, 'day_of_week', 3, 'required_count', 5)
    )
  );

  ASSERT (v_result->>'inserted')::INT = 1, format('Esperaba inserted=1, obtuvo %s', v_result->>'inserted');
  ASSERT (v_result->>'updated')::INT = 1, format('Esperaba updated=1, obtuvo %s', v_result->>'updated');
  ASSERT (v_result->>'deleted')::INT = 1, format('Esperaba deleted=1, obtuvo %s', v_result->>'deleted');

  -- updated_by se setea.
  SELECT count(*) INTO v_count
    FROM staffing_requirements
   WHERE location_id = v_location_id
     AND position_id = v_pos1
     AND day_of_week = 1
     AND required_count = 7
     AND updated_by = v_admin_id;
  ASSERT v_count = 1, 'updated_by no se seteó al admin';

  -- pos2/day2 fue borrado.
  SELECT count(*) INTO v_count
    FROM staffing_requirements
   WHERE location_id = v_location_id AND position_id = v_pos2 AND day_of_week = 2;
  ASSERT v_count = 0, 'pos2/day2 debio borrarse';

  RAISE NOTICE 'save_staffing_diff_test: PASS';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Correr el test via execute_sql**

Tool: `mcp__plugin_supabase_supabase__execute_sql`. Pegar el contenido completo del archivo. Esperar `NOTICE: save_staffing_diff_test: PASS` (o `Skip` si la DB no tiene seed básico — en ese caso, el test es vacío pero no falla).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/save_staffing_diff_test.sql
git commit -m "test(staffing): SQL test del RPC save_staffing_diff"
```

---

## Task 4: Componente `<Sparkline />`

**Files:**
- Create: `src/components/ui/sparkline.tsx`

- [ ] **Step 1: Implementar**

Crear `src/components/ui/sparkline.tsx`:

```tsx
"use client";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 40, height = 16, className }: SparklineProps) {
  if (values.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const max = Math.max(...values, 1);
  const barWidth = width / values.length;
  const gap = 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Cobertura últimas ${values.length} semanas`}
      role="img"
    >
      {values.map((v, i) => {
        const h = (v / max) * height;
        return (
          <rect
            key={i}
            x={i * barWidth + gap / 2}
            y={height - h}
            width={Math.max(0, barWidth - gap)}
            height={h}
            className="fill-primary/60"
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sparkline.tsx
git commit -m "feat(ui): add Sparkline component"
```

---

## Task 5: Componente `<StaffingCell />`

**Files:**
- Create: `src/components/staffing/staffing-cell.tsx`

Spec ref: §6 (StaffingCell), §9 (edge cases para capacidad/excede).

- [ ] **Step 1: Implementar**

Crear `src/components/staffing/staffing-cell.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

interface StaffingCellProps {
  value: number;
  capacity: number;
  recentCoverage: number[];
  onChange: (value: number) => void;
  ariaLabel?: string;
}

export function StaffingCell({
  value,
  capacity,
  recentCoverage,
  onChange,
  ariaLabel,
}: StaffingCellProps) {
  const exceeds = capacity > 0 && value > capacity;
  const noCapacity = capacity === 0 && value > 0;
  const bandClass = exceeds || noCapacity
    ? "bg-amber-50 border-amber-300"
    : "border-input";

  return (
    <div className={cn("rounded border px-1 py-0.5 flex flex-col items-stretch gap-0.5", bandClass)}>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={99}
          value={value === 0 ? "" : value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="h-6 w-10 px-1 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={ariaLabel}
        />
        <span
          className={cn(
            "text-[10px] tabular-nums",
            capacity === 0 ? "text-red-500" : "text-muted-foreground"
          )}
          title={`Capacidad teórica: ${capacity} empleados con esta posición en la sede`}
        >
          ·{capacity}
        </span>
      </div>
      <Sparkline values={recentCoverage} className="self-end" />
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/staffing/staffing-cell.tsx
git commit -m "feat(staffing): StaffingCell — input + capacidad + sparkline"
```

---

## Task 6: Tab "Por turno" (`<StaffingTabByShift />`)

**Files:**
- Create: `src/components/staffing/staffing-tab-by-shift.tsx`

Spec ref: §6 (StaffingTabByShift), §8 (atajos copy/replicate). Re-leer si hay duda.

Contrato:
- Props:
  ```ts
  {
    positions: Position[];
    shiftTemplates: ShiftTemplate[];
    persisted: Record<CellKey, number>;
    draft: Record<CellKey, number>;
    capacity: Record<string, number>;
    recentCoverage: Record<CellKey, number[]>;
    onCellChange: (key: CellKey, value: number) => void;
    onReplicateAcrossDays: (sourceDay: number, targetDays: number[], scope: { positionIds: string[]; shiftTemplateIds: string[] }) => void;
    onReplicateShiftToShift: (sourceShiftId: string, targetShiftId: string, scope: { positionIds: string[] }) => void;
  }
  ```
- Render: por cada `shiftTemplate`, una `<Card>` colapsable. Header de la card: nombre del turno + horario + DropdownMenu con "Copiar este turno a..." (lista los otros turnos).
- Body: tabla. Header de columna: día (Dom, Lun, Mar, ..., Sáb) con `WEEKDAYS_DISPLAY_ORDER` de `@/lib/constants`. Cada header de día tiene un DropdownMenu con "Replicar a M-V" (si es lunes) y "Replicar a toda la semana".
- Cada celda: `<StaffingCell />`, lee `draft[key] ?? persisted[key] ?? 0`.

Implementar siguiendo el contrato. Importar `<Card>`, `<CardContent>`, `<CardHeader>`, `<CardTitle>` de shadcn, `<DropdownMenu>` family, `formatTimeRange` de `@/lib/utils` si existe.

- [ ] **Step 1**: implementar el componente
- [ ] **Step 2**: `npm run build` → success
- [ ] **Step 3**: commit

```bash
git add src/components/staffing/staffing-tab-by-shift.tsx
git commit -m "feat(staffing): StaffingTabByShift — card por turno + atajos copy"
```

---

## Task 7: Tab "Por posición" (`<StaffingTabByPosition />`)

**Files:**
- Create: `src/components/staffing/staffing-tab-by-position.tsx`

Mismo contrato que Task 6 pero pivotado: una `<Card>` por **posición**, body con filas = turnos × 7 días. Header de card: nombre de la posición + badge `·N empleados` (capacidad teórica). Body con `<StaffingCell />` y los mismos atajos copy/replicate.

- [ ] **Step 1**: implementar
- [ ] **Step 2**: `npm run build` → success
- [ ] **Step 3**: commit

```bash
git add src/components/staffing/staffing-tab-by-position.tsx
git commit -m "feat(staffing): StaffingTabByPosition — card por posición pivot"
```

---

## Task 8: Tab "Heatmap demanda" (`<StaffingTabHeatmap />`)

**Files:**
- Create: `src/components/staffing/staffing-tab-heatmap.tsx`

Contrato:
- Props: como las otras tabs (necesita positions, shiftTemplates, persisted, draft, capacity).
- Render: una sola `<Card>` con tabla densa.
  - Filas = (turno × posición), agrupadas por turno con un `<th>` rowspan que coloreado por turno.
  - Columnas = 7 días.
  - Cada celda: el número con fondo según escala — verde claro 0–2, verde 3–4, ámbar 5–6, ámbar oscuro 7–9, rojo 10+.
  - Editable inline (click en la celda → input ephemeral). Al perder focus → `onCellChange`.
  - Las columnas Sáb (6) y Dom (0) tienen un fondo ligeramente distinto en el header (`bg-amber-50`) para destacar fin de semana.

Helper de color:
```tsx
function demandColor(v: number): string {
  if (v <= 2) return "bg-emerald-50 text-emerald-900";
  if (v <= 4) return "bg-emerald-100 text-emerald-900";
  if (v <= 6) return "bg-amber-100 text-amber-900";
  if (v <= 9) return "bg-amber-200 text-amber-950";
  return "bg-red-200 text-red-950";
}
```

- [ ] **Step 1**: implementar
- [ ] **Step 2**: `npm run build` → success
- [ ] **Step 3**: commit

```bash
git add src/components/staffing/staffing-tab-heatmap.tsx
git commit -m "feat(staffing): StaffingTabHeatmap — tabla densa por demanda"
```

---

## Task 9: Hook `useStaffingMatrix`

**Files:**
- Create: `src/hooks/use-staffing-matrix.ts`

Spec ref: §7 completa. 5 queries paralelas + retorna `{ loading, positions, shiftTemplates, persisted, capacity, recentCoverage, refetch }`.

- [ ] **Step 1: Implementar**

Crear `src/hooks/use-staffing-matrix.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { makeCellKey, type CellKey } from "@/lib/staffing-helpers";
import type {
  Position,
  ShiftTemplate,
  StaffingRequirement,
} from "@/lib/types";

export interface UseStaffingMatrixResult {
  loading: boolean;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  persisted: Record<CellKey, number>;
  capacity: Record<string, number>;
  recentCoverage: Record<CellKey, number[]>;
  refetch: () => void;
}

export function useStaffingMatrix(locationId: string | null): UseStaffingMatrixResult {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [persisted, setPersisted] = useState<Record<CellKey, number>>({});
  const [capacity, setCapacity] = useState<Record<string, number>>({});
  const [recentCoverage, setRecentCoverage] = useState<Record<CellKey, number[]>>({});

  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1-3 en paralelo: requirements, positions (con filtro location), shift_templates.
      const [reqRes, posRes, stRes] = await Promise.all([
        supabase.from("staffing_requirements").select("*").eq("location_id", locationId),
        supabase
          .from("positions")
          .select("*, department:departments(location_id)")
          .order("name"),
        supabase.from("shift_templates").select("*").eq("location_id", locationId).order("name"),
      ]);

      if (cancelled) return;

      const reqs = ((reqRes.data ?? []) as StaffingRequirement[]);
      const persistedMap: Record<CellKey, number> = {};
      for (const r of reqs) {
        persistedMap[makeCellKey(r.position_id, r.shift_template_id, r.day_of_week)] = r.required_count;
      }
      setPersisted(persistedMap);

      const allPositions = (posRes.data ?? []) as (Position & { department: { location_id: string } | null })[];
      const locationPositions = allPositions.filter(
        (p) => p.department?.location_id === locationId
      );
      setPositions(locationPositions);
      setShiftTemplates((stRes.data ?? []) as ShiftTemplate[]);

      // 4. Capacidad teórica: count de profiles activos por position_id (primaria + secundaria) en sede.
      const positionIds = locationPositions.map((p) => p.id);
      const capacityMap: Record<string, number> = {};
      if (positionIds.length > 0) {
        const [primaryRes, secondaryRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("position_id")
            .eq("location_id", locationId)
            .eq("is_active", true)
            .in("position_id", positionIds),
          supabase
            .from("employee_secondary_positions")
            .select("position_id, employee:profiles!inner(location_id, is_active)")
            .in("position_id", positionIds),
        ]);
        for (const row of (primaryRes.data ?? []) as Array<{ position_id: string | null }>) {
          if (!row.position_id) continue;
          capacityMap[row.position_id] = (capacityMap[row.position_id] ?? 0) + 1;
        }
        for (const row of (secondaryRes.data ?? []) as Array<{
          position_id: string;
          employee: { location_id: string; is_active: boolean } | null;
        }>) {
          if (!row.employee?.is_active || row.employee.location_id !== locationId) continue;
          capacityMap[row.position_id] = (capacityMap[row.position_id] ?? 0) + 1;
        }
      }
      setCapacity(capacityMap);

      // 5. Cobertura real reciente: schedule_entries últimas 4 semanas.
      const today = new Date();
      const fourWeeksAgo = new Date(today);
      fourWeeksAgo.setDate(today.getDate() - 28);
      const fromDate = fourWeeksAgo.toISOString().slice(0, 10);
      const toDate = today.toISOString().slice(0, 10);

      const { data: entriesData } = await supabase
        .from("schedule_entries")
        .select("date, position_id, shift_template_id, schedule:schedules!inner(location_id)")
        .gte("date", fromDate)
        .lte("date", toDate)
        .eq("schedules.location_id", locationId);

      const coverageBuckets: Record<CellKey, number[]> = {};
      for (const row of (entriesData ?? []) as Array<{
        date: string;
        position_id: string;
        shift_template_id: string;
      }>) {
        const d = new Date(row.date + "T00:00:00");
        const dow = d.getDay();
        const weekIdx = Math.floor((today.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekIdx < 0 || weekIdx > 3) continue;
        const bucketIdx = 3 - weekIdx;  // 0 = w-3, 3 = esta semana
        const key = makeCellKey(row.position_id, row.shift_template_id, dow);
        if (!coverageBuckets[key]) coverageBuckets[key] = [0, 0, 0, 0];
        coverageBuckets[key][bucketIdx]++;
      }
      setRecentCoverage(coverageBuckets);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, locationId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { loading, positions, shiftTemplates, persisted, capacity, recentCoverage, refetch };
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-staffing-matrix.ts
git commit -m "feat(staffing): hook useStaffingMatrix — 5 queries paralelas"
```

---

## Task 10: Orquestador `<StaffingMatrix />` (rewrite)

**Files:**
- Rewrite: `src/components/staffing/staffing-matrix.tsx`

Spec ref: §6, §8. Reescribir completamente el componente actual.

Contrato:
- Props: `{ locationId: string }` — TODO el resto se obtiene del hook (NO recibir positions/shiftTemplates como props desde la página).
- Body:
  - Estado local: `draft: Record<CellKey, number>` y `activeTab: 'shift' | 'position' | 'heatmap'`.
  - Llamada al hook `useStaffingMatrix(locationId)`.
  - shadcn `<Tabs value={activeTab} onValueChange={setActiveTab}>` con 3 trigger.
  - Header sticky con badge "N cambios sin guardar" (cuando `Object.keys(draft).length > 0`) + botones Guardar/Descartar.
- Handlers:
  - `onCellChange(key, value)` → actualiza draft.
  - `onReplicateAcrossDays(sourceDay, targetDays, scope)` → llama `replicateAcrossDays(currentDesired, ...)` y setea draft con el resultado, donde `currentDesired = { ...persisted, ...draft }`.
  - `onReplicateShiftToShift(sourceShiftId, targetShiftId, scope)` → análogo.
  - `handleSave()`:
    1. `desired = { ...persisted, ...draft }` (todas las celdas — el RPC compara con su propia BD).
    2. Construir `rows` JSON: filtrar a `value > 0` (las que pasaron a 0 se borran porque no se envían).
    3. Llamar `supabase.rpc('save_staffing_diff', { p_location_id: locationId, p_rows: rows })`.
    4. En éxito: refetch + setDraft({}) + toast con "X celdas: I nuevas, U modificadas, D borradas".
  - `handleDiscard()`: confirm dialog si draft no vacío + `setDraft({})`.

- [ ] **Step 1**: implementar
- [ ] **Step 2**: `npm run build` → success
- [ ] **Step 3**: commit

```bash
git add src/components/staffing/staffing-matrix.tsx
git commit -m "feat(staffing): StaffingMatrix orquestador — 3 tabs + draft + RPC"
```

---

## Task 11: Página `/staffing/page.tsx` actualizada

**Files:**
- Modify: `src/app/(authenticated)/staffing/page.tsx`

Cambios mínimos:
- Mantener: auth gate, selector de sede.
- Quitar: el fetch de positions/shiftTemplates aquí (ahora lo hace el hook dentro del orquestador).
- Pasar al orquestador solo `locationId`:

```tsx
{selectedLocationId ? (
  <StaffingMatrix key={selectedLocationId} locationId={selectedLocationId} />
) : (
  <p className="text-muted-foreground">Selecciona una sede para configurar las necesidades.</p>
)}
```

Borrar los `useState` y `useEffect` que cargaban positions/shiftTemplates.

- [ ] **Step 1**: editar
- [ ] **Step 2**: `npm run build` → success
- [ ] **Step 3**: commit

```bash
git add src/app/\(authenticated\)/staffing/page.tsx
git commit -m "refactor(staffing): la página solo selecciona sede; el orquestador hace fetch"
```

---

## Task 12: Tipos + actualización CLAUDE.md

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Tipos**

Encontrar `interface StaffingRequirement` en `src/lib/types.ts` y agregar:

```ts
export interface StaffingRequirement {
  // ... existing
  updated_by?: string | null;
  // updated_at ya debería estar; si no, agregarlo opcional
}
```

- [ ] **Step 2: CLAUDE.md**

Agregar una sección breve después de la sección "Schedule Lifecycle" o cerca de las RPCs:

```markdown
### Staffing Matrix (`/necesidades`)

Configurador semanal recurrente de necesidades por (sede × posición × turno × día). Tres tabs: Por turno, Por posición, Heatmap demanda. Persiste vía RPC `save_staffing_diff(p_location_id uuid, p_rows jsonb)` que aplica un diff atómico (insert/update/delete según desired state). Auditoría: `staffing_requirements.updated_by`. Helpers puros en `src/lib/staffing-helpers.ts`. Hook `useStaffingMatrix` carga 5 queries en paralelo (requirements + positions + shift_templates + capacidad teórica + cobertura últimas 4 semanas).
```

- [ ] **Step 3: Build + tests**

```bash
npm run build
npm run test
```
Expected: build clean, tests count = baseline + 12 nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts CLAUDE.md
git commit -m "docs(staffing): tipos + CLAUDE.md actualizados"
```

---

## Task 13: Smoke chrome + push

- [ ] **Step 1**: `git push origin main`. Esperar deploy de Vercel.

- [ ] **Step 2**: Smoke en chrome-devtools:
  1. Login admin → `/necesidades`.
  2. Verificar 3 tabs visibles (Por turno / Por posición / Heatmap).
  3. Editar 3 celdas en "Por turno", verificar badge "3 cambios sin guardar".
  4. Pulsar "Replicar lunes a M-V" en cabecera del lunes → verificar que las celdas de M-V copiaron el valor.
  5. Pulsar Guardar → toast con conteos. Recargar → cambios persisten.
  6. Cambiar a tab "Por posición" → mismo data en otro pivote.
  7. Cambiar a tab "Heatmap" → tabla densa coloreada.
  8. Verificar en BD: `SELECT updated_by FROM staffing_requirements WHERE updated_by IS NOT NULL LIMIT 3;` → admin id.

- [ ] **Step 3**: Si todo pasa, marcar plan como done. Si algo falla, anotar el bug + el fix en un commit aparte.

---

## Self-review notes

- **Spec coverage:**
  - §4 (migración 032): Task 1 ✓
  - §5 (RPC): Task 1 ✓
  - §6 (componentes): Tasks 4-10 ✓
  - §7 (hook): Task 9 ✓
  - §8 (data flow): Task 10 ✓
  - §9 (errores): Task 5 (bandas), Task 10 (confirm modals) ✓
  - §10 (testing): Task 2 (Vitest), Task 3 (SQL test) ✓
  - §11 (página): Task 11 ✓
  - §12 (entregables): Task 12 ✓
- **Type consistency:** `CellKey` definido en Task 2, usado consistentemente en 9-10. `StaffingCell` interface en Task 2. `UseStaffingMatrixResult` en Task 9.
- **Placeholder scan:** Tasks 6-8 son intent-only (no contienen el código completo del componente, solo el contrato). Justificado: son componentes UI mecánicos, el implementador puede mirar `<DataTable>` y `<EmployeeEquityPanel>` para el patrón visual y `staffing-matrix.tsx` actual para entender los inputs. Si esto no es suficiente, agregar mockups inline.
- **Granularidad:** Tasks 1-3, 9-10 son las más críticas (DB + hooks + orquestador). Tasks 4-8 son UI mecánica. Task 11-12 son cleanup.
