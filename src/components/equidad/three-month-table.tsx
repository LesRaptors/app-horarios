"use client";

import { useMemo } from "react";
import { getRollingWindow } from "@/lib/equity-helpers";
import type { EmployeeEquityRollup } from "@/lib/types";

interface Props {
  rollups: EmployeeEquityRollup[]; // already filtered to one employee
  currentYear: number;
  currentMonth: number; // 1-12
}

const monthName = (m: number) =>
  ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m - 1];

export function ThreeMonthTable({ rollups, currentYear, currentMonth }: Props) {
  const window3 = useMemo(
    () => getRollingWindow(currentYear, currentMonth, 3),
    [currentYear, currentMonth]
  );

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

  return (
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
          <tr>
            <td>Dom</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.sundays}</td>
            ))}
          </tr>
          <tr>
            <td>Sáb</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.saturdays}</td>
            ))}
          </tr>
          <tr>
            <td>Noches</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.nights}</td>
            ))}
          </tr>
          <tr>
            <td>Festivos</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{r.holidays}</td>
            ))}
          </tr>
          <tr>
            <td>Horas</td>
            {monthlyRows.map((r, i) => (
              <td key={i} className="text-right">{Math.round(Number(r.hours))}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
