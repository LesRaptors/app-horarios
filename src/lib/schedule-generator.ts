import { getMonthDates, formatDateISO } from "./utils";
import {
  getQuarterRange,
  getRollingWindow,
  sumRollupField,
  isHoliday,
  isNightShift,
  dayOfWeek,
  daysBetween,
} from "./equity-helpers";
import type {
  AutoGenConfig, AutoGenResult, AutoGenWarning,
  ProfileWithPositions, ShiftTemplate, LaborConstraints,
  ScheduleEntry, StaffingRequirement,
  EmployeeEquityRollup, HolidayDate, ContractType, ScoringWeights,
  CapExcessKind,
} from "./types";

interface TimeOffRange {
  employee_id: string;
  start_date: string;
  end_date: string;
}

interface DemandSlot {
  date: string;
  dayOfWeek: number;
  positionId: string;
  shiftTemplateId: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  durationHours: number;
  template: ShiftTemplate;
}

interface EmployeeTracker {
  totalHours: number;
  totalShifts: number;
  weeklyHours: Record<number, number>;
  lastShiftDate: string | null;
  lastShiftStartTime: string | null;
  lastShiftEndTime: string | null;
  lastShiftWasNight: boolean;
  consecutiveDays: number;
  assignedDates: Set<string>;
}

const BLOCK_LENGTH_CAP_FOR_BONUS = 4;

function calcDurationHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60;
  return (totalMin - breakMin) / 60;
}

// ISO 8601 week-of-year: semana empieza lunes, año-semana único.
// Devuelve year*100 + weekNumber (ej. 202615) para evitar colisiones cross-year.
function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNum;
}

function requiredRestHours(lastShiftWasNight: boolean, constraints: LaborConstraints): number {
  return lastShiftWasNight ? 24 : constraints.minRestHoursBetweenShifts;
}

