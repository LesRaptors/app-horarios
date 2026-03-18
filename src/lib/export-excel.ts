import * as XLSX from "xlsx";
import { formatTime, getMonthDates, formatDateISO, getDayAbbreviation, entryMapKey, calculateDuration } from "./utils";
import { MONTHS } from "./constants";
import type { Profile, ScheduleEntry } from "./types";

export function exportScheduleExcel(
  entries: ScheduleEntry[],
  employees: Profile[],
  month: number,
  year: number,
  locationName: string
) {
  const dates = getMonthDates(year, month);
  const wb = XLSX.utils.book_new();

  // Build entry map
  const entryMap: Record<string, ScheduleEntry> = {};
  for (const e of entries) {
    entryMap[entryMapKey(e.employee_id, e.date)] = e;
  }

  // Sheet 1: Schedule grid
  const headers = [
    "Empleado",
    ...dates.map((d) => `${getDayAbbreviation(d)} ${d.getDate()}`),
  ];

  const scheduleData = employees.map((emp) => {
    const row: Record<string, string> = {
      Empleado: `${emp.first_name} ${emp.last_name}`,
    };
    for (const date of dates) {
      const dateStr = formatDateISO(date);
      const key = `${getDayAbbreviation(date)} ${date.getDate()}`;
      const entry = entryMap[entryMapKey(emp.id, dateStr)];
      row[key] = entry
        ? `${formatTime(entry.start_time)}-${formatTime(entry.end_time)}`
        : "";
    }
    return row;
  });

  const ws1 = XLSX.utils.json_to_sheet(scheduleData, { header: headers });
  XLSX.utils.book_append_sheet(wb, ws1, "Horario");

  // Sheet 2: Summary
  const summaryData = employees.map((emp) => {
    const empEntries = entries.filter((e) => e.employee_id === emp.id);
    let totalHours = 0;
    for (const e of empEntries) {
      const dur = calculateDuration(e.start_time, e.end_time, 0);
      const match = dur.match(/(\d+)h(?:\s+(\d+)m)?/);
      if (match) {
        totalHours += parseInt(match[1]) + (parseInt(match[2] || "0") / 60);
      }
    }

    return {
      Empleado: `${emp.first_name} ${emp.last_name}`,
      Turnos: empEntries.length,
      "Horas totales": Math.round(totalHours * 10) / 10,
      "Promedio horas/turno":
        empEntries.length > 0
          ? Math.round((totalHours / empEntries.length) * 10) / 10
          : 0,
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

  XLSX.writeFile(
    wb,
    `horario-${locationName.toLowerCase().replace(/\s+/g, "-")}-${MONTHS[month].toLowerCase()}-${year}.xlsx`
  );
}
