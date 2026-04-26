"use client";

import { useMemo } from "react";
import { getQuarterRange, sumRollupField } from "@/lib/equity-helpers";
import { CapBar } from "@/components/equidad/cap-bar";
import { ThreeMonthTable } from "@/components/equidad/three-month-table";
import type { Profile, EmployeeEquityRollup, ContractType, Position } from "@/lib/types";

interface Props {
  employee: Profile;
  position?: Position | null;
  contract?: ContractType;
  rollups: EmployeeEquityRollup[]; // already filtered to this employee
  currentYear: number;
  currentMonth: number; // 1-12
}

export function EmployeeEquityPanel({
  employee, position, contract, rollups, currentYear, currentMonth,
}: Props) {
  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const quarterWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const qSundays = sumRollupField(rollups, employee.id, quarterWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, employee.id, quarterWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-sm">
          {employee.first_name} {employee.last_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {contract?.name ?? "Sin contrato"} · {employee.max_hours_per_week}h/sem ·{" "}
          {position?.name ?? "Sin posición"}
        </p>
      </div>

      <ThreeMonthTable
        rollups={rollups}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <div className="space-y-1">
        <p className="text-xs font-medium">
          Q{Math.ceil(currentMonth / 3)} {currentYear} — progreso
        </p>
        <CapBar label="Domingos" value={qSundays} max={maxSun} />
        <CapBar label="Festivos" value={qHolidays} max={maxHol} />
      </div>
    </div>
  );
}
