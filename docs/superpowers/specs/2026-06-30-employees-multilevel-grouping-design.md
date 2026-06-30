# Spec — Agrupación multinivel + polish de la barra (Empleados)

**Fecha:** 2026-06-30
**Estado:** Aprobado (diseño)
**Rama:** `feature/employees-multilevel-grouping`

## Contexto y motivación

Extiende la feature de agrupación de `/employees` (ya en producción, commit `c77dbba`). Dos pedidos del usuario:

1. **Agrupación multinivel** — poder agrupar por **Sede → Departamento** (anidado), no solo por un criterio. Hoy `groupEmployees` (`src/lib/employee-grouping.ts`) agrupa por un único `GroupBy`.
2. **Polish de la barra de controles** — el select de Departamento (`w-[200px]`) **trunca** "Todos los departamentos" → "Todos los...", y los 4 selects con anchos fijos + búsqueda `flex-1` dejan una distribución irregular con espacio en blanco. Se ve desalineado.

## Decisiones cerradas

- **UI cascada "luego por"** (estilo Airtable/Linear): "Agrupar por [nivel 1]" y, si ≠ "Sin agrupar", "luego por [nivel 2]". **Máximo 2 niveles.**
- **Orden A→Z**: grupos por nombre (`localeCompare es`) en cada nivel; dentro de la hoja, empleados por `${first_name} ${last_name}` (A→Z). "Sin asignar" siempre al final de su nivel.
- **Render anidado** con `<details>` dentro de `<details>`, indentación creciente por nivel, conteo en cada header.
- **Skills de UI obligatorios antes de tocar la UI** (pedido explícito del usuario): `modern-web-guidance:modern-web-guidance` + `frontend-design:frontend-design` + `ui-ux-pro-max`. Aplicar sus guías a la barra y al render anidado.

## Fuera de alcance

- 3+ niveles de anidamiento.
- Agrupar por Contrato/Rol/Estado (no pedidos).
- Reordenar niveles por drag & drop.

---

## Pieza 1 — Helper multinivel (`src/lib/employee-grouping.ts`)

**Reemplaza** el `groupEmployees` single-level por una versión multinivel (manteniendo `GroupBy`):

```ts
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

export function groupEmployeesMulti<T extends EmployeeForGrouping>(
  employees: T[],
  levels: GroupBy[],
): GroupNode<T>[];
```

- `levels` sin niveles agrupables (vacío o `["none"]`) → un único nodo hoja con TODOS los empleados ordenados A→Z (la "tabla plana").
- Recursivo: agrupa por `levels[0]`, y para cada grupo agrupa sus empleados por `levels[1..]`. Cuando no quedan niveles, el nodo es hoja (`employees` ordenados A→Z por nombre, `children = null`).
- Orden de grupos en cada nivel: alfabético por `label` (`localeCompare(.., "es")`), "Sin asignar" (`__unassigned__`) al final.
- `count` = total de empleados bajo el nodo (recursivo).
- Resolución de key/label por nivel: Sede `location`, Departamento `position.department`, Posición `position` (igual que hoy; "Sin asignar" si falta el campo).

**Tests (Vitest):** árbol de 2 niveles (Sede→Departamento) con grupos y hojas ordenados A→Z; "Sin asignar" al final en ambos niveles; `count` recursivo correcto; `levels = []`/`["none"]` → un nodo hoja con todos.

## Pieza 2 — Estado + UI cascada (`page.tsx`)

- Estado `groupLevels: GroupBy[]` (default `["location"]`), persistido en `localStorage` clave `employees:groupLevels` (JSON). Migración: si existe el `employees:groupBy` viejo (string), convertirlo a `[valor]` y migrar.
- Derivar `groups = useMemo(() => groupEmployeesMulti(filteredEmployees, groupLevels), [filteredEmployees, groupLevels])`.
- **UI cascada:**
  - Select "Agrupar por" → nivel 1 (`location` / `department` / `position` / `none`).
  - Si nivel 1 ≠ `none`: Select "luego por" → nivel 2, opciones = los criterios menos el de nivel 1, + "Ninguno" (quita el 2º nivel). Máximo 2 niveles (sin 3º).
  - `none` en nivel 1 → tabla plana (sin nivel 2).
