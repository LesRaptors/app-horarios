# Agrupación multinivel + polish de barra (Empleados) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupación jerárquica de hasta 2 niveles (Sede→Departamento) con render anidado colapsable y orden A→Z, más el polish de la barra de controles de `/employees`.

**Architecture:** Un helper puro recursivo (`groupEmployeesMulti` → árbol `GroupNode`), un render recursivo de `<details>` anidados en `GroupedEmployeeTable`, y en `page.tsx` el estado `groupLevels` + UI cascada "luego por" + el polish de la barra. Puro frontend.

**Tech Stack:** Next.js 14 (client), React, TypeScript, shadcn/ui (Table, Select), Tailwind, Vitest, lucide.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-employees-multilevel-grouping-design.md`.
- UI en **español**, sin emojis (chevrons con lucide). Dark mode con variables.
- **ANTES de tocar la UI (Tasks 2 y 3): invocar los TRES skills** y aplicar sus DOs/DON'Ts: `modern-web-guidance:modern-web-guidance` (a11y/CWV/`<details>`), `frontend-design:frontend-design` (diseño distintivo, evitar genérico), `ui-ux-pro-max` (jerarquía visual, paleta, espaciado). Pedido explícito del usuario.
- Grupos colapsables con **`<details>/<summary>` nativo** (búsqueda del navegador debe encontrar empleados en grupos cerrados — NO `display:none`); `content-visibility:auto` en las hojas.
- **Máximo 2 niveles.** Orden **A→Z**: grupos por `label` y empleados por `${first_name} ${last_name}` (`localeCompare es`); "Sin asignar" (`__unassigned__`) al final de cada nivel.
- Persistencia: `localStorage` clave `employees:groupLevels` (JSON array); migrar el `employees:groupBy` (string) viejo.
- Commits terminan con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama: `feature/employees-multilevel-grouping` (creada; spec en `49a9f91`).

## File Structure

- `src/lib/employee-grouping.ts` — `groupEmployeesMulti` + `GroupNode` (reemplaza el single-level).
- `src/lib/employee-grouping.test.ts` — tests del árbol.
- `src/components/employees/grouped-employee-table.tsx` — render recursivo.
- `src/app/(authenticated)/employees/page.tsx` — `groupLevels`, UI cascada, barra polish, integración.

---

### Task 1: Helper multinivel (recursivo)

**Files:**
- Modify: `src/lib/employee-grouping.ts`
- Modify: `src/lib/employee-grouping.test.ts`

**Interfaces:**
- Produces: `interface GroupNode<T> { key: string; label: string; count: number; children: GroupNode<T>[] | null; employees: T[] | null }`; `groupEmployeesMulti<T extends EmployeeForGrouping>(employees: T[], levels: GroupBy[]): GroupNode<T>[]`; `EmployeeForGrouping` gana `first_name`, `last_name`.

- [ ] **Step 1: Reescribir los tests (TDD)**

Replace `src/lib/employee-grouping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupEmployeesMulti, type EmployeeForGrouping } from "./employee-grouping";

type E = EmployeeForGrouping & { id: string };
const mk = (id: string, first: string, loc: string | null, dept: string | null, pos: string | null): E => ({
  id, first_name: first, last_name: "X",
  location: loc ? { id: `loc-${loc}`, name: loc } : null,
  position: pos ? { id: `pos-${pos}`, name: pos, department: dept ? { id: `dep-${dept}`, name: dept } : null } : null,
});

