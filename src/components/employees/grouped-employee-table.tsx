"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GroupNode } from "@/lib/employee-grouping";

export interface GroupedTableColumn {
  key: string;
  label: string;
  className?: string;
}

interface Props<T> {
  /** Árbol de grupos (multinivel) o un único nodo hoja "all" si no se agrupa. */
  nodes: GroupNode<T>[];
  /** `false` → tabla plana sin headers de grupo (un solo nodo hoja). */
  isGrouped: boolean;
  /** Columnas visibles (las de los criterios agrupados ya vienen filtradas). */
  columns: GroupedTableColumn[];
  renderRow: (emp: T) => ReactNode;
  /** Al activarse una búsqueda/filtro, todos los grupos se abren una sola vez y
      el colapso manual previo se restaura al limpiarla (ver `GroupedEmployeeTable`). */
  searchActive: boolean;
}

function HeaderRow({ columns }: { columns: GroupedTableColumn[] }) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((c) => (
          <TableHead key={c.key} className={c.className}>
            {c.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

/** Recolecta el `path` único de TODOS los nodos del árbol (internos y hoja),
    para "Expandir/Colapsar todo". El path es estable entre renders porque se
    deriva de las keys de los nodos. */
function collectPaths<T>(nodes: GroupNode<T>[], parent = ""): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const p = parent ? `${parent}/${node.key}` : node.key;
    out.push(p);
    if (node.children) out.push(...collectPaths(node.children, p));
  }
  return out;
}

/** Fondo del header según la profundidad: el nivel 0 lee como un divisor de
    sección fuerte y los niveles internos se aclaran progresivamente, reforzando
    la jerarquía junto con la indentación (depth cue redundante, no solo color). */
function headerTone(depth: number): string {
  if (depth === 0) return "bg-muted/60 hover:bg-muted";
  if (depth === 1) return "bg-muted/35 hover:bg-muted/55";
  return "bg-muted/20 hover:bg-muted/40";
}

interface LeafTableProps<T> {
  /** Etiqueta accesible de la región scrollable (nombre del grupo, o genérico). */
  label: string;
  columns: GroupedTableColumn[];
  employees: T[];
  renderRow: (emp: T) => ReactNode;
}

/** Tabla hoja: el wrapper scrollable y enfocable + la `<Table>` con sus filas.
    Compartida por la vista plana (sin agrupar) y por cada hoja del árbol, así
    ambas obtienen el mismo `content-visibility` (difiere el render fuera de
    pantalla) y el mismo contenedor de scroll horizontal.

    Memoizada: el estado de colapso vive en `GroupedEmployeeTable`, así que abrir/
    cerrar un grupo re-renderiza los `<summary>` pero NO las filas de las demás
    hojas — sus props (`columns`/`employees`/`renderRow`) conservan identidad y
    `memo` corta el re-render. */
function LeafTableInner<T>({ label, columns, employees, renderRow }: LeafTableProps<T>) {
  // Región scrollable y enfocable por teclado (tabIndex + role/aria-label): en
  // pantallas angostas la tabla (min-width) desborda y este contenedor hace
  // scroll horizontal en vez de aplastar las columnas. Se neutraliza el wrapper
  // interno de shadcn ([&>div]:overflow-visible) para tener un único contenedor
  // de scroll, el enfocable.
  // content-visibility difiere el render de hojas fuera de pantalla;
  // contain-intrinsic-size evita saltos de scroll cuando se omite.
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto [&>div]:overflow-visible"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 600px",
      }}
    >
      <Table className="table-fixed min-w-[1000px]">
        <HeaderRow columns={columns} />
        <TableBody>{employees.map((e) => renderRow(e))}</TableBody>
      </Table>
    </div>
  );
}
const LeafTable = memo(LeafTableInner) as unknown as typeof LeafTableInner;

interface GroupNodeViewProps<T> {
  node: GroupNode<T>;
  depth: number;
  /** Path acumulado del ancestro (vacío en la raíz). */
  path: string;
  columns: GroupedTableColumn[];
  renderRow: (emp: T) => ReactNode;
  collapsed: Set<string>;
  onToggle: (path: string, open: boolean) => void;
}

