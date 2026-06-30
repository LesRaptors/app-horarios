# Spec — Agrupación y filtros en la tabla de Empleados

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feature/employees-grouping`

## Contexto y motivación

La tabla de `/employees` es una lista plana. Con multi-sede (3-10 sedes, 50-200 empleados) cuesta navegar y ver la estructura organizacional. El usuario pidió poder agruparla por Sede → Departamento → Posición. Tras evaluar UX, se eligió el patrón **"Agrupar por" configurable** (tipo Notion/Linear): un solo nivel de agrupación colapsable elegible + filtros, en vez de un árbol anidado de 3 niveles (más clics, peor para la tarea diaria de gestionar empleados).

La tabla es **custom** (no usa el `DataTable` compartido): barra con búsqueda (`search`) + filtro demo (`demoFilter`), y una `<Table>` de shadcn con `filteredEmployees.map(...)` (`src/app/(authenticated)/employees/page.tsx`, ~líneas 898-967+). Cada empleado ya trae `location` (Sede), `position.department` (Departamento), `position` (Posición) y `contract_type`.

## Decisiones cerradas

- **Agrupar por:** Sede (default) · Departamento · Posición · **Sin agrupar** (tabla plana actual). Persistido en `localStorage`.
- **Filtros** (además de búsqueda + demo/estado actuales): **Sede** y **Departamento** (dropdowns, default "Todas"/"Todos").
- **Grupos colapsables con `<details>/<summary>` nativo** (guía modern-web-guidance `search-hidden-content`): accesible y la búsqueda "Buscar en página" del navegador encuentra empleados dentro de grupos cerrados. `content-visibility: auto` por grupo (guía `defer-rendering-heavy-content`) para fluidez con 200 empleados.
- **Header de grupo:** nombre + conteo (ej. "EVI Poblado · 12") + chevron.
- **Columna del criterio agrupado se oculta** (al agrupar por Sede, no se repite la columna Sede).
- Empleados sin el campo del criterio → grupo **"Sin asignar"** al final.
- **Búsqueda activa** auto-expande los grupos con coincidencias.
- **"Expandir todo / Colapsar todo"**; default: todos expandidos.
- Todas las acciones de fila actuales (editar, invitar, contrato inline, demo, transferir, eliminar, abrir panel) intactas.

## Fuera de alcance

- Árbol anidado de 3 niveles simultáneos.
- Agrupar por Contrato/Rol/Estado (no seleccionados; fáciles de sumar luego si hacen falta).
- Drag & drop, reordenar, selección masiva.
- Cambiar a `DataTable` compartido (la tabla sigue custom).

---

## Componente 1 — Lógica de agrupación (pura, testeable)

**Archivo:** `src/lib/employee-grouping.ts` (+ test `src/lib/employee-grouping.test.ts`)

Helper puro, sin React, cubierto por Vitest:

```ts
export type GroupBy = "location" | "department" | "position" | "none";

export interface EmployeeGroup {
  key: string;         // id del grupo o "__unassigned__"
  label: string;       // "EVI Poblado", "Sin asignar", etc.
  employees: <tipo del empleado>[];
}

