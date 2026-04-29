"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HealthSummary } from "@/lib/schedule-health";

interface ScheduleHealthPanelProps {
  health: HealthSummary;
  shiftTemplatesById: Record<string, { name: string }>;
  positionsById: Record<string, { name: string }>;
}

export function ScheduleHealthPanel({
  health, shiftTemplatesById, positionsById,
}: ScheduleHealthPanelProps) {
  const [open, setOpen] = useState(false);

  const coverageNoExtrasPct = health.totalRequired > 0
    ? Math.round((health.totalAssignedNoExtras / health.totalRequired) * 100)
    : 0;
  const coverageWithExtrasPct = health.totalRequired > 0
    ? Math.round((health.totalAssigned / health.totalRequired) * 100)
    : 0;

  const allHealthy =
    health.totalRequired > 0
    && health.totalGaps === 0
    && health.totalPendingExtras === 0
    && health.saturatedEmployees.length === 0;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {allHealthy ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            Salud del horario
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {open ? "Ocultar" : "Ver detalle"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Cobertura sin extras: <strong className="text-foreground">{coverageNoExtrasPct}%</strong> ({health.totalAssignedNoExtras}/{health.totalRequired})</span>
          {health.totalPendingExtras > 0 && (
            <span>· Con extras: <strong className="text-amber-700">{coverageWithExtrasPct}%</strong></span>
          )}
          {health.totalGaps > 0 && (
            <span>· <strong className="text-red-700">{health.totalGaps} sin cubrir</strong></span>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {health.saturatedEmployees.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Empleados saturados</h3>
              <ul className="space-y-1 text-sm">
                {health.saturatedEmployees.map((e) => (
                  <li key={e.employeeId}>
                    <div className="flex items-center justify-between">
                      <span>{e.name}</span>
                      <div className="flex gap-1">
                        {e.flags.includes("near_weekly_cap") && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            {Math.round(e.weekHoursPct * 100)}% horas semana
                          </Badge>
                        )}
                        {e.flags.includes("near_consecutive_cap") && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            {e.consecutiveDays} días consecutivos
                          </Badge>
                        )}
                        {e.flags.includes("exceeded") && (
                          <Badge variant="destructive">Excede cap</Badge>
                        )}
                      </div>
                    </div>
                    {e.restDays && e.restDays.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Descansa por regla los días: {e.restDays.map((d) => d.slice(8)).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health.gapsByDay.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Slots sin cubrir ({health.gapsByDay.length})</h3>
              <ul className="space-y-1 text-xs text-muted-foreground max-h-48 overflow-y-auto">
                {health.gapsByDay.map((g, idx) => (
                  <li key={`${g.date}-${g.positionId}-${g.shiftTemplateId}-${idx}`}>
                    <span className="text-foreground">{g.date}</span>
                    {" · "}
                    {positionsById[g.positionId]?.name ?? "Posición desconocida"}
                    {" · "}
                    {shiftTemplatesById[g.shiftTemplateId]?.name ?? "Turno desconocido"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allHealthy && (
            <p className="text-sm text-emerald-700">
              El horario está saludable: cobertura completa, sin extras pendientes ni empleados saturados.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
