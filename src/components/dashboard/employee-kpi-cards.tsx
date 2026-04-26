"use client";

import { useMemo } from "react";
import { Calendar, Clock, CalendarClock, Sun, PartyPopper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import type { ContractType, EmployeeEquityRollup, Profile } from "@/lib/types";
import type { UpcomingShift } from "@/hooks/use-my-equity-dashboard";

interface Props {
  profile: Profile;
  contract: ContractType | null;
  rollups: EmployeeEquityRollup[];
  upcomingShifts: UpcomingShift[];
  shiftsThisMonth: number;
  hoursThisWeek: number;
  hoursWeekMax: number;
}

function relativeDateLabel(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  const dow = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()];
  const day = d.getDate();
  const month = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][d.getMonth()];
  return `${dow} ${day} ${month}`;
}

function fmtTime(t: string): string {
  return t.slice(0, 5);
}

export function EmployeeKpiCards({
  profile,
  contract,
  rollups,
  upcomingShifts,
  shiftsThisMonth,
  hoursThisWeek,
  hoursWeekMax,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const qWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const qSundays = sumRollupField(rollups, profile.id, qWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, profile.id, qWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? null;
  const maxHol = contract?.max_holidays_per_quarter ?? null;

  const next = upcomingShifts[0];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Turnos del mes</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{shiftsThisMonth}</div>
          <p className="text-xs text-muted-foreground">asignados</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Horas esta semana</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{hoursThisWeek}</div>
          <p className="text-xs text-muted-foreground">de {hoursWeekMax}h máximo</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Próximo turno</CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {next ? (
            <>
              <div className="text-2xl font-bold capitalize">
                {relativeDateLabel(next.date)}
              </div>
              <p className="text-xs text-muted-foreground">
                {fmtTime(next.start_time)}–{fmtTime(next.end_time)}
                {next.position_name ? ` · ${next.position_name}` : ""}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Sin turnos próximos</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Domingos Q{Math.ceil(quarter.months[0] / 3)} {quarter.year}
          </CardTitle>
          <Sun className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{qSundays}</div>
          <p className="text-xs text-muted-foreground">
            de {maxSun ?? "—"} máximo
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Festivos Q{Math.ceil(quarter.months[0] / 3)} {quarter.year}
          </CardTitle>
          <PartyPopper className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{qHolidays}</div>
          <p className="text-xs text-muted-foreground">
            de {maxHol ?? "—"} máximo
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
