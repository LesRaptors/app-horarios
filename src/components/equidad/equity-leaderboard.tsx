"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  EquityRow,
  EquityColumnStats,
} from "@/hooks/use-equidad-dashboard";
import type { Profile } from "@/lib/types";

interface Props {
  rows: EquityRow[];
  columnStats: EquityColumnStats;
  onRowClick: (employee: Profile) => void;
}

type SortKey = "name" | "turnos" | "D" | "S" | "N" | "F" | "Horas";

const cellBg: Record<string, string> = {
  blue: "bg-blue-100 text-blue-900",
  green: "bg-green-100 text-green-900",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
};

export function EquityLeaderboard({ rows, columnStats, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("Horas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const sign = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") {
      const an = `${a.employee.last_name} ${a.employee.first_name}`.toLowerCase();
      const bn = `${b.employee.last_name} ${b.employee.first_name}`.toLowerCase();
      return an.localeCompare(bn) * sign;
    }
    return ((a[sortKey] as number) - (b[sortKey] as number)) * sign;
  });

  const fmtMu = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carga / equidad</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No hay empleados en esta sede.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga / equidad</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th onClick={() => handleSort("name")} active={sortKey === "name"}>
                  Empleado
                </Th>
                <ThNum onClick={() => handleSort("turnos")} active={sortKey === "turnos"}>
                  Turnos
                </ThNum>
                <ThNum onClick={() => handleSort("D")} active={sortKey === "D"}>
                  D
                </ThNum>
                <ThNum onClick={() => handleSort("S")} active={sortKey === "S"}>
                  S
                </ThNum>
                <ThNum onClick={() => handleSort("N")} active={sortKey === "N"}>
                  N
                </ThNum>
                <ThNum onClick={() => handleSort("F")} active={sortKey === "F"}>
                  F
                </ThNum>
                <ThNum onClick={() => handleSort("Horas")} active={sortKey === "Horas"}>
                  Horas
                </ThNum>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <td />
                <td />
                <td className="py-1 text-right">μ={fmtMu(columnStats.D.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.S.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.N.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.F.mean)}</td>
                <td className="py-1 text-right">μ={fmtMu(columnStats.Horas.mean)}</td>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.employee.id}
                  className="cursor-pointer border-b hover:bg-muted/50"
                  onClick={() => onRowClick(row.employee)}
                >
                  <td className="py-2">
                    {row.employee.first_name} {row.employee.last_name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.turnos}</td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.D])}>
                    {row.D}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.S])}>
                    {row.S}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.N])}>
                    {row.N}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.F])}>
                    {row.F}
                  </td>
                  <td className={cn("py-2 text-right tabular-nums rounded", cellBg[row.colors.Horas])}>
                    {Math.round(row.Horas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="py-2 text-left font-medium">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 px-1", active && "text-foreground")}
        onClick={onClick}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </th>
  );
}

function ThNum({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="py-2 text-right font-medium">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 px-1", active && "text-foreground")}
        onClick={onClick}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    </th>
  );
}
