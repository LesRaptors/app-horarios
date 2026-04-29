import type {
  WorkCycleParams,
  WeekendRotationParams,
} from "./types";

function daysBetweenISO(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function dowUTC(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

export function isWorkCycleRest(
  params: WorkCycleParams,
  date: string,
): boolean {
  const offset = daysBetweenISO(params.cycle_start_date, date);
  if (offset < 0) return false;
  const cycleLen = params.work_days + params.rest_days;
  if (cycleLen <= 0) return false;
  const positionInCycle = offset % cycleLen;
  return positionInCycle >= params.work_days;
}

function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function isWeekendRotationRest(
  params: WeekendRotationParams,
  date: string,
): boolean {
  const dow = dowUTC(date);
  if (dow === 6 && !params.include_saturday) return false;
  if (dow === 0 && !params.include_sunday) return false;
  if (dow !== 0 && dow !== 6) return false;
  const week = isoWeekNumber(date);
  return week % params.every_n_weeks === params.offset;
}
