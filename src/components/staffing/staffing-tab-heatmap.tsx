"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { makeCellKey } from "@/lib/staffing-helpers";
import { DAY_OF_WEEK_SHORT } from "@/lib/constants";
import type { Position, ShiftTemplate } from "@/lib/types";

// Day order for display: Dom(0) Lun(1) Mar(2) Mié(3) Jue(4) Vie(5) Sáb(6)
const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

function demandColor(v: number): string {
  if (v <= 0) return "bg-slate-50 text-slate-400";
  if (v <= 2) return "bg-emerald-50 text-emerald-900";
  if (v <= 4) return "bg-emerald-100 text-emerald-900";
  if (v <= 6) return "bg-amber-100 text-amber-900";
  if (v <= 9) return "bg-amber-200 text-amber-950";
  return "bg-red-200 text-red-950";
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

interface StaffingTabHeatmapProps {
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  persisted: Record<string, number>;
  draft: Record<string, number>;
  capacity: Record<string, number>;
  onCellChange: (key: string, value: number) => void;
}

export function StaffingTabHeatmap({
  positions,
  shiftTemplates,
  persisted,
  draft,
  onCellChange,
}: StaffingTabHeatmapProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  if (shiftTemplates.length === 0 || positions.length === 0) {
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

  function startEdit(key: string, currentValue: number) {
    setEditingKey(key);
    setEditingValue(currentValue === 0 ? "" : String(currentValue));
  }

  function commitEdit(key: string) {
    const parsed = parseInt(editingValue, 10);
    const newValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
    onCellChange(key, newValue);
    setEditingKey(null);
    setEditingValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent, key: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit(key);
    } else if (e.key === "Escape") {
      setEditingKey(null);
      setEditingValue("");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Demanda por turno, posición y día
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pb-2">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium text-muted-foreground w-32 min-w-[128px]">
                Turno
              </th>
              <th className="sticky left-32 z-10 bg-background px-3 py-2 text-left font-medium text-muted-foreground w-36 min-w-[144px]">
                Posición
              </th>
              {DAY_ORDER.map((dayIndex) => {
                const isWeekend = dayIndex === 0 || dayIndex === 6;
                return (
                  <th
                    key={dayIndex}
                    scope="col"
                    className={cn(
                      "px-2 py-2 text-center font-medium text-muted-foreground min-w-[56px]",
                      isWeekend && "bg-amber-50"
                    )}
                  >
                    {DAY_OF_WEEK_SHORT[dayIndex]}
                  </th>
                );
              })}
              <th
                scope="col"
                className="px-2 py-2 text-center font-medium min-w-[56px] bg-amber-50"
              >
                <span className="text-amber-600">Festivo</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shiftTemplates.map((shift) => {
              const shiftLabel = `${shift.name} · ${formatTime(shift.start_time)}–${formatTime(shift.end_time)}`;
              return positions.map((position, posIdx) => {
                const isFirstRow = posIdx === 0;

                // Render compartido por celda (día de semana y Festivo) para que
                // cualquier cambio de a11y/teclado/edición llegue a ambas columnas.
                const renderCell = (
                  reactKey: React.Key,
                  cellKey: string,
                  label: string,
                  opts: { weekend?: boolean; holiday?: boolean } = {}
                ) => {
                  const value = draft[cellKey] ?? persisted[cellKey] ?? 0;
                  const isEditing = editingKey === cellKey;
                  const baseAria = `${position.name} ${label} ${shift.name}`;
                  return (
                    <td
                      key={reactKey}
                      className={cn(
                        "px-1 py-1 text-center",
                        opts.holiday && "bg-amber-50/40",
                        opts.weekend && !isEditing && "bg-opacity-80"
                      )}
                    >
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={editingValue}
                          autoFocus
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => commitEdit(cellKey)}
                          onKeyDown={(e) => handleKeyDown(e, cellKey)}
                          className="w-10 h-7 text-center text-sm rounded border border-input px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                          aria-label={baseAria}
                        />
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => startEdit(cellKey, value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              startEdit(cellKey, value);
                            }
                          }}
                          className={cn(
                            "mx-auto w-10 h-7 flex items-center justify-center rounded text-sm font-medium cursor-pointer select-none transition-colors hover:opacity-80",
                            demandColor(value)
                          )}
                          title={`${position.name} — ${label} — ${shift.name}: ${value}`}
                          aria-label={`${baseAria}: ${value}. Clic para editar.`}
                        >
                          {value > 0 ? value : "–"}
                        </div>
                      )}
                    </td>
                  );
                };

                return (
                  <tr
                    key={`${shift.id}-${position.id}`}
                    className="border-b last:border-0"
                  >
                    {isFirstRow && (
                      <td
                        rowSpan={positions.length}
                        className="sticky left-0 z-10 bg-muted/50 px-3 py-2 align-top font-medium text-xs leading-snug w-32 min-w-[128px] border-r"
                        title={shiftLabel}
                      >
                        <span className="block">
                          {shift.name}
                        </span>
                        <span className="block text-muted-foreground font-normal mt-0.5">
                          {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                        </span>
                      </td>
                    )}
                    <td className="sticky left-32 z-10 bg-background px-3 py-2 max-w-[144px] border-r">
                      <span
                        className="block truncate text-xs"
                        title={position.name}
                      >
                        {position.name}
                      </span>
                    </td>
                    {DAY_ORDER.map((dayIndex) =>
                      renderCell(
                        dayIndex,
                        makeCellKey(position.id, shift.id, dayIndex, false),
                        DAY_OF_WEEK_SHORT[dayIndex],
                        { weekend: dayIndex === 0 || dayIndex === 6 }
                      )
                    )}
                    {renderCell(
                      "festivo",
                      makeCellKey(position.id, shift.id, 0, true),
                      "Festivo",
                      { holiday: true }
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
