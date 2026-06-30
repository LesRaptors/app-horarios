"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DAY_OF_WEEK_SHORT } from "@/lib/constants";
import { makeCellKey } from "@/lib/staffing-helpers";
import type { Position, ShiftTemplate } from "@/lib/types";
import { StaffingCell } from "./staffing-cell";

// Day order for display: Dom(0) Lun(1) Mar(2) Mié(3) Jue(4) Vie(5) Sáb(6)
const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

interface StaffingTabByPositionProps {
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  persisted: Record<string, number>;
  draft: Record<string, number>;
  capacity: Record<string, number>;
  recentCoverage: Record<string, number[]>;
  onCellChange: (key: string, value: number) => void;
  onReplicateAcrossDays: (
    sourceDay: number,
    targetDays: number[],
    scope: { positionIds: string[]; shiftTemplateIds: string[] }
  ) => void;
  onReplicateShiftToShift: (
    sourceShiftId: string,
    targetShiftId: string,
    scope: { positionIds: string[] }
  ) => void;
}

function formatTime(time: string): string {
  // time is "HH:MM:SS" from DB — display as "HH:MM"
  return time.slice(0, 5);
}

export function StaffingTabByPosition({
  positions,
  shiftTemplates,
  persisted,
  draft,
  capacity,
  recentCoverage,
  onCellChange,
  onReplicateAcrossDays,
}: StaffingTabByPositionProps) {
  if (positions.length === 0 || shiftTemplates.length === 0) {
    const missingPositions = positions.length === 0;
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="mb-3 text-sm">
            {missingPositions
              ? "No hay posiciones configuradas para esta sede."
              : "No hay turnos plantilla configurados para esta sede."}
          </p>
          <p className="text-xs">
            {missingPositions
              ? "Crea posiciones primero en Configuración → Posiciones."
              : "Crea turnos plantilla primero en Configuración → Turnos."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {positions.map((position) => {
        const posCapacity = capacity[position.id] ?? 0;
        const shiftTemplateIds = shiftTemplates.map((s) => s.id);

        return (
          <Card key={position.id}>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <CardTitle className="text-base font-semibold">
                {position.name}
              </CardTitle>
              <Badge
                variant={posCapacity === 0 ? "destructive" : "secondary"}
                className="text-xs"
              >
                · {posCapacity} empleados
              </Badge>
            </CardHeader>

            <CardContent className="overflow-x-auto p-0 pb-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground w-44">
                      Turno
                    </th>
                    {DAY_ORDER.map((dayIndex) => (
                      <th
                        key={dayIndex}
                        scope="col"
                        className="px-1 py-2 text-center font-medium text-muted-foreground min-w-[72px]"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{DAY_OF_WEEK_SHORT[dayIndex]}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 rounded-sm"
                                title={`Opciones para ${DAY_OF_WEEK_SHORT[dayIndex]}`}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                              <DropdownMenuItem
                                onSelect={() =>
                                  onReplicateAcrossDays(
                                    dayIndex,
                                    DAY_ORDER.filter((d) => d !== dayIndex),
                                    {
                                      positionIds: [position.id],
                                      shiftTemplateIds,
                                    }
                                  )
                                }
                              >
                                Replicar a toda la semana
                              </DropdownMenuItem>
                              {dayIndex === 1 && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    onReplicateAcrossDays(
                                      dayIndex,
                                      [2, 3, 4, 5],
                                      {
                                        positionIds: [position.id],
                                        shiftTemplateIds,
                                      }
                                    )
                                  }
                                >
                                  Replicar lunes a M–V
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-1 py-2 text-center font-medium min-w-[72px]"
                    >
                      <span className="text-amber-600">Festivo</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shiftTemplates.map((shift) => (
                    <tr key={shift.id} className="border-b last:border-0">
                      <td className="px-4 py-2 max-w-[176px]">
                        <span
                          className="block truncate text-sm"
                          title={`${shift.name} · ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`}
                        >
                          {shift.name}{" "}
                          <span className="text-muted-foreground text-xs">
                            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                          </span>
                        </span>
                      </td>
                      {DAY_ORDER.map((dayIndex) => {
                        const key = makeCellKey(
                          position.id,
                          shift.id,
                          dayIndex,
                          false
                        );
                        const value = draft[key] ?? persisted[key] ?? 0;
                        return (
                          <td key={dayIndex} className="px-1 py-1.5">
                            <StaffingCell
                              value={value}
                              capacity={posCapacity}
                              recentCoverage={recentCoverage[key] ?? []}
                              onChange={(v) => onCellChange(key, v)}
                              ariaLabel={`${position.name} ${shift.name} ${DAY_OF_WEEK_SHORT[dayIndex]}`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-1 py-1.5 bg-amber-50/40">
                        {(() => {
                          const key = makeCellKey(position.id, shift.id, 0, true);
                          const value = draft[key] ?? persisted[key] ?? 0;
                          return (
                            <StaffingCell
                              value={value}
                              capacity={posCapacity}
                              recentCoverage={[]}
                              onChange={(v) => onCellChange(key, v)}
                              ariaLabel={`${position.name} ${shift.name} Festivo`}
                            />
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
