"use client";

import { CalendarDays, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";
import type { ScheduleEntry } from "@/lib/types";

interface EmployeeScheduleViewProps {
  entries: ScheduleEntry[];
  month: number;
  year: number;
  loading: boolean;
}

export function EmployeeScheduleView({
  entries,
  month,
  year,
  loading,
}: EmployeeScheduleViewProps) {
  const sortedEntries = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarDays className="h-12 w-12 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium mb-1">Sin turnos asignados</h3>
        <p className="text-sm text-muted-foreground">
          No tienes turnos publicados para {MONTHS[month]} {year}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {sortedEntries.length} turno{sortedEntries.length !== 1 ? "s" : ""} en{" "}
        {MONTHS[month]} {year}
      </p>
      {sortedEntries.map((entry) => {
        const date = new Date(entry.date + "T00:00:00");
        const dayName = date.toLocaleDateString("es-ES", { weekday: "long" });
        const dayNum = date.getDate();

        return (
          <Card key={entry.id}>
            <CardContent className="flex items-center gap-4 p-4">
              {/* Date */}
              <div className="flex-shrink-0 text-center w-14">
                <div className="text-2xl font-bold">{dayNum}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {dayName}
                </div>
              </div>

              {/* Divider */}
              <div className="h-10 w-px bg-border" />

              {/* Shift details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                  </span>
                </div>
                {entry.position && (
                  <Badge
                    className="mt-1 text-xs"
                    style={{
                      backgroundColor: entry.position.color + "20",
                      color: entry.position.color,
                      borderColor: entry.position.color + "40",
                    }}
                  >
                    {entry.position.name}
                  </Badge>
                )}
              </div>

              {/* Notes */}
              {entry.notes && (
                <div className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {entry.notes}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