/** Render recursivo de un nodo del árbol. Nodo interno → `<details>` con sus
    hijos recursivos; nodo hoja → `<details>` con `<LeafTable>` (scrollable +
    diferida). Se usa `<details>` NATIVO a propósito: en navegadores Chromium la
    búsqueda del navegador (Buscar en página) auto-expande un grupo cerrado y
    revela la coincidencia, cosa que `display:none` rompería. (Firefox/Safari no
    auto-expanden `<details>`; ahí la coincidencia oculta no se revela sola.)

    Memoizado: en re-renders del padre por motivos ajenos al colapso (props
    estables) corta el trabajo; el aislamiento de filas lo garantiza `LeafTable`. */
function GroupNodeViewInner<T>({
  node,
  depth,
  path,
  columns,
  renderRow,
  collapsed,
  onToggle,
}: GroupNodeViewProps<T>) {
  const nodePath = path ? `${path}/${node.key}` : node.key;

  return (
    <details
      // `open` deriva SIEMPRE de `collapsed` (por `nodePath`), y `onToggle` lo
      // actualiza, así el estado de React y el DOM nunca divergen.
      open={!collapsed.has(nodePath)}
      onToggle={(e) => onToggle(nodePath, e.currentTarget.open)}
      className="border-b last:border-0"
    >
      <summary
        className={cn(
          "flex cursor-pointer select-none list-none items-center gap-2 py-2 pr-4 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "[&::-webkit-details-marker]:hidden",
          headerTone(depth),
          depth === 0
            ? "font-semibold text-foreground"
            : "font-medium text-foreground/90",
        )}
        // Indentación creciente por nivel: ancla visualmente cada grupo bajo su
        // ancestro. El contenido de la tabla hoja queda full-width (scroll H).
        style={{ paddingLeft: `${depth * 1.25 + 1}rem` }}
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none [details:not([open])_&]:-rotate-90" />
        <span className="truncate">{node.label}</span>
        <span className="ml-0.5 rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {node.count}
          <span className="sr-only"> empleados</span>
        </span>
      </summary>

      {node.children ? (
        node.children.map((child) => (
          <GroupNodeView
            key={child.key}
            node={child}
            depth={depth + 1}
            path={nodePath}
            columns={columns}
            renderRow={renderRow}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        ))
      ) : (
        <LeafTable
          label={node.label}
          columns={columns}
          employees={node.employees ?? []}
          renderRow={renderRow}
        />
      )}
    </details>
  );
}
const GroupNodeView = memo(GroupNodeViewInner) as unknown as typeof GroupNodeViewInner;

export function GroupedEmployeeTable<T>({
  nodes,
  isGrouped,
  columns,
  renderRow,
  searchActive,
}: Props<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Búsqueda/filtro: al pasar de inactiva→activa guardamos el colapso manual y
  // abrimos todos los grupos (para no ocultar coincidencias). Durante la búsqueda
  // el usuario puede colapsar/expandir libremente. Al pasar de activa→inactiva
  // restauramos el colapso que tenía antes de buscar. `open`/`onToggle` derivan
  // SIEMPRE de `collapsed`, así que no hay divergencia con el DOM.
  const prevSearchActive = useRef(searchActive);
  const savedCollapsed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const was = prevSearchActive.current;
    if (!was && searchActive) {
      savedCollapsed.current = collapsed;
      setCollapsed(new Set());
    } else if (was && !searchActive) {
      setCollapsed(savedCollapsed.current);
    }
    prevSearchActive.current = searchActive;
  }, [searchActive, collapsed]);

  const handleToggle = useCallback((nodePath: string, open: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(nodePath);
      else next.add(nodePath);
      return next;
    });
  }, []);

  // Sin agrupar: una sola tabla plana (idéntica a la vista clásica).
  if (!isGrouped) {
    return (
      <LeafTable
        label="Empleados"
        columns={columns}
        employees={nodes[0]?.employees ?? []}
        renderRow={renderRow}
      />
    );
  }

  const allPaths = collectPaths(nodes);
  const allCollapsed =
    allPaths.length > 0 && allPaths.every((p) => collapsed.has(p));

  return (
    <div>
      <div className="flex justify-end border-b p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setCollapsed(allCollapsed ? new Set() : new Set(allPaths))
          }
        >
          {allCollapsed ? "Expandir todo" : "Colapsar todo"}
        </Button>
      </div>

      {nodes.map((node) => (
        <GroupNodeView
          key={node.key}
          node={node}
          depth={0}
          path=""
          columns={columns}
          renderRow={renderRow}
          collapsed={collapsed}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