describe("groupEmployeesMulti", () => {
  const emps: E[] = [
    mk("a", "Zoe", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("b", "Ana", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("c", "Beto", "EVI Poblado", "Dirección", "Director"),
    mk("d", "Cira", "EVI Oriente", "Lab", "Bacteriólogo"),
    mk("e", "Eve", null, null, null),
  ];

  it("2 niveles (sede→departamento): grupos A→Z, Sin asignar al final, count recursivo", () => {
    const tree = groupEmployeesMulti(emps, ["location", "department"]);
    expect(tree.map((n) => n.label)).toEqual(["EVI Oriente", "EVI Poblado", "Sin asignar"]);
    const poblado = tree.find((n) => n.label === "EVI Poblado")!;
    expect(poblado.count).toBe(3);
    expect(poblado.children!.map((n) => n.label)).toEqual(["Dirección", "Lab"]); // A→Z
    expect(poblado.employees).toBeNull();
    const lab = poblado.children!.find((n) => n.label === "Lab")!;
    expect(lab.children).toBeNull();
    expect(lab.employees!.map((e) => e.id)).toEqual(["b", "a"]); // Ana antes que Zoe (A→Z por nombre)
    expect(tree.at(-1)!.key).toBe("__unassigned__");
  });

  it("1 nivel (sede): hoja con empleados A→Z", () => {
    const tree = groupEmployeesMulti(emps, ["location"]);
    const oriente = tree.find((n) => n.label === "EVI Oriente")!;
    expect(oriente.children).toBeNull();
    expect(oriente.employees!.map((e) => e.id)).toEqual(["d"]);
  });

  it("sin niveles / none: un nodo hoja con todos, A→Z", () => {
    const tree = groupEmployeesMulti(emps, ["none"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toBeNull();
    expect(tree[0].employees!.map((e) => e.first_name)).toEqual(["Ana", "Beto", "Cira", "Eve", "Zoe"]);
  });
});
```

- [ ] **Step 2: Correr — FALLA**

Run: `npm run test -- employee-grouping`
Expected: FAIL (`groupEmployeesMulti` no existe).

- [ ] **Step 3: Reescribir el helper**

Replace `src/lib/employee-grouping.ts`:

```ts
export type GroupBy = "location" | "department" | "position" | "none";

export interface EmployeeForGrouping {
  first_name: string;
  last_name: string;
  location: { id: string; name: string } | null;
  position: { id: string; name: string; department: { id: string; name: string } | null } | null;
}

export interface GroupNode<T> {
  key: string;
  label: string;
  count: number;
  children: GroupNode<T>[] | null; // nodo interno
  employees: T[] | null;           // nodo hoja
}

const UNASSIGNED = "__unassigned__";

function keyLabel(emp: EmployeeForGrouping, level: Exclude<GroupBy, "none">): { key: string; label: string } {
  switch (level) {
    case "location":
      return emp.location ? { key: emp.location.id, label: emp.location.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "department": {
      const d = emp.position?.department;
      return d ? { key: d.id, label: d.name } : { key: UNASSIGNED, label: "Sin asignar" };
    }
    case "position":
      return emp.position ? { key: emp.position.id, label: emp.position.name } : { key: UNASSIGNED, label: "Sin asignar" };
  }
}

function sortEmployees<T extends EmployeeForGrouping>(emps: T[]): T[] {
  return [...emps].sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "es"),
  );
}

function sortNodes<T>(nodes: GroupNode<T>[]): GroupNode<T>[] {
  return nodes.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.label.localeCompare(b.label, "es");
  });
}

function buildLevel<T extends EmployeeForGrouping>(employees: T[], levels: Exclude<GroupBy, "none">[]): GroupNode<T>[] {
  const [level, ...rest] = levels;
  const map = new Map<string, { label: string; emps: T[] }>();
  for (const emp of employees) {
    const { key, label } = keyLabel(emp, level);
    let g = map.get(key);
    if (!g) { g = { label, emps: [] }; map.set(key, g); }
    g.emps.push(emp);
  }
  const nodes: GroupNode<T>[] = [];
  for (const [key, { label, emps }] of map) {
    nodes.push(
      rest.length > 0
        ? { key, label, count: emps.length, children: buildLevel(emps, rest), employees: null }
        : { key, label, count: emps.length, children: null, employees: sortEmployees(emps) },
    );
  }
  return sortNodes(nodes);
}

export function groupEmployeesMulti<T extends EmployeeForGrouping>(
  employees: T[],
  levels: GroupBy[],
): GroupNode<T>[] {
  const real = levels.filter((l): l is Exclude<GroupBy, "none"> => l !== "none");
  if (real.length === 0) {
    return [{ key: "all", label: "", count: employees.length, children: null, employees: sortEmployees(employees) }];
  }
  return buildLevel(employees, real);
}
```

- [ ] **Step 4: Correr — PASA**

Run: `npm run test -- employee-grouping`
Expected: PASS. (El hook PostToolUse corre la suite tras editar `src/lib/` — dejala verde; si quedan referencias al viejo `groupEmployees`/`EmployeeGroup` en otros archivos, las arreglan las Tasks 2-3.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/employee-grouping.ts src/lib/employee-grouping.test.ts
git commit -m "feat(employees): groupEmployeesMulti — agrupación jerárquica recursiva

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render recursivo anidado

**Files:**
- Modify: `src/components/employees/grouped-employee-table.tsx`

**Interfaces:**
- Consumes: `GroupNode<T>` (Task 1).
- Produces: `<GroupedEmployeeTable nodes={GroupNode<T>[]} columns isGrouped renderRow searchActive />`.

- [ ] **Step 0 (OBLIGATORIO): invocar los 3 skills de UI**

Invocá `modern-web-guidance:modern-web-guidance` (query "nested details disclosure accessible indentation keyboard"), `frontend-design:frontend-design` y `ui-ux-pro-max` (jerarquía visual de grupos anidados, indentación, paleta, headers por nivel). Aplicá sus DOs al render.

- [ ] **Step 1: Reescribir el componente — recursivo**

Replace `src/components/employees/grouped-employee-table.tsx` con un render recursivo. Claves de diseño:
- Props: `{ nodes: GroupNode<T>[]; columns: GroupedTableColumn[]; renderRow: (emp:T)=>ReactNode; searchActive: boolean; isGrouped: boolean }`.
- **`isGrouped === false`** (levels none → un nodo hoja "all"): render plano — `<Table className="table-fixed min-w-[1000px]">` dentro de un wrapper `overflow-x-auto` enfocable (igual que hoy).
- **Agrupado**: un componente interno recursivo `GroupNodeView({ node, depth, path, columns, renderRow, collapsed, onToggle })`:
  - `nodePath = path ? `${path}/${node.key}` : node.key` (clave única en el árbol para el colapso).
  - `<details open={!collapsed.has(nodePath)} onToggle={...actualiza collapsed con nodePath...}>`.
  - `<summary>` con indentación `style={{ paddingLeft: `${depth * 1.25 + 1}rem` }}`, chevron (rota con `[details:not([open])_&]`), `node.label` + `· {node.count}`. Fondo del header que distinga el nivel (ej. nivel 0 `bg-muted/50`, nivel 1 `bg-muted/30`) — afinar con ui-ux-pro-max/frontend-design.
  - Si `node.children`: renderiza `node.children.map((c) => <GroupNodeView depth={depth+1} path={nodePath} ... />)`.
  - Si `node.employees` (hoja): el wrapper scrollable enfocable + `content-visibility:auto` + `contain-intrinsic-size` + `<Table table-fixed min-w-[1000px]>` con `<HeaderRow columns />` y `employees.map(renderRow)`.
- **Colapso unificado** (preservar lo ya corregido): `useEffect(() => { if (searchActive) setCollapsed(new Set()) }, [searchActive])`; `open`/`onToggle` derivan siempre de `collapsed` (por `nodePath`). "Expandir/Colapsar todo": recolectar todos los `nodePath` del árbol (función recursiva `collectPaths(nodes, parent)`), y setear/limpiar el Set.
- El `groupBy` prop ya no aplica (es multinivel) — quitar; usar `isGrouped`.

(El código exacto del JSX lo afinás con los 3 skills; respetá: `<details>` nativo, marcador oculto, `min-w` + `overflow-x-auto` para scroll, indentación por `depth`, content-visibility en hojas.)

- [ ] **Step 2: Verificar typecheck del componente aislado**

Run: `npm run typecheck`
Expected: errores SOLO en `page.tsx` (aún pasa `groups`/`groupBy` viejos) — se arreglan en Task 3. El componente en sí sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/employees/grouped-employee-table.tsx
git commit -m "feat(employees): render recursivo de grupos anidados (details nativos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Estado multinivel + UI cascada + polish de barra (page.tsx)

**Files:**
- Modify: `src/app/(authenticated)/employees/page.tsx`

**Interfaces:**
- Consumes: `groupEmployeesMulti`, `GroupBy` (Task 1); `<GroupedEmployeeTable>` (Task 2).

- [ ] **Step 0 (OBLIGATORIO): invocar los 3 skills de UI** (para la barra y la cascada): `modern-web-guidance` (query "form filter bar select width layout accessible"), `frontend-design`, `ui-ux-pro-max`.

- [ ] **Step 1: Estado `groupLevels` + migración localStorage**

En `page.tsx`, reemplazar el estado `groupBy` (~268-287) por:

```ts
  const [groupLevels, setGroupLevels] = useState<GroupBy[]>(["location"]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawNew = window.localStorage.getItem("employees:groupLevels");
    if (rawNew) {
      try {
        const parsed = JSON.parse(rawNew);
        if (Array.isArray(parsed) && parsed.every((x) => ["location","department","position","none"].includes(x))) {
          setGroupLevels(parsed.length ? parsed : ["none"]);
          return;
        }
      } catch { /* ignore */ }
    }
    const old = window.localStorage.getItem("employees:groupBy"); // migración
    if (old === "location" || old === "department" || old === "position" || old === "none") {
      setGroupLevels([old]);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("employees:groupLevels", JSON.stringify(groupLevels));
    }
  }, [groupLevels]);
