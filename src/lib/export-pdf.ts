import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatTime, getMonthDates, formatDateISO, getDayAbbreviation, entryMapKey } from "./utils";
import { MONTHS } from "./constants";
import type { Profile, ScheduleEntry } from "./types";

export function exportSchedulePdf(
  entries: ScheduleEntry[],
  employees: Profile[],
  month: number,
  year: number,
  locationName: string
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dates = getMonthDates(year, month);

  // Build entry map
  const entryMap: Record<string, ScheduleEntry> = {};
  const employeesWithEntries = new Set<string>();
  for (const e of entries) {
    entryMap[entryMapKey(e.employee_id, e.date)] = e;
    employeesWithEntries.add(e.employee_id);
  }

  // Filter: solo empleados con al menos un turno en el período
  const visibleEmployees = employees.filter((e) => employeesWithEntries.has(e.id));

  // Title
  doc.setFontSize(14);
  doc.text(`Horario — ${locationName} — ${MONTHS[month]} ${year}`, 14, 15);

  // Table headers: Employee + day columns
  const headers = [
    "Empleado",
    ...dates.map((d) => `${getDayAbbreviation(d)} ${d.getDate()}`),
  ];

  // Table body
  const body = visibleEmployees.map((emp) => {
    const row = [`${emp.first_name} ${emp.last_name}`];
    for (const date of dates) {
      const dateStr = formatDateISO(date);
      const entry = entryMap[entryMapKey(emp.id, dateStr)];
      if (entry) {
        row.push(`${formatTime(entry.start_time)}-${formatTime(entry.end_time)}`);
      } else {
        row.push("");
      }
    }
    return row;
  });

  autoTable(doc, {
    startY: 22,
    head: [headers],
    body: body,
    styles: { fontSize: 6, cellPadding: 1.5 },
    headStyles: { fillColor: [59, 130, 246], fontSize: 6 },
    columnStyles: { 0: { cellWidth: 30 } },
    theme: "grid",
  });

  doc.save(`horario-${locationName.toLowerCase().replace(/\s+/g, "-")}-${MONTHS[month].toLowerCase()}-${year}.pdf`);
}