function hasEnoughRest(
  lastEndTime: string, lastDate: string, lastStartTime: string,
  newStartTime: string, newDate: string,
  minRestHours: number,
): boolean {
  // If last shift crossed midnight (end < start), the effective end date is the next day.
  let effectiveEndDate = lastDate;
  const [lsh, lsm] = lastStartTime.split(":").map(Number);
  const [leh, lem] = lastEndTime.split(":").map(Number);
  if (leh * 60 + lem < lsh * 60 + lsm) {
    const d = new Date(lastDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    effectiveEndDate = formatDateISO(d);
  }
  const lastEnd = new Date(`${effectiveEndDate}T${lastEndTime}`);
  const newStart = new Date(`${newDate}T${newStartTime}`);
  const gapHours = (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
  return gapHours >= minRestHours;
}

function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return formatDateISO(d);
}

function buildDemandSlots(
  config: AutoGenConfig, dates: Date[], templates: ShiftTemplate[],
  staffingRequirements: StaffingRequirement[],
): DemandSlot[] {
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const slots: DemandSlot[] = [];
  const reqMap = new Map<string, number>();
  for (const sr of staffingRequirements) {
    reqMap.set(`${sr.position_id}_${sr.shift_template_id}_${sr.day_of_week}`, sr.required_count);
  }
  const hasDemand = staffingRequirements.length > 0 && config.useDemandRequirements;

  for (const date of dates) {
    const dateStr = formatDateISO(date);
    const dow = date.getDay();
    if (config.excludeDates.includes(dateStr)) continue;

    for (const templateId of config.shiftTemplateIds) {
      const template = templateMap.get(templateId);
      if (!template) continue;
      const duration = calcDurationHours(template.start_time, template.end_time, template.break_minutes);

      if (hasDemand) {
        for (const posId of config.positionIds) {
          const count = reqMap.get(`${posId}_${templateId}_${dow}`) ?? 0;
          for (let i = 0; i < count; i++) {
            slots.push({ date: dateStr, dayOfWeek: dow, positionId: posId,
              shiftTemplateId: templateId, startTime: template.start_time,
              endTime: template.end_time, breakMinutes: template.break_minutes,
              durationHours: duration, template });
          }
        }
      } else {
        for (const posId of config.positionIds) {
          slots.push({ date: dateStr, dayOfWeek: dow, positionId: posId,
            shiftTemplateId: templateId, startTime: template.start_time,
            endTime: template.end_time, breakMinutes: template.break_minutes,
            durationHours: duration, template });
        }
      }
    }
  }
  return slots;
}

function buildTimeOffLookup(timeOff: TimeOffRange[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const to of timeOff) {
    if (!map.has(to.employee_id)) map.set(to.employee_id, new Set());
    const dates = map.get(to.employee_id)!;
    const start = new Date(to.start_date + "T00:00:00");
    const end = new Date(to.end_date + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.add(formatDateISO(d));
    }
  }
  return map;
}

interface ScoringContext {
  weights: ScoringWeights;
  rollingRollupSums: Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>;
  quarterRollupSums: Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>;
  targetHours: number;
  targetShifts: number;
  holidays: HolidayDate[];
  locationId: string;
  contractTypes: Map<string, ContractType>;
}

function scoreCandidate(
  employee: ProfileWithPositions, slot: DemandSlot,
  tracker: EmployeeTracker, ctx: ScoringContext,
): number {
  const w = ctx.weights;
  let score = employee.position_id === slot.positionId
    ? w.position_primary_bonus
    : w.position_secondary_bonus;

  score += (ctx.targetHours - tracker.totalHours) * w.hour_deficit_multiplier;
  score += (ctx.targetShifts - tracker.totalShifts) * w.shift_deficit_multiplier;

  const rolling = ctx.rollingRollupSums.get(employee.id) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };
  const dow = dayOfWeek(slot.date);
  if (dow === 0) score -= rolling.sundays * w.sunday_penalty;
  if (dow === 6) score -= rolling.saturdays * w.saturday_penalty;
  if (isNightShift(slot.template)) score -= rolling.nights * w.night_penalty;
  if (isHoliday(slot.date, ctx.locationId, ctx.holidays))
    score -= rolling.holidays * w.holiday_penalty;

  const gap = tracker.lastShiftDate ? daysBetween(tracker.lastShiftDate, slot.date) : null;
  if (gap === 1 && tracker.consecutiveDays < BLOCK_LENGTH_CAP_FOR_BONUS) {
    score += w.block_continuation_bonus;
  } else if (gap === 2) {
    score -= w.fragmentation_penalty;
  } else if (gap !== null && gap >= 3) {
    score += w.clean_restart_bonus;
  }

  return score;
}

function computeExceededCaps(
  employee: ProfileWithPositions, slot: DemandSlot,
  tracker: EmployeeTracker, ctx: ScoringContext,
  constraints: LaborConstraints,
): CapExcessKind[] {
  const caps: CapExcessKind[] = [];
  const contract = ctx.contractTypes.get(employee.contract_type_id);

  const week = getISOWeekNumber(slot.date);
  const currentWeekHours = tracker.weeklyHours[week] || 0;
  const globalCap = constraints.maxHoursPerWeek;
  const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
  const effectiveWeekly = Math.min(globalCap, contractCap, employee.max_hours_per_week);
  if (currentWeekHours + slot.durationHours > effectiveWeekly) caps.push("weekly_hours");

  if (tracker.lastShiftDate === prevDateStr(slot.date)
      && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) {
    caps.push("consecutive_days");
  }

  if (contract) {
    const q = ctx.quarterRollupSums.get(employee.id) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };
    if (dayOfWeek(slot.date) === 0 && q.sundays + 1 > contract.max_sundays_per_quarter)
      caps.push("sundays_quarter");
    if (isHoliday(slot.date, ctx.locationId, ctx.holidays)
        && q.holidays + 1 > contract.max_holidays_per_quarter)
      caps.push("holidays_quarter");
    if (contract.target_nights_per_month !== null && isNightShift(slot.template)) {
      const rn = ctx.rollingRollupSums.get(employee.id)?.nights ?? 0;
      if (rn + 1 > contract.target_nights_per_month) caps.push("night_limit");
    }
  }
  return caps;
}

