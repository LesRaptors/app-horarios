import type {
  WorkCycleParams,
  WeekendRotationParams,
  PostNightRestParams,
  MaxConsecutiveNightsParams,
  ScheduleEntry,
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

function countTrailingConsecutiveNights(
  recent: ScheduleEntry[],
  beforeDate: string,
): number {
  const sorted = [...recent]
    .filter((e) => e.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  let count = 0;
  let expectedDate = (() => {
    const d = new Date(beforeDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  for (const entry of sorted) {
    if (entry.date !== expectedDate) break;
    const isNight = entry.start_time >= "21:00" || entry.start_time < "06:00";
    if (!isNight) break;
    count++;
    const d = new Date(expectedDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    expectedDate = d.toISOString().slice(0, 10);
  }
  return count;
}

export function isPostNightRest(
  params: PostNightRestParams,
  date: string,
  recent: ScheduleEntry[],
): boolean {
  // Find the most recent night entry before `date`
  const pastNights = [...recent]
    .filter((e) => {
      if (e.date >= date) return false;
      return e.start_time >= "21:00" || e.start_time < "06:00";
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (pastNights.length === 0) return false;

  const lastNight = pastNights[0];
  const daysSinceLastNight = daysBetweenISO(lastNight.date, date);

  // Only apply if we're still within the rest window
  if (daysSinceLastNight > params.rest_days_required) return false;

  // Count consecutive nights ending at lastNight
  const consecutive = countTrailingConsecutiveNights(recent, lastNight.date) + 1;
  return consecutive >= params.nights_threshold;
}

export function exceedsMaxConsecutiveNights(
  params: MaxConsecutiveNightsParams,
  recent: ScheduleEntry[],
  slotDate: string,
  slotIsNight: boolean,
): boolean {
  if (!slotIsNight) return false;
  const consecutive = countTrailingConsecutiveNights(recent, slotDate);
  return consecutive >= params.max;
}
