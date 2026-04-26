"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTime } from "@/lib/utils";
import type { UpcomingShift } from "@/hooks/use-my-equity-dashboard";

interface Props {
  shifts: UpcomingShift[];
}

export function UpcomingShiftsList({ shifts }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximos turnos</CardTitle>
        <CardDescription>Tus próximos turnos publicados</CardDescription>
      </CardHeader>
      <CardContent>
        {shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes turnos programados.
          </p>
        ) : (
          <div className="space-y-3">
            {shifts.map((shift) => {
              const date = new Date(shift.date + "T00:00:00");
              const dayName = date.toLocaleDateString("es-ES", { weekday: "short" });
              return (
                <div
                  key={shift.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    {shift.position_color && (
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: shift.position_color }}
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {dayName} {formatDate(shift.date)}
                      </p>
                      {shift.position_name && (
                        <p className="text-xs text-muted-foreground">
                          {shift.position_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
