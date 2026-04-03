"use client";

import { Fragment } from "react";
import { cn, getDayAbbreviation, isWeekend, formatDateISO, entryMapKey } from "@/lib/utils";
import { ScheduleCell } from "./schedule-cell";
import type { Profile, ScheduleEntry } from "@/lib/types";

interface ScheduleCalendarGridProps {
  dates: Date[];
  employees: Profile[];
  entryMap: Record<string, ScheduleEntry>;
  canEdit: boolean;
  onCellClick: (employeeId: string, date: string, entry: ScheduleEntry | null) => void;
}

export function ScheduleCalendarGrid({
  dates,
  employees,
  entryMap,
  canEdit,
  onCellClick,
}: ScheduleCalendarGridProps) {
  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No hay empleados asignados a esta sede.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <div
        className="min-w-max"
        style={{
          display: "grid",
          gridTemplateColumns: `180px repeat(${dates.length}, minmax(72px, 1fr))`,
        }}
      >
        {/* Header row: empty corner + day headers */}
        <div className="sticky left-0 z-10 border-b border-r bg-card p-2 font-medium text-sm">
          Empleado
        </div>
        {dates.map((date) => {
          const weekend = isWeekend(date);
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "border-b p-1 text-center text-xs",
                weekend ? "bg-muted/50" : "bg-card"
              )}
            >
              <div className="font-medium">{getDayAbbreviation(date)}</div>
              <div className="text-muted-foreground">{date.getDate()}</div>
            </div>
          );
        })}

        {/* Employee rows */}
        {employees.map((employee) => (
          <Fragment key={employee.id}>
            {/* Employee name cell (sticky left) */}
            <div
              className="sticky left-0 z-10 flex items-center border-b border-r bg-card px-2 py-1"
            >
              <div className="truncate text-sm">
                <div className="font-medium">
                  {employee.first_name} {employee.last_name}
                </div>
                {employee.position && (
                  <div className="text-xs text-muted-foreground truncate">
                    {employee.position.name}
                  </div>
                )}
              </div>
            </div>

            {/* Day cells */}
            {dates.map((date) => {
              const dateStr = formatDateISO(date);
              const key = entryMapKey(employee.id, dateStr);
              const entry = entryMap[key] || null;
              const weekend = isWeekend(date);

              return (
                <div
                  key={`${employee.id}-${dateStr}`}
                  className={cn(
                    "border-b p-0.5 min-h-12",
                    weekend ? "bg-muted/30" : ""
                  )}
                >
                  <ScheduleCell
                    entry={entry}
                    canEdit={canEdit}
                    onClick={() => onCellClick(employee.id, dateStr, entry)}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
