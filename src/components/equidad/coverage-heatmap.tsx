"use client";

import { cn } from "@/lib/utils";
import type { CoverageHeatmapCell } from "@/hooks/use-equidad-dashboard";

interface Props {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cells: CoverageHeatmapCell[];
}

const colorClass: Record<string, string> = {
  green: "bg-green-200 text-green-900",
  yellow: "bg-amber-200 text-amber-900",
  red: "bg-red-200 text-red-900",
};

export function CoverageHeatmap({ rows, cols, cells }: Props) {
  const cellByKey = new Map<string, CoverageHeatmapCell>();
  for (const c of cells) cellByKey.set(`${c.rowKey}|${c.colKey}`, c);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium">
              Turno
            </th>
            {cols.map((c) => (
              <th key={c.key} className="px-1 py-1 text-center font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="sticky left-0 bg-background px-2 py-1 font-medium">
                {r.label}
              </td>
              {cols.map((c) => {
                const cell = cellByKey.get(`${r.key}|${c.key}`);
                if (!cell || cell.percent === null) {
                  return (
                    <td
                      key={c.key}
                      className="h-7 w-7 rounded bg-muted text-center text-muted-foreground"
                      title="Sin requerimiento"
                    >
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={c.key}
                    className={cn(
                      "h-7 w-7 rounded text-center font-medium",
                      colorClass[cell.color ?? "green"]
                    )}
                    title={`${cell.assigned}/${cell.required} (${Math.round(cell.percent)}%)`}
                  >
                    {Math.round(cell.percent)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