export function groupEmployees(
  employees: EmployeeRow[],
  groupBy: GroupBy,
): EmployeeGroup[];
```

- `groupBy === "none"` → un único grupo con todos (la tabla plana).
- Resuelve el label desde el propio empleado: Sede `emp.location?.name`, Departamento `emp.position?.department?.name`, Posición `emp.position?.name`.
- Empleados sin ese campo → grupo `{ key: "__unassigned__", label: "Sin asignar" }`.
- Grupos ordenados alfabéticamente por `label`; "Sin asignar" siempre al final.
- Determinista (mismo input → mismo orden) para testabilidad.

**Tests:** agrupa por cada criterio; "Sin asignar" recoge los sin campo y va último; orden alfabético; `none` devuelve un grupo con todos.

## Componente 2 — Estado y filtros en la página

**Archivo:** `src/app/(authenticated)/employees/page.tsx`

- Estado nuevo: `groupBy: GroupBy` (init desde `localStorage` clave `employees:groupBy`, default `"location"`; persistir en `useEffect` al cambiar), `filterLocationId: string` (default `"all"`), `filterDepartmentId: string` (default `"all"`).
- Extender el `useMemo` de `filteredEmployees` (~línea 384) para aplicar también `filterLocationId` (compara `emp.location_id`) y `filterDepartmentId` (compara `emp.position?.department?.id` / `emp.department_id`), además de la búsqueda y `demoFilter` ya existentes.
- Derivar `groups = useMemo(() => groupEmployees(filteredEmployees, groupBy), [filteredEmployees, groupBy])`.

**Barra de controles** (junto a la búsqueda + filtro demo actuales, ~898-924):
- `Select` "Agrupar por" (Sede / Departamento / Posición / Sin agrupar).
- `Select` "Sede" (Todas + `locations`).
- `Select` "Departamento" (Todos + `departments`, idealmente filtrados por la sede elegida).
- Botón "Expandir/Colapsar todo" (visible solo si `groupBy !== "none"`).

## Componente 3 — Render agrupado

**Archivo:** `src/components/employees/grouped-employee-table.tsx` (nuevo — extrae el render de la tabla para no inflar `page.tsx`, que ya es grande).

- Props: `groups: EmployeeGroup[]`, `groupBy`, el set de columnas visibles, y los callbacks/render de fila existentes (abrir panel, editar, contrato inline, etc.) — pasados desde `page.tsx` para no duplicar lógica.
- **`groupBy === "none"`**: una `<Table>` plana con todas las columnas (comportamiento actual).
- **Agrupado**: un header de columnas mostrado de forma consistente arriba, y por cada grupo un `<details open>` cuyo `<summary>` es el header del grupo (label + conteo + chevron) y cuyo contenido es la tabla/filas de ese grupo. La **columna del criterio agrupado se omite** del set visible.
  - **Alineación de columnas entre grupos:** usar `table-layout: fixed` con anchos de columna explícitos (clases de ancho consistentes en `TableHead`/`TableCell`), de modo que todos los grupos alineen. (El implementer elige tabla-por-grupo con anchos fijos vs. un grid con `grid-template-columns` compartido — lo que alinee mejor; ambos cumplen `<details>` nativo.)
  - `content-visibility: auto` + `contain-intrinsic-size` en el contenido de cada `<details>`.
- **Estado de expansión:** controlado por React (`open` del `<details>` + `onToggle`). Default todos abiertos. "Colapsar todo" cierra todos; "Expandir todo" abre todos. Con `search` no vacío, los grupos con ≥1 coincidencia se fuerzan abiertos.

## Componente 4 — Estilos

- Header de grupo (`<summary>`): fila sticky-ish con fondo sutil (`bg-muted/40`), `cursor-pointer`, chevron que rota con `[&[open]>summary_.chevron]` o estado React. Quitar el marcador nativo del `<summary>` (`list-style: none` / `[&::-webkit-details-marker]:hidden`).
- Sin emojis; chevron con lucide (`ChevronRight`/`ChevronDown`).
- Respetar dark mode (variables existentes).

## Testing

- **Vitest** (pura lógica): `employee-grouping.test.ts` — los casos del Componente 1.
- Sin tests de componente (el proyecto es pure-logic only). Verificación manual/`/code-review` para la UI.
- `npm run typecheck` y `npm run test` verdes.

## Validación

Flujo `/superpowers`: spec → plan → implementar → `/code-review`. Antes de tocar la UI: **invocar `modern-web-guidance`** (`<details>` disclosure, tabla accesible, content-visibility). `/code-review` final de rama (foco: a11y de los `<details>`, alineación de columnas, que las acciones de fila no se rompan, persistencia localStorage).

## Criterios de éxito

- [ ] Selector "Agrupar por" con Sede (default) / Departamento / Posición / Sin agrupar; persiste entre recargas.
- [ ] Filtros de Sede y Departamento funcionan combinados con la búsqueda y el filtro demo.
- [ ] Grupos colapsables con `<details>` nativo; "Buscar en página" del navegador encuentra empleados en grupos cerrados.
- [ ] Header de grupo con conteo; columna del criterio agrupado oculta; "Sin asignar" al final.
- [ ] Búsqueda auto-expande grupos con coincidencias; "Expandir/Colapsar todo" funciona.
- [ ] Todas las acciones de fila siguen funcionando; "Sin agrupar" = tabla actual.
- [ ] `npm run typecheck` y `npm run test` verdes; `/code-review` sin bloqueadores.

## Riesgos

- **Alineación de columnas** entre grupos (múltiples tablas o grid) — el punto más delicado de la UI; cubierto con `table-fixed`/anchos explícitos o grid compartido.
- **`<details>` controlado**: sincronizar `open` (React) con la interacción nativa del usuario vía `onToggle` para no pelear con el estado.
- `page.tsx` ya es grande (~1900 líneas): extraer el render a `grouped-employee-table.tsx` mantiene el archivo manejable.