```

- [ ] **Step 2: Derivar `groups` con el helper multinivel**

Reemplazar el `useMemo` de `groups` (~478) por:

```ts
  const groups = useMemo(
    () => groupEmployeesMulti(filteredEmployees, groupLevels),
    [filteredEmployees, groupLevels],
  );
  const isGrouped = groupLevels[0] !== "none";
```

Y el import: `import { groupEmployeesMulti, type GroupBy } from "@/lib/employee-grouping";`.

- [ ] **Step 3: Columnas ocultas desde `groupLevels`**

Reemplazar `hiddenColumnKey` (~955-961) por un set derivado de todos los niveles:

```ts
  const hiddenColumnKeys = new Set<string>();
  if (groupLevels.includes("location")) hiddenColumnKeys.add("location");
  if (groupLevels.includes("position")) hiddenColumnKeys.add("position");
  const visibleColumns = columns.filter((c) => !hiddenColumnKeys.has(c.key));
```

Y en `renderEmployeeRow`, las guardas por celda que ocultan Sede/Posición deben usar `hiddenColumnKeys` (una sola fuente de verdad).

- [ ] **Step 4: UI cascada "Agrupar por / luego por"**

Reemplazar el `Select` de "Agrupar por" (~1225-1235) por la cascada. Nivel 1 setea `groupLevels[0]` (preservando o limpiando el nivel 2); el "luego por" aparece si nivel 1 ≠ "none", con opciones = criterios menos el nivel 1 + "Ninguno":

```tsx
{/* Nivel 1 */}
<Select
  value={groupLevels[0] ?? "none"}
  onValueChange={(v) => setGroupLevels(v === "none" ? ["none"] : [v as GroupBy, ...(groupLevels[1] && groupLevels[1] !== v ? [groupLevels[1]] : [])])}