- Columnas ocultas: las de cualquier criterio presente en `groupLevels` (Sede si incluye `location`, Posición si incluye `position`; Departamento no es columna). `hiddenColumnKeys = Set` derivado de `groupLevels` (una sola fuente de verdad para header y celdas).

## Pieza 3 — Render anidado (`src/components/employees/grouped-employee-table.tsx`)

- Render recursivo sobre `GroupNode`:
  - **Nodo interno** (`children != null`): `<details>` con `<summary>` (label + `· count` + chevron, indentado según profundidad) que contiene el render de sus `children`.
  - **Nodo hoja** (`employees != null`): `<details>` con la `<Table>` de esos empleados (header de columnas + filas vía `renderRow`).
  - **Indentación creciente por nivel** (padding-left por `depth`), respetando el scroll horizontal (`overflow-x-auto` + `min-w`) ya existente.
- `content-visibility: auto` + `contain-intrinsic-size` en el contenido de las hojas.
- Estado de colapso unificado (Set de keys colapsadas; al activar búsqueda/filtros se abren todos; el toggle siempre reconcilia — preservar el comportamiento ya corregido).
- Caso plano (`groupLevels = ["none"]` → un solo nodo hoja): `<Table>` plana sin `<summary>`.

## Pieza 4 — Polish de la barra de controles (`page.tsx`)

- **Anchos**: los selects usan `min-w` suficiente (o `w-auto` con `min-w`) para no truncar su placeholder/valor ("Todos los departamentos", "Asistencial tiempo completo", etc.).
- **Layout**: agrupar visualmente los **filtros** (Buscar · Estado · Sede · Departamento) y, separado, el bloque **"Agrupar por / luego por"**. Alineación a la izquierda, sin el espacio en blanco irregular; `flex-wrap` prolijo en pantallas angostas. La búsqueda no debe crecer dejando un hueco (revisar el `flex-1` + `max-w-sm`).
- Aplicar las recomendaciones de los 3 skills de UI (jerarquía visual, espaciado, paleta, estados accesibles).

## Validación

Flujo `/superpowers`: spec → plan → implementar → `/code-review`. **Antes de tocar la UI (Piezas 3 y 4): invocar `modern-web-guidance` + `frontend-design` + `ui-ux-pro-max`** y aplicar sus DOs. `/code-review` final de rama (foco: `<details>` anidados a11y + foco por teclado, alineación de columnas con indentación, que las acciones de fila no se rompan, persistencia/migración localStorage, recomputos). `npm run typecheck` y `npm run test` verdes.

## Criterios de éxito

- [ ] Cascada "Agrupar por / luego por" hasta 2 niveles; persiste y migra el `groupBy` viejo.
- [ ] Render anidado Sede→Departamento con `<details>` colapsables, indentación y conteos; "Buscar en página" del navegador encuentra empleados en grupos cerrados.
- [ ] Grupos y empleados ordenados A→Z; "Sin asignar" al final.
- [ ] Columnas de los criterios agrupados ocultas; acciones de fila intactas; "Sin agrupar" = tabla plana.
- [ ] La barra ya no trunca el select de Departamento ni deja espacio en blanco irregular; alineada y prolija.
- [ ] `npm run typecheck` y `npm run test` verdes; `/code-review` sin bloqueadores; los 3 skills de UI aplicados.

## Riesgos

- **Render anidado + alineación de columnas con indentación**: el punto más delicado; cubierto por los 3 skills de UI + `/code-review`.
- **Migración localStorage** (`groupBy` string → `groupLevels` array): manejar el valor viejo sin romper.
- `page.tsx` ya es grande: mantener el render en `grouped-employee-table.tsx`.
