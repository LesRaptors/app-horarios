import type {
  EmployeeEquityRollup,
  HolidayDate,
  ShiftTemplate,
} from "./types";

export function getQuarter(_year: number, month: number): number {
  return Math.ceil(month / 3);
}

export function getQuarterRange(dateStr: string): { year: number; months: number[] } {
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const q = getQuarter(year, month);
  const start = (q - 1) * 3 + 1;
  return { year, months: [start, start + 1, start + 2] };
}

export function getRollingWindow(
  year: number,
  month: number,
  size: number
): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  let y = year;
  let m = month;
  for (let i = 0; i < size; i++) {
    result.unshift({ year: y, month: m });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return result;
}

export function sumRollupField(
  rollups: EmployeeEquityRollup[],
  employeeId: string,
  window: Array<{ year: number; month: number }>,
  field: keyof EmployeeEquityRollup
): number {
  let total = 0;
  for (const r of rollups) {
    if (r.employee_id !== employeeId) continue;
    const inWindow = window.some((w) => w.year === r.year && w.month === r.month);
    if (!inWindow) continue;
    const v = r[field];
    if (typeof v === "number") total += v;
  }
  return total;
}

export function isHoliday(
  dateStr: string,
  locationId: string,
  holidays: HolidayDate[]
): boolean {
  for (const h of holidays) {
    if (h.date !== dateStr) continue;
    if (h.location_id === null || h.location_id === locationId) return true;
  }
  return false;
}

export function isNightShift(template: ShiftTemplate): boolean {
  return template.is_night;
}

/**
 * Heuristic: does the time range overlap 21:00-06:00?
 * Returns true if any of:
 *  - shift crosses midnight (end < start)
 *  - start >= 21:00
 *  - end <= 06:00
 *  - start < 06:00
 */
export function suggestIsNight(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin < startMin) return true;
  if (startMin >= 21 * 60) return true;
  if (endMin <= 6 * 60) return true;
  if (startMin < 6 * 60) return true;
  return false;
}

export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

export function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00").getTime();
  const to = new Date(toStr + "T00:00:00").getTime();
  return Math.round((to - from) / 86_400_000);
}

export function meanStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

export type ZScoreColor = "blue" | "green" | "yellow" | "red";

export function zScoreColor(
  value: number,
  mean: number,
  stdDev: number
): ZScoreColor {
  if (stdDev === 0) return "green";
  const z = (value - mean) / stdDev;
  if (z >= 1.5) return "red";
  if (z <= -1.5) return "blue";
  if (Math.abs(z) >= 0.5) return "yellow";
  return "green";
}

export type CoverageColor = "red" | "yellow" | "green";

export function coverageColor(percent: number): CoverageColor {
  if (percent >= 95) return "green";
  if (percent >= 80) return "yellow";
  return "red";
}

export function enumerateMonthRange(
  startYM: string,
  endYM: string
): Array<{ year: number; month: number }> {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  let a = { y: sy, m: sm };
  let b = { y: ey, m: em };
  if (a.y > b.y || (a.y === b.y && a.m > b.m)) [a, b] = [b, a];
  const out: Array<{ year: number; month: number }> = [];
  let y = a.y;
  let m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
