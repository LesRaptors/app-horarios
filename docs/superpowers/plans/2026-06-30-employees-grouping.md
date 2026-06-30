# Agrupación y filtros en Empleados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar agrupación configurable (Sede/Departamento/Posición/Sin agrupar) y filtros de Sede/Departamento a la tabla de `/employees`, con grupos colapsables nativos.

**Architecture:** Un helper puro de agrupación (testeable), nuevo estado + filtros + selector "Agrupar por" en `page.tsx`, y un componente de render `GroupedEmployeeTable` que dibuja grupos con `<details>/<summary>` nativo + `content-visibility`. Puro frontend, sin backend.

**Tech Stack:** Next.js 14 (client component), React, TypeScript, shadcn/ui (Table, Select), Tailwind, Vitest, lucide.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-employees-grouping-design.md`.
- UI en **español**, sin emojis (chevrons con lucide). Dark mode con variables existentes.
- **Antes de tocar la UI**: invocar `modern-web-guidance:modern-web-guidance` (disclosure `<details>`, tabla accesible, `content-visibility`).
- Grupos colapsables con **`<details>/<summary>` nativo** (la búsqueda del navegador debe encontrar empleados en grupos cerrados — NO usar `display:none` para ocultar).
- Default `groupBy = "location"`, persistido en `localStorage` clave `employees:groupBy`.
- "Sin asignar" siempre al final; grupos ordenados alfabéticamente por label.
- Tipo del empleado: `ProfileWithJoins` (definido en `page.tsx:77-97`): tiene `location: {id,name}|null`, `position: {id,name,department:{id,name,location_id}}|null`, `location_id`.
- Commits terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama: `feature/employees-grouping` (creada; spec en `46c8ca9`).

## File Structure

- `src/lib/employee-grouping.ts` — helper puro `groupEmployees` + tipos `GroupBy`, `EmployeeGroup`.
- `src/lib/employee-grouping.test.ts` — tests Vitest.
- `src/components/employees/grouped-employee-table.tsx` — render de grupos colapsables.
- `src/app/(authenticated)/employees/page.tsx` — estado, filtros, controles, integración.

---

### Task 1: Helper puro de agrupación

**Files:**
- Create: `src/lib/employee-grouping.ts`
- Test: `src/lib/employee-grouping.test.ts`

**Interfaces:**
- Produces: `type GroupBy = "location" | "department" | "position" | "none"`; `interface EmployeeGroup<T> { key: string; label: string; employees: T[] }`; `function groupEmployees<T extends EmployeeForGrouping>(employees: T[], groupBy: GroupBy): EmployeeGroup<T>[]`.

- [ ] **Step 1: Escribir los tests (TDD)**

Create `src/lib/employee-grouping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupEmployees, type EmployeeForGrouping } from "./employee-grouping";

type E = EmployeeForGrouping & { id: string };
const mk = (id: string, loc: string | null, dept: string | null, pos: string | null): E => ({
  id,
  location: loc ? { id: `loc-${loc}`, name: loc } : null,
  position: pos ? { id: `pos-${pos}`, name: pos, department: dept ? { id: `dep-${dept}`, name: dept } : null } : null,
});