function filterCandidates(
  candidateIds: string[], slot: DemandSlot,
  employeeMap: Map<string, ProfileWithPositions>, trackers: Map<string, EmployeeTracker>,
  timeOffMap: Map<string, Set<string>>, constraints: LaborConstraints,
  ctx: ScoringContext, allowOvertime: boolean,
): string[] {
  const kept: string[] = [];
  for (const empId of candidateIds) {
    const emp = employeeMap.get(empId);
    const tracker = trackers.get(empId);
    if (!emp || !tracker) continue;

    // INVIOLABLES
    if (tracker.assignedDates.has(slot.date)) continue;
    if (timeOffMap.get(empId)?.has(slot.date)) continue;
    if (slot.durationHours > constraints.maxHoursPerDay) continue;
    if (tracker.lastShiftDate && tracker.lastShiftEndTime && tracker.lastShiftStartTime) {
      const rest = requiredRestHours(tracker.lastShiftWasNight, constraints);
      if (!hasEnoughRest(tracker.lastShiftEndTime, tracker.lastShiftDate, tracker.lastShiftStartTime,
                         slot.startTime, slot.date, rest)) continue;
    }

    if (allowOvertime) { kept.push(empId); continue; }

    // CONTRACTUAL
    const week = getISOWeekNumber(slot.date);
    const contract = ctx.contractTypes.get(emp.contract_type_id);
    const globalCap = constraints.maxHoursPerWeek;
    const contractCap = contract?.target_hours_per_week ?? Number.POSITIVE_INFINITY;
    const effectiveWeekly = Math.min(globalCap, contractCap, emp.max_hours_per_week);
    if ((tracker.weeklyHours[week] || 0) + slot.durationHours > effectiveWeekly) continue;

    if (tracker.lastShiftDate === prevDateStr(slot.date)
        && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;

    if (contract) {
      const q = ctx.quarterRollupSums.get(empId) ?? { sundays: 0, saturdays: 0, nights: 0, holidays: 0 };
      if (dayOfWeek(slot.date) === 0 && q.sundays + 1 > contract.max_sundays_per_quarter) continue;
      if (isHoliday(slot.date, ctx.locationId, ctx.holidays)
          && q.holidays + 1 > contract.max_holidays_per_quarter) continue;
      if (contract.target_nights_per_month !== null && isNightShift(slot.template)) {
        const rn = ctx.rollingRollupSums.get(empId)?.nights ?? 0;
        if (rn + 1 > contract.target_nights_per_month) continue;
      }
    }
    kept.push(empId);
  }
  return kept;
}

function pickBestCandidate(
  candidateIds: string[], employeeMap: Map<string, ProfileWithPositions>,
  trackers: Map<string, EmployeeTracker>, slot: DemandSlot, ctx: ScoringContext,
): string | null {
  if (candidateIds.length === 0) return null;
  let bestId: string | null = null;
  let bestScore = -Infinity;
  let bestShifts = Infinity;
  for (const empId of candidateIds) {
    const emp = employeeMap.get(empId)!;
    const tracker = trackers.get(empId)!;
    const score = scoreCandidate(emp, slot, tracker, ctx);
    if (
      score > bestScore ||
      (score === bestScore && tracker.totalShifts < bestShifts)
    ) {
      bestScore = score;
      bestShifts = tracker.totalShifts;
      bestId = empId;
    }
  }
  return bestId;
}

export function generateSchedule(
  config: AutoGenConfig,
  employees: ProfileWithPositions[],
  templates: ShiftTemplate[],
  existingEntries: ScheduleEntry[],
  timeOff: TimeOffRange[],
  constraints: LaborConstraints,
  staffingRequirements: StaffingRequirement[],
  rollups: EmployeeEquityRollup[],
  holidays: HolidayDate[],
  contractTypes: ContractType[],
  weights: ScoringWeights,
): AutoGenResult {
  const warnings: AutoGenWarning[] = [];
  const entries: AutoGenResult["entries"] = [];
  const stats: Record<string, { shifts: number; hours: number }> = {};

  const selectedEmployees = employees.filter((e) => config.employeeIds.includes(e.id));
  const selectedTemplates = templates.filter((t) => config.shiftTemplateIds.includes(t.id));

  if (selectedTemplates.length === 0) {
    warnings.push({ kind: "no_templates_selected" });
    return { entries, warnings, stats };
  }
  if (selectedEmployees.length === 0) {
    warnings.push({ kind: "no_employees_selected" });
    return { entries, warnings, stats };
  }

  // Rolling 3-month and quarter sums
  const rollingWindow = getRollingWindow(config.year, config.month + 1, 3);
  const quarterRange = getQuarterRange(`${config.year}-${String(config.month + 1).padStart(2, "0")}-01`);
  const quarterWindow = quarterRange.months.map((m) => ({ year: quarterRange.year, month: m }));

  const rollingRollupSums = new Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>();
  const quarterRollupSums = new Map<string, { sundays: number; saturdays: number; nights: number; holidays: number }>();
  for (const emp of selectedEmployees) {
    rollingRollupSums.set(emp.id, {
      sundays: sumRollupField(rollups, emp.id, rollingWindow, "sundays_worked"),
      saturdays: sumRollupField(rollups, emp.id, rollingWindow, "saturdays_worked"),
      nights: sumRollupField(rollups, emp.id, rollingWindow, "nights_worked"),
      holidays: sumRollupField(rollups, emp.id, rollingWindow, "holidays_worked"),
    });
    quarterRollupSums.set(emp.id, {
      sundays: sumRollupField(rollups, emp.id, quarterWindow, "sundays_worked"),
      saturdays: sumRollupField(rollups, emp.id, quarterWindow, "saturdays_worked"),
      nights: sumRollupField(rollups, emp.id, quarterWindow, "nights_worked"),
      holidays: sumRollupField(rollups, emp.id, quarterWindow, "holidays_worked"),
    });
  }

  // Tracker init from existing entries
  const trackers = new Map<string, EmployeeTracker>();
  for (const emp of selectedEmployees) {
    trackers.set(emp.id, {
      totalHours: 0, totalShifts: 0, weeklyHours: {},
      lastShiftDate: null, lastShiftStartTime: null, lastShiftEndTime: null, lastShiftWasNight: false,
      consecutiveDays: 0, assignedDates: new Set(),
    });
    stats[emp.id] = { shifts: 0, hours: 0 };
  }

  const templateById = new Map(templates.map((t) => [t.id, t]));
  const sortedExisting = [...existingEntries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sortedExisting) {
    const t = trackers.get(e.employee_id);
    if (!t) continue;
    const tpl = templateById.get(e.shift_template_id ?? "");
    const dur = calcDurationHours(e.start_time, e.end_time, 0);
    t.totalHours += dur;
    t.totalShifts++;
    const week = getISOWeekNumber(e.date);
    t.weeklyHours[week] = (t.weeklyHours[week] || 0) + dur;
    t.assignedDates.add(e.date);
    stats[e.employee_id].shifts++;
    stats[e.employee_id].hours += dur;

    if (t.lastShiftDate === prevDateStr(e.date)) t.consecutiveDays++;
    else t.consecutiveDays = 1;
    t.lastShiftDate = e.date;
    t.lastShiftStartTime = e.start_time;
    t.lastShiftEndTime = e.end_time;
    t.lastShiftWasNight = tpl?.is_night ?? false;
  }

  const timeOffMap = buildTimeOffLookup(timeOff);
  const contractTypeMap = new Map(contractTypes.map((c) => [c.id, c]));

  const positionEligibility = new Map<string, { primary: string[]; secondary: string[] }>();
  for (const emp of selectedEmployees) {
    if (emp.position_id) {
      if (!positionEligibility.has(emp.position_id))
        positionEligibility.set(emp.position_id, { primary: [], secondary: [] });
      positionEligibility.get(emp.position_id)!.primary.push(emp.id);
    }
    for (const sp of emp.secondary_positions || []) {
      if (!positionEligibility.has(sp.position_id))
        positionEligibility.set(sp.position_id, { primary: [], secondary: [] });
      positionEligibility.get(sp.position_id)!.secondary.push(emp.id);
    }
  }

  const dates = getMonthDates(config.year, config.month);
  const demandSlots = buildDemandSlots(config, dates, selectedTemplates, staffingRequirements);
  const totalDemandHours = demandSlots.reduce((sum, s) => sum + s.durationHours, 0);
  const targetHours = totalDemandHours / selectedEmployees.length;
  const targetShifts = demandSlots.length / selectedEmployees.length;

  const employeeMap = new Map(selectedEmployees.map((e) => [e.id, e]));

  demandSlots.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    const aE = positionEligibility.get(a.positionId);
    const bE = positionEligibility.get(b.positionId);
    const aN = (aE?.primary.length ?? 0) + (aE?.secondary.length ?? 0);
    const bN = (bE?.primary.length ?? 0) + (bE?.secondary.length ?? 0);
    return aN - bN;
  });

  const ctx: ScoringContext = {
    weights, rollingRollupSums, quarterRollupSums,
    targetHours, targetShifts, holidays, locationId: config.locationId,
    contractTypes: contractTypeMap,
  };

  for (const slot of demandSlots) {
    const eligibility = positionEligibility.get(slot.positionId);
    if (!eligibility) {
      warnings.push({ kind: "no_employees_in_position",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }
    const candidateIds = [...eligibility.primary, ...eligibility.secondary];

    // Pass 1
    const pass1 = filterCandidates(candidateIds, slot, employeeMap, trackers, timeOffMap, constraints, ctx, false);
    let chosen = pickBestCandidate(pass1, employeeMap, trackers, slot, ctx);
    let overtimeCaps: CapExcessKind[] = [];

    // Pass 2
    if (!chosen) {
      const pass2 = filterCandidates(candidateIds, slot, employeeMap, trackers, timeOffMap, constraints, ctx, true);
      chosen = pickBestCandidate(pass2, employeeMap, trackers, slot, ctx);
      if (chosen) {
        const emp = employeeMap.get(chosen)!;
        const tracker = trackers.get(chosen)!;
        overtimeCaps = computeExceededCaps(emp, slot, tracker, ctx, constraints);
      }
    }

    if (!chosen) {
      warnings.push({ kind: "no_safe_candidate",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }

    const tracker = trackers.get(chosen)!;
    entries.push({
      schedule_id: config.scheduleId, employee_id: chosen, position_id: slot.positionId,
      date: slot.date, start_time: slot.startTime, end_time: slot.endTime,
      shift_template_id: slot.shiftTemplateId, notes: null,
      exceeds_caps: overtimeCaps,
      overtime_status: overtimeCaps.length > 0 ? "pending" : "none",
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    });
    if (overtimeCaps.length > 0) {
      warnings.push({
        kind: "overtime_assigned",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
        employeeId: chosen, caps: overtimeCaps,
      });
    }

    // Update tracker
    const week = getISOWeekNumber(slot.date);
    tracker.weeklyHours[week] = (tracker.weeklyHours[week] || 0) + slot.durationHours;
    tracker.totalHours += slot.durationHours;
    tracker.totalShifts++;
    if (tracker.lastShiftDate === prevDateStr(slot.date)) tracker.consecutiveDays++;
    else tracker.consecutiveDays = 1;
    tracker.lastShiftDate = slot.date;
    tracker.lastShiftStartTime = slot.startTime;
    tracker.lastShiftEndTime = slot.endTime;
    tracker.lastShiftWasNight = isNightShift(slot.template);
    tracker.assignedDates.add(slot.date);
    stats[chosen].shifts++;
    stats[chosen].hours += slot.durationHours;

    // Update in-run rollup sums so subsequent slots see the updated state
    const isSun = dayOfWeek(slot.date) === 0;
    const isSat = dayOfWeek(slot.date) === 6;
    const isNight = isNightShift(slot.template);
    const isHol = isHoliday(slot.date, ctx.locationId, ctx.holidays);
    const roll = ctx.rollingRollupSums.get(chosen)!;
    if (isSun) roll.sundays++;
    if (isSat) roll.saturdays++;
    if (isNight) roll.nights++;
    if (isHol) roll.holidays++;
    const qq = ctx.quarterRollupSums.get(chosen)!;
    if (isSun) qq.sundays++;
    if (isSat) qq.saturdays++;
    if (isNight) qq.nights++;
    if (isHol) qq.holidays++;
  }

  return { entries, warnings, stats };
}
