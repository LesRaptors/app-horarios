"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { getQuarterRange, sumRollupField, getRollingWindow } from "@/lib/equity-helpers";
import type { Profile, EmployeeEquityRollup, ContractType, Position } from "@/lib/types";

interface Props {
  employee: Profile;
  position?: Position | null;
  contract?: ContractType;
  rollups: EmployeeEquityRollup[];  // already filtered to this employee
  currentYear: number;
  currentMonth: number; // 1-12
}

export function EmployeeEquityPanel({
  employee, position, contract, rollups, currentYear, currentMonth,
}: Props) {
  const window3 = useMemo(
    () => getRollingWindow(currentYear, currentMonth, 3),
    [currentYear, currentMonth]
  );

  const quarter = useMemo(
    () => getQuarterRange(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`),
    [currentYear, currentMonth]
  );
  const quarterWindow = quarter.months.map((m) => ({ year: quarter.year, month: m }));

  const monthlyRows = window3.map((w) => {
    const r = rollups.find((x) => x.year === w.year && x.month === w.month);
    return {
      year: w.year,
      month: w.month,
      sundays: r?.sundays_worked ?? 0,
      saturdays: r?.saturdays_worked ?? 0,
      nights: r?.nights_worked ?? 0,
      holidays: r?.holidays_worked ?? 0,
      hours: r?.total_hours ?? 0,
    };
  });

  const qSundays  = sumRollupField(rollups, employee.id, quarterWindow, "sundays_worked");
  const qHolidays = sumRollupField(rollups, employee.id, quarterWindow, "holidays_worked");

  const maxSun = contract?.max_sundays_per_quarter ?? 999;
  const maxHol = contract?.max_holidays_per_quarter ?? 999;

  const monthName = (m: number) =>
    ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-sm">{employee.first_name} {employee.last_name}</p>
        <p className="text-xs text-muted-foreground">
          {contract?.name ?? "Sin contrato"} · {employee.max_hours_per_week}h/sem · {position?.name ?? "Sin posición"}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium mb-1">Equidad — últimos 3 meses</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal"></th>
              {monthlyRows.map((r) => (
                <th key={`${r.year}-${r.month}`} className="text-right font-normal">
                  {monthName(r.month)} {String(r.year).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td>Dom</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.sundays}</td>)}</tr>
            <tr><td>Sáb</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.saturdays}</td>)}</tr>
            <tr><td>Noches</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.nights}</td>)}</tr>
            <tr><td>Festivos</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{r.holidays}</td>)}</tr>
            <tr><td>Horas</td>{monthlyRows.map((r,i) => <td key={i} className="text-right">{Math.round(r.hours)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Q{Math.ceil(currentMonth/3)} {currentYear} — progreso</p>
        <CapBar label="Domingos" value={qSundays}  max={maxSun} />
        <CapBar label="Festivos" value={qHolidays} max={maxHol} />
      </div>
    </div>
  );
}

function CapBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const overCap = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={overCap ? "text-red-600 font-medium" : ""}>
          {value}/{max} {overCap && "⚠"}
          {!overCap && value === max && <Check className="inline h-3 w-3 text-emerald-600 ml-1" />}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${overCap ? "bg-red-500" : value === max ? "bg-emerald-500" : "bg-blue-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