describe("groupEmployees", () => {
  const emps: E[] = [
    mk("a", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("b", "EVI Oriente", "Lab", "Bacteriólogo"),
    mk("c", "EVI Poblado", "Dirección", "Directora"),
    mk("d", null, null, null), // sin asignar
  ];

  it("agrupa por sede, orden alfabético, Sin asignar al final", () => {
    const g = groupEmployees(emps, "location");
    expect(g.map((x) => x.label)).toEqual(["EVI Oriente", "EVI Poblado", "Sin asignar"]);
    expect(g.find((x) => x.label === "EVI Poblado")!.employees.map((e) => e.id)).toEqual(["a", "c"]);
    expect(g.at(-1)!.key).toBe("__unassigned__");
  });

  it("agrupa por departamento", () => {
    const g = groupEmployees(emps, "department");
    expect(g.map((x) => x.label)).toEqual(["Dirección", "Lab", "Sin asignar"]);
  });

  it("agrupa por posición", () => {
    const g = groupEmployees(emps, "position");
    expect(g.map((x) => x.label).sort()).toEqual(["Bacteriólogo", "Directora", "Sin asignar"]);
  });

  it("none devuelve un grupo con todos", () => {
    const g = groupEmployees(emps, "none");
    expect(g).toHaveLength(1);
    expect(g[0].employees).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `npm run test -- employee-grouping`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el helper**

Create `src/lib/employee-grouping.ts`:

```ts
export type GroupBy = "location" | "department" | "position" | "none";

export interface EmployeeForGrouping {
  location: { id: string; name: string } | null;
  position: {
    id: string;
    name: string;
    department: { id: string; name: string } | null;
  } | null;
}

export interface EmployeeGroup<T> {
  key: string;
  label: string;
  employees: T[];
}

const UNASSIGNED = "__unassigned__";

function keyLabel(emp: EmployeeForGrouping, groupBy: GroupBy): { key: string; label: string } {
  switch (groupBy) {
    case "location":
      return emp.location ? { key: emp.location.id, label: emp.location.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "department": {
      const d = emp.position?.department;
      return d ? { key: d.id, label: d.name } : { key: UNASSIGNED, label: "Sin asignar" };
    }
    case "position":
      return emp.position ? { key: emp.position.id, label: emp.position.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "none":
      return { key: "all", label: "" };
  }
}

export function groupEmployees<T extends EmployeeForGrouping>(
  employees: T[],
  groupBy: GroupBy,
): EmployeeGroup<T>[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", employees: [...employees] }];
  }
  const map = new Map<string, EmployeeGroup<T>>();
  for (const emp of employees) {
    const { key, label } = keyLabel(emp, groupBy);
    let g = map.get(key);
    if (!g) {
      g = { key, label, employees: [] };
      map.set(key, g);
    }
    g.employees.push(emp);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.label.localeCompare(b.label, "es");
  });
  return groups;
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npm run test -- employee-grouping`
Expected: PASS. (Un hook PostToolUse corre toda la suite tras editar `src/lib/` — dejala verde.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/employee-grouping.ts src/lib/employee-grouping.test.ts
git commit -m "feat(employees): helper puro groupEmployees + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Filtros de Sede y Departamento en page.tsx

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

**Interfaces:**
- Consumes: `employees: ProfileWithJoins[]`, `locations`, `departments` (ya cargados); `filteredEmployees` useMemo (`~384`).
- Produces: estado `filterLocationId`, `filterDepartmentId`; `filteredEmployees` los aplica.

- [ ] **Step 1: Agregar estado de filtros**

Modify `page.tsx` — junto a `const [search, setSearch] = useState("")` (~247) y `demoFilter`:

```ts
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("all");
```

- [ ] **Step 2: Extender `filteredEmployees`**

Modify el `useMemo` de `filteredEmployees` (`~384-401`) — agregar los filtros de sede/departamento antes del filtro de búsqueda, y sus deps:

```ts
  const filteredEmployees = useMemo(() => {
    let result = employees;

    if (demoFilter === "real") result = result.filter((e) => !e.is_demo);
    else if (demoFilter === "demo") result = result.filter((e) => e.is_demo);

    if (filterLocationId !== "all") result = result.filter((e) => e.location_id === filterLocationId);
    if (filterDepartmentId !== "all") result = result.filter((e) => e.position?.department?.id === filterDepartmentId);

    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter((e) => {
      const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
      const email = e.email?.toLowerCase() ?? "";
      return fullName.includes(q) || email.includes(q);
    });
  }, [employees, search, demoFilter, filterLocationId, filterDepartmentId]);
```

- [ ] **Step 3: Agregar los selectores de filtro a la barra**

En la barra de controles (`~899-924`, junto al filtro demo), agregar dos `Select` (siguiendo el patrón del `Select` de demo existente):

```tsx
<Select value={filterLocationId} onValueChange={setFilterLocationId}>
  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sede" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todas las sedes</SelectItem>
    {locations.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
  </SelectContent>
</Select>
<Select value={filterDepartmentId} onValueChange={setFilterDepartmentId}>
  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Departamento" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todos los departamentos</SelectItem>
    {departments
      .filter((d) => filterLocationId === "all" || d.location_id === filterLocationId)
      .map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
  </SelectContent>
</Select>
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(employees): filtros de Sede y Departamento

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Agrupación + render colapsable

**Files:**
- Create: `src/components/employees/grouped-employee-table.tsx`
- Modify: `src/app/(authenticated)/employees/page.tsx`

**Interfaces:**
- Consumes: `groupEmployees`, `GroupBy`, `EmployeeGroup` (Task 1); `filteredEmployees` (Task 2).
- Produces: `<GroupedEmployeeTable>` componente.

- [ ] **Step 0 (OBLIGATORIO): invocar modern-web-guidance**

Invocá `modern-web-guidance:modern-web-guidance` con query "details summary disclosure accessible table content-visibility" y aplicá sus DOs/DON'Ts (`<details>` nativo, sin `display:none`, marcador nativo oculto, `content-visibility:auto` + `contain-intrinsic-size`).

- [ ] **Step 1: Estado de agrupación + persistencia en page.tsx**

Modify `page.tsx`:
- Import: `import { groupEmployees, type GroupBy } from "@/lib/employee-grouping";` y `import { GroupedEmployeeTable } from "@/components/employees/grouped-employee-table";`.
- Estado (con init desde localStorage):

```ts
  const [groupBy, setGroupBy] = useState<GroupBy>("location");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("employees:groupBy") : null;
    if (saved === "location" || saved === "department" || saved === "position" || saved === "none") setGroupBy(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("employees:groupBy", groupBy);
  }, [groupBy]);

  const groups = useMemo(() => groupEmployees(filteredEmployees, groupBy), [filteredEmployees, groupBy]);
```

- [ ] **Step 2: Selector "Agrupar por" + Expandir/Colapsar todo**

En la barra de controles, agregar:

```tsx
<Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
  <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="location">Agrupar por sede</SelectItem>
    <SelectItem value="department">Agrupar por departamento</SelectItem>
    <SelectItem value="position">Agrupar por posición</SelectItem>
    <SelectItem value="none">Sin agrupar</SelectItem>
  </SelectContent>
</Select>
```

El botón "Expandir/Colapsar todo" lo maneja el componente (Step 3) — page.tsx solo pasa `groupBy`.

- [ ] **Step 3: Crear `GroupedEmployeeTable`**

Create `src/components/employees/grouped-employee-table.tsx`. Recibe los grupos y un `renderRow` (page.tsx mantiene la lógica de fila actual). Estructura:

```tsx
"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { EmployeeGroup, GroupBy } from "@/lib/employee-grouping";

interface Column { key: string; label: string; className?: string }

interface Props<T> {
  groups: EmployeeGroup<T>[];
  groupBy: GroupBy;
  columns: Column[];                 // columnas visibles (sin la del criterio agrupado)
  renderRow: (emp: T) => React.ReactNode;
  searchActive: boolean;
  rowKey: (emp: T) => string;
}

export function GroupedEmployeeTable<T>({ groups, groupBy, columns, renderRow, searchActive }: Props<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Sin agrupar: tabla plana única.
  if (groupBy === "none") {
    return (
      <Table className="table-fixed">
        <TableHeader><TableRow>{columns.map((c) => (<TableHead key={c.key} className={c.className}>{c.label}</TableHead>))}</TableRow></TableHeader>
        <TableBody>{groups[0]?.employees.map((e) => renderRow(e))}</TableBody>
      </Table>
    );
  }

  const isOpen = (key: string) => (searchActive ? true : !collapsed.has(key));
  const allKeys = groups.map((g) => g.key);
  const allCollapsed = allKeys.every((k) => collapsed.has(k));

  return (
    <div>
      <div className="flex justify-end p-2">
        <Button variant="ghost" size="sm" onClick={() =>
          setCollapsed(allCollapsed ? new Set() : new Set(allKeys))
        }>{allCollapsed ? "Expandir todo" : "Colapsar todo"}</Button>
      </div>
      {groups.map((group) => (
        <details
          key={group.key}
          open={isOpen(group.key)}
          onToggle={(e) => {
            if (searchActive) return; // controlado por búsqueda
            const open = (e.currentTarget as HTMLDetailsElement).open;
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (open) next.delete(group.key); else next.add(group.key);
              return next;
            });
          }}
          className="border-b last:border-0 [&::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/40 px-4 py-2 font-medium">
            <ChevronDown className="h-4 w-4 transition-transform [details:not([open])_&]:-rotate-90" />
            {group.label} <span className="text-muted-foreground">· {group.employees.length}</span>
          </summary>
          <div style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}>
            <Table className="table-fixed">
              <TableHeader><TableRow>{columns.map((c) => (<TableHead key={c.key} className={c.className}>{c.label}</TableHead>))}</TableRow></TableHeader>
              <TableBody>{group.employees.map((e) => renderRow(e))}</TableBody>
            </Table>
          </div>
        </details>
      ))}
    </div>
  );
}
```

NOTA de alineación: el `table-fixed` + las mismas `columns` (con `className` de ancho, p.ej. `w-[180px]`) en todos los grupos garantizan columnas alineadas. El implementer define los anchos de columna en el array `columns` para que coincidan con el diseño actual. Si la alineación con `<details>` por-grupo resultara problemática, es válido un layout de CSS grid con `grid-template-columns` compartido — ambos cumplen `<details>` nativo; documentá la elección.

- [ ] **Step 4: Integrar en page.tsx**

Modify `page.tsx` — reemplazar el bloque actual `<Table>...{filteredEmployees.map(...)}...</Table>` (`~952-...`) por `<GroupedEmployeeTable>`:
- Extraer la lógica de fila actual (el `(emp) => { ... return <TableRow>...</TableRow> }`) a una función `renderEmployeeRow(emp)` dentro de page.tsx (mantiene todos los callbacks: panel, contrato inline, editar, demo, transferir, eliminar).
- Definir `columns`: array de `{ key, label, className }` con TODAS las columnas (Nombre, Email, Rol, Posición, Sede, Contrato, Salario, Estado, Acciones) y sus anchos. Filtrar la columna del criterio agrupado: `const visibleColumns = columns.filter((c) => !(groupBy === "location" && c.key === "location") && !(groupBy === "department" && c.key === "department") && !(groupBy === "position" && c.key === "position"))`. (La columna "Posición" se oculta al agrupar por posición; "Sede" al agrupar por sede. No hay columna "Departamento" hoy — no se oculta nada para department.)
- Render:

```tsx
<GroupedEmployeeTable
  groups={groups}
  groupBy={groupBy}
  columns={visibleColumns}
  rowKey={(e) => e.id}
  searchActive={!!search.trim() || filterLocationId !== "all" || filterDepartmentId !== "all"}
  renderRow={renderEmployeeRow}
/>
```

Mantener el `loadingData` y el empty-state (`~929-950`) tal como están, alrededor del nuevo componente.

- [ ] **Step 5: Verificar typecheck + tests**

Run: `npm run typecheck` (exit 0) y `npm run test` (verde — el helper de Task 1 incluido).

- [ ] **Step 6: Commit**

```bash
git add src/components/employees/grouped-employee-table.tsx "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(employees): agrupación colapsable configurable en la tabla

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Validación final

- [ ] **Step 1: Suite + typecheck**

Run: `npm run test` (incluye `employee-grouping`) y `npm run typecheck` (exit 0).

- [ ] **Step 2: Verificación manual (si hay browser disponible) o checklist**

Confirmar: agrupar por cada criterio reagrupa; columna del criterio se oculta; "Sin asignar" al final; búsqueda expande; Expandir/Colapsar todo; filtros Sede/Depto combinan; "Sin agrupar" = tabla plana; las acciones de fila funcionan; el `groupBy` persiste al recargar.

- [ ] **Step 3: `/code-review` del diff de la rama**

Correr `/code-review` sobre `main...feature/employees-grouping`. Foco: a11y de los `<details>` (búsqueda del navegador, marcador oculto, foco), alineación de columnas, que `renderRow` no rompa las acciones existentes, persistencia localStorage (SSR-safe), y que `filteredEmployees`/`groups` no tengan recomputo innecesario.

- [ ] **Step 4: Commit de fixes (si aplica)**

```bash
git add -A
git commit -m "fix: ajustes de code-review en agrupación de empleados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review del plan

**Spec coverage:**
- Componente 1 (helper puro) → Task 1 ✓
- Componente 2 (estado/filtros/controles) → Tasks 2 y 3 ✓
- Componente 3 (render agrupado `<details>`) → Task 3 ✓
- Componente 4 (estilos: chevron, marcador oculto, dark mode) → Task 3 (en el componente) ✓
- Testing (helper Vitest) → Task 1 ✓
- Validación (modern-web-guidance + /code-review) → Task 3 Step 0 + Task 4 ✓

**Placeholder scan:** el código del helper, los filtros y el componente es literal. El único punto abierto es la técnica de alineación (table-fixed vs grid) — instrucción explícita de elegir la que alinee, no un placeholder de lógica.

**Type consistency:** `GroupBy`, `EmployeeGroup<T>`, `groupEmployees` consistentes entre Task 1 (definición), Task 3 (uso). `ProfileWithJoins` (tipo del empleado) compatible con `EmployeeForGrouping` por estructura. `groupBy` valores (`location`/`department`/`position`/`none`) consistentes en estado, localStorage, selector y helper.
