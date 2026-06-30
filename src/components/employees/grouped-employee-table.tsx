"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { EmployeeGroup, GroupBy } from "@/lib/employee-grouping";

export interface GroupedTableColumn {
  key: string;
  label: string;
  className?: string;
}

interface Props<T> {
  groups: EmployeeGroup<T>[];
  groupBy: GroupBy;
  /** Columnas visibles (la del criterio agrupado ya viene filtrada). */
  columns: GroupedTableColumn[];
  renderRow: (emp: T) => ReactNode;
  /** Cuando hay búsqueda/filtros activos, todos los grupos se fuerzan abiertos. */
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

export function GroupedEmployeeTable<T>({
  groups,
  groupBy,
  columns,
  renderRow,
  searchActive,
}: Props<T>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Sin agrupar: una sola tabla plana (idéntica a la vista clásica).
  if (groupBy === "none") {
    return (
      <Table className="table-fixed">
        <HeaderRow columns={columns} />
        <TableBody>{groups[0]?.employees.map((e) => renderRow(e))}</TableBody>
      </Table>
    );
  }

  const isOpen = (key: string) => (searchActive ? true : !collapsed.has(key));
  const allKeys = groups.map((g) => g.key);
  const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsed.has(k));

  return (
    <div>
      <div className="flex justify-end border-b p-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={searchActive}
          onClick={() =>
            setCollapsed(allCollapsed ? new Set() : new Set(allKeys))
          }
        >
          {allCollapsed ? "Expandir todo" : "Colapsar todo"}
        </Button>
      </div>

      {groups.map((group) => (
        <details
          key={group.key}
          open={isOpen(group.key)}
          onToggle={(e) => {
            // Durante una búsqueda, la apertura la controla `searchActive`.
            if (searchActive) return;
            const open = e.currentTarget.open;
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (open) next.delete(group.key);
              else next.add(group.key);
              return next;
            });
          }}
          className="border-b last:border-0"
        >
          <summary className="flex cursor-pointer select-none list-none items-center gap-2 bg-muted/40 px-4 py-2 text-sm font-medium hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [details:not([open])_&]:-rotate-90" />
            <span>{group.label}</span>
            <span className="text-muted-foreground">
              · {group.employees.length}
            </span>
          </summary>
          {/* content-visibility difiere el render de grupos fuera de pantalla;
              contain-intrinsic-size evita saltos de scroll cuando se omite. */}
          <div
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 600px",
            }}
          >
            <Table className="table-fixed">
              <HeaderRow columns={columns} />
              <TableBody>{group.employees.map((e) => renderRow(e))}</TableBody>
            </Table>
          </div>
        </details>
      ))}
    </div>
  );
}
