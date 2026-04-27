"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyEquityDashboard } from "@/hooks/use-my-equity-dashboard";
import { ROLE_LABELS } from "@/lib/constants";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import { ThreeMonthTable } from "@/components/equidad/three-month-table";
import { CapBar } from "@/components/equidad/cap-bar";
import { EmployeeKpiCards } from "./employee-kpi-cards";
import { MonthlyTargets } from "./monthly-targets";
import { UpcomingShiftsList } from "./upcoming-shifts-list";
import { PayrollCard } from "./payroll-card";

const monthName = (m: number) =>
  ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][m - 1];

export function EmployeeDashboard() {
  const {
    loading,
    profile,
    contract,
    position,
    rollups,
    upcomingShifts,
    shiftsThisMonth,
    hoursThisWeek,
    hoursWeekMax,
    saturdaysThisMonth,
    nightsThisMonth,
  } = useMyEquityDashboard();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const qWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const qSundays = sumRollupField(rollups, profile.id, qWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, profile.id, qWindow, "holidays_worked");
  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;
  void position;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Hola, {profile.first_name} {profile.last_name}
        </h1>
        <p className="text-muted-foreground">
          {ROLE_LABELS[profile.role]} — Panel personal
        </p>
      </div>

      <PayrollCard />

      <EmployeeKpiCards
        profile={profile}
        contract={contract}
        rollups={rollups}
        upcomingShifts={upcomingShifts}
        shiftsThisMonth={shiftsThisMonth}
        hoursThisWeek={hoursThisWeek}
        hoursWeekMax={hoursWeekMax}
      />

      <Card>
        <CardHeader>
          <CardTitle>Mi equidad — últimos 3 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ThreeMonthTable
            rollups={rollups}
            currentYear={currentYear}
            currentMonth={currentMonth}
            showHeading={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Caps trimestrales (Q{Math.ceil(currentMonth / 3)} {currentYear})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CapBar label="Domingos" value={qSundays} max={maxSun} />
          <CapBar label="Festivos" value={qHolidays} max={maxHol} />
        </CardContent>
      </Card>

      <MonthlyTargets
        saturdays={saturdaysThisMonth}
        saturdaysTarget={contract?.target_saturdays_per_month ?? null}
        nights={nightsThisMonth}
        nightsTarget={contract?.target_nights_per_month ?? null}
        monthLabel={`${monthName(currentMonth)} ${currentYear}`}
      />

      <UpcomingShiftsList shifts={upcomingShifts} />
    </div>
  );
}
