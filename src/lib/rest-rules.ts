import type {
  WorkCycleParams,
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