>
  <SelectTrigger className="min-w-[190px] w-auto"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="location">Agrupar por sede</SelectItem>
    <SelectItem value="department">Agrupar por departamento</SelectItem>
    <SelectItem value="position">Agrupar por posición</SelectItem>
    <SelectItem value="none">Sin agrupar</SelectItem>
  </SelectContent>
</Select>
{/* Nivel 2 (solo si hay nivel 1 agrupable) */}
{isGrouped && (
  <Select
    value={groupLevels[1] ?? "none"}
    onValueChange={(v) => setGroupLevels(v === "none" ? [groupLevels[0]] : [groupLevels[0], v as GroupBy])}
  >
    <SelectTrigger className="min-w-[190px] w-auto"><SelectValue placeholder="luego por…" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="none">luego por: (ninguno)</SelectItem>
      {(["location","department","position"] as GroupBy[])
        .filter((g) => g !== groupLevels[0])
        .map((g) => (
          <SelectItem key={g} value={g}>
            {g === "location" ? "luego por sede" : g === "department" ? "luego por departamento" : "luego por posición"}
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
)}
```

- [ ] **Step 5: Polish de la barra (anchos + layout)**

En la barra (~1158): que NINGÚN select trunque su texto — cambiar los `w-[180px]`/`w-[200px]`/`w-[190px]` por `w-auto min-w-[…]` con un min suficiente (Departamento ~`min-w-[210px]`). Reorganizar el contenedor para separar visualmente el bloque de **filtros** (Buscar · Estado · Sede · Departamento) del bloque **"Agrupar por / luego por"** (ej. un wrapper con `gap` y un separador / `ml-auto` o un segundo grupo), alineado a la izquierda y `flex-wrap` prolijo. Revisar el `flex-1`+`max-w-sm` de la búsqueda para que no deje hueco. Aplicar jerarquía/espaciado de ui-ux-pro-max + frontend-design.

- [ ] **Step 6: Integrar el componente**

Reemplazar la llamada `<GroupedEmployeeTable groups={groups} groupBy={groupBy} ... />` (~1264) por:

```tsx
<GroupedEmployeeTable
  nodes={groups}
  columns={visibleColumns}
  isGrouped={isGrouped}
  searchActive={hasActiveFilters}
  renderRow={renderEmployeeRow}
/>
```

- [ ] **Step 7: Verificar typecheck + tests**

Run: `npm run typecheck` (exit 0) y `npm run test` (verde, incluido `employee-grouping`).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(authenticated)/employees/page.tsx"
git commit -m "feat(employees): cascada Agrupar por/luego por (multinivel) + polish de barra

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Validación final

- [ ] **Step 1: Suite + typecheck**

Run: `npm run test` y `npm run typecheck` (exit 0).

- [ ] **Step 2: Verificación manual / checklist**

Confirmar: Sede→Departamento anidado con conteos; grupos y empleados A→Z; "Sin asignar" al final; búsqueda auto-expande; Expandir/Colapsar todo; columnas de los criterios ocultas; "Sin agrupar" = plano; la barra no trunca y queda alineada; el `groupBy` viejo migra a `groupLevels`.

- [ ] **Step 3: `/code-review` del diff de la rama**

Correr `/code-review` sobre `main...feature/employees-multilevel-grouping`. Foco: a11y de `<details>` anidados (foco por teclado, marcador oculto, find-in-page), unicidad de las keys de colapso (path), alineación de columnas con indentación, que `renderEmployeeRow` no rompa acciones, migración localStorage, recomputos.

- [ ] **Step 4: Commit de fixes (si aplica)**

```bash
git add -A
git commit -m "fix: ajustes de code-review en agrupación multinivel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review del plan

**Spec coverage:**
- Pieza 1 (helper multinivel) → Task 1 ✓
- Pieza 2 (estado + UI cascada) → Task 3 ✓
- Pieza 3 (render anidado) → Task 2 ✓
- Pieza 4 (polish barra) → Task 3 Step 5 ✓
- 3 skills UI obligatorios → Task 2 Step 0 + Task 3 Step 0 ✓
- Orden A→Z, "Sin asignar" al final → Task 1 (helper) + tests ✓
- Migración localStorage → Task 3 Step 1 ✓
- Testing (helper Vitest) → Task 1 ✓; validación → Task 4 ✓

**Placeholder scan:** el helper y los cambios de estado/cascada son código literal. El JSX visual exacto del render anidado y el polish de barra se delega a los 3 skills de UI (instrucción explícita del usuario + spec), con la estructura/comportamiento fijados (details nativos, indentación por depth, min-w/scroll, content-visibility) — no es un placeholder de lógica.

**Type consistency:** `GroupNode<T>` (con `children`/`employees` nullable), `groupEmployeesMulti(employees, levels)`, `groupLevels: GroupBy[]`, `isGrouped` consistentes entre Task 1 (def), Task 2 (render) y Task 3 (page). `EmployeeForGrouping` gana `first_name`/`last_name`; `ProfileWithJoins` los tiene (compatible).
