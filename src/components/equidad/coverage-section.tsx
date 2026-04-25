"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageHeatmap } from "./coverage-heatmap";
import type { CoverageData } from "@/hooks/use-equidad-dashboard";

interface Props {
  coverage: CoverageData | null;
}

const kpiBg: Record<string, string> = {
  green: "bg-green-100 text-green-900",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
};

const barBg: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export function CoverageSection({ coverage }: Props) {
  if (!coverage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cobertura operativa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Sin necesidades configuradas para esta sede.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { kpi, byPosition, heatmap } = coverage;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura operativa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={cn(
            "flex items-baseline gap-4 rounded-lg px-4 py-3",
            kpiBg[kpi.color]
          )}
        >
          <span className="text-4xl font-bold tabular-nums">
            {Math.round(kpi.percent)}%
          </span>
          <span className="text-sm">
            {kpi.assigned} asignados de {kpi.required} requeridos
          </span>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium">Por posición</h4>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Posición</th>
                <th className="py-1 text-right font-medium">Asignados</th>
                <th className="py-1 text-right font-medium">Requeridos</th>
                <th className="py-1 text-right font-medium">%</th>
                <th className="py-1 text-left font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {byPosition.map((row) => (
                <tr key={row.position_id} className="border-t">
                  <td className="py-1">{row.position_name}</td>
                  <td className="py-1 text-right tabular-nums">{row.assigned}</td>
                  <td className="py-1 text-right tabular-nums">{row.required}</td>
                  <td className="py-1 text-right tabular-nums">
                    {Math.round(row.percent)}%
                  </td>
                  <td className="py-1 pl-2">
                    <div className="h-2 w-32 overflow-hidden rounded bg-muted">
                      <div
                        className={cn("h-full", barBg[row.color])}
                        style={{ width: `${Math.min(100, row.percent)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {byPosition.length === 0 && (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={5}>
                    Sin posiciones con requerimiento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium">
            {heatmap.mode === "single-month"
              ? "Heatmap día × turno"
              : "Heatmap día de la semana × turno (promedio)"}
          </h4>
          <CoverageHeatmap rows={heatmap.rows} cols={heatmap.cols} cells={heatmap.cells} />
        </div>
      </CardContent>
    </Card>
  );
}
