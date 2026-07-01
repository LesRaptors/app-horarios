import { getMonthDates, formatDateISO } from "./utils";
import {
  getQuarterRange,
  getRollingWindow,
  sumRollupField,
  isHoliday,
  effectiveShiftHours,
  dayOfWeek,
  daysBetween,
} from "./equity-helpers";
import { isRestDay } from "./rest-rules";
import type {
  AutoGenConfig, AutoGenResult, AutoGenWarning,
  ProfileWithPositions, ShiftTemplate, LaborConstraints,
  ScheduleEntry, StaffingRequirement,
  EmployeeEquityRollup, HolidayDate, ContractType, ScoringWeights,
  CapExcessKind, RestRule, EmployeeRestRule,
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
  // Carácter nocturno EFECTIVO del slot (deriva del horario de festivo cuando
  // aplica). Para slots sin horario de festivo aplicado, isNight === template.is_night.
  isNight: boolean;
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
  config: AutoGenConfig, dates: Date[], allTemplates: ShiftTemplate[],
  staffingRequirements: StaffingRequirement[],
  holidays: HolidayDate[], locationId: string,
): DemandSlot[] {
  // templateMap incluye TODOS los templates (no solo los seleccionados) para poder
  // resolver el turno del perfil de festivo aunque no esté en config.shiftTemplateIds.
  const templateMap = new Map(allTemplates.map((t) => [t.id, t]));
  const slots: DemandSlot[] = [];
  const reqMap = new Map<string, number>();
  // Perfil de festivo por posición: lista de {turno, count}. Permite auto-incluir
  // los turnos del perfil aunque no estén seleccionados.
  const holidayDemand = new Map<string, Array<{ shiftTemplateId: string; count: number }>>();
  const holidayPositions = new Set<string>();
  for (const sr of staffingRequirements) {
    if (sr.is_holiday) {
      const list = holidayDemand.get(sr.position_id) ?? [];
      list.push({ shiftTemplateId: sr.shift_template_id, count: sr.required_count });
      holidayDemand.set(sr.position_id, list);
      holidayPositions.add(sr.position_id);
    } else {
      reqMap.set(`${sr.position_id}_${sr.shift_template_id}_${sr.day_of_week}`, sr.required_count);
    }
  }
  const hasDemand = staffingRequirements.length > 0 && config.useDemandRequirements;

  const pushSlot = (
    dateStr: string, dow: number, posId: string, template: ShiftTemplate, count: number,
    isHolidayDate: boolean,
  ) => {
    if (count <= 0) return;
    const { startTime, endTime, breakMinutes, isNight } = effectiveShiftHours(template, isHolidayDate);
    const duration = calcDurationHours(startTime, endTime, breakMinutes);
    for (let i = 0; i < count; i++) {
      slots.push({ date: dateStr, dayOfWeek: dow, positionId: posId,
        shiftTemplateId: template.id, startTime,
        endTime, breakMinutes,
        durationHours: duration, isNight, template });
    }
  };

  for (const date of dates) {
    const dateStr = formatDateISO(date);
    const dow = date.getDay();
    if (config.excludeDates.includes(dateStr)) continue;
    // isHolidayDate: ¿la fecha es festivo? (decide las HORAS del turno).
    // isHol: además hay demanda (decide si aplica el PERFIL de festivo de Necesidades).
    const isHolidayDate = isHoliday(dateStr, locationId, holidays);
    const isHol = hasDemand && isHolidayDate;

    if (hasDemand) {
      for (const posId of config.positionIds) {
        if (isHol && holidayPositions.has(posId)) {
          // En un festivo, una posición con perfil de festivo (≥1 fila is_holiday=true)
          // REEMPLAZA su demanda con SOLO el perfil de festivo. Los turnos del perfil se
          // auto-incluyen aunque NO estén en config.shiftTemplateIds.
          for (const { shiftTemplateId, count } of holidayDemand.get(posId) ?? []) {
            const template = templateMap.get(shiftTemplateId);
            if (!template) continue;
            pushSlot(dateStr, dow, posId, template, count, isHolidayDate);
          }
        } else {
          // Día de semana (o festivo sin perfil): demanda por día de semana, limitada a
          // los turnos seleccionados.
          for (const templateId of config.shiftTemplateIds) {
            const template = templateMap.get(templateId);
            if (!template) continue;
            pushSlot(dateStr, dow, posId, template, reqMap.get(`${posId}_${templateId}_${dow}`) ?? 0, isHolidayDate);
          }
        }
      }
    } else {
      for (const templateId of config.shiftTemplateIds) {
        const template = templateMap.get(templateId);
        if (!template) continue;
        for (const posId of config.positionIds) {
          pushSlot(dateStr, dow, posId, template, 1, isHolidayDate);
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
  constraints: LaborConstraints;
  restRulesByContract: Map<string, RestRule[]>;
  restRulesByEmployee: Map<string, EmployeeRestRule[]>;
  entriesByEmployee: Map<string, ScheduleEntry[]>;
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
  if (slot.isNight) score -= rolling.nights * w.night_penalty;
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

  // Penalización por saturación: candidatos cerca de sus caps pesan menos
  const week = getISOWeekNumber(slot.date);
  const weekHoursUsed = tracker.weeklyHours[week] || 0;
  const contract = ctx.contractTypes.get(employee.contract_type_id ?? "");
  const contractCap = contract?.weekly_hours
    ?? contract?.max_hours_per_week
    ?? contract?.target_hours_per_week
    ?? Number.POSITIVE_INFINITY;
  const effectiveWeekly = Math.min(
    ctx.constraints.maxHoursPerWeek,
    contractCap,
    employee.max_hours_per_week,
  );
  const weekPctUsed = effectiveWeekly > 0 ? (weekHoursUsed + slot.durationHours) / effectiveWeekly : 0;
  if (weekPctUsed >= 0.85) score -= 30;

  // Penalización por días consecutivos cerca del cap
  const wouldBeConsecutive = tracker.lastShiftDate === prevDateStr(slot.date)
    ? tracker.consecutiveDays + 1
    : 1;
  const consecutiveSlack = ctx.constraints.maxConsecutiveDays - wouldBeConsecutive;
  if (consecutiveSlack <= 1) score -= 50;

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
  const weekHardCap = contract?.weekly_hours
    ?? contract?.max_hours_per_week
    ?? contract?.target_hours_per_week
    ?? Number.POSITIVE_INFINITY;
  const effectiveWeekly = Math.min(constraints.maxHoursPerWeek, weekHardCap, employee.max_hours_per_week);
  if (currentWeekHours + slot.durationHours > effectiveWeekly) caps.push("weekly_hours");

  if (tracker.lastShiftDate === prevDateStr(slot.date)
      && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) {
    caps.push("consecutive_days");
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
    const contract = ctx.contractTypes.get(emp.contract_type_id);
    const dayCap = contract?.is_healthcare
      ? 12
      : (contract?.max_hours_per_day ?? constraints.maxHoursPerDay);
    if (slot.durationHours > dayCap) continue;
    if (tracker.lastShiftDate && tracker.lastShiftEndTime && tracker.lastShiftStartTime) {
      const rest = requiredRestHours(tracker.lastShiftWasNight, constraints);
      if (!hasEnoughRest(tracker.lastShiftEndTime, tracker.lastShiftDate, tracker.lastShiftStartTime,
                         slot.startTime, slot.date, rest)) continue;
    }

    // INVIOLABLE: máximo días consecutivos (Art. 161 CST — descanso semanal obligatorio)
    if (tracker.lastShiftDate === prevDateStr(slot.date)
        && tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;

    // INVIOLABLES: disponibilidad (override empleado > contract)
    const availSundays  = emp.available_sundays  ?? contract?.available_sundays;
    const availHolidays = emp.available_holidays ?? contract?.available_holidays;
    const availNights   = emp.available_nights   ?? contract?.available_nights;
    if (availSundays  === false && dayOfWeek(slot.date) === 0) continue;
    if (availHolidays === false && isHoliday(slot.date, ctx.locationId, ctx.holidays)) continue;
    if (availNights   === false && slot.isNight) continue;

    // INVIOLABLE: reglas de descanso (override empleado > contract)
    const empRules = ctx.restRulesByEmployee.get(emp.id) ?? [];
    const contractRules = (contract && ctx.restRulesByContract.get(contract.id)) || [];
    const effectiveRules = empRules.length > 0
      ? empRules.map((r) => ({ rule_type: r.rule_type, params: r.params }))
      : contractRules.map((r) => ({ rule_type: r.rule_type, params: r.params }));

    if (effectiveRules.length > 0) {
      const recentEmpEntries = ctx.entriesByEmployee.get(emp.id) ?? [];
      const isHolidayFn = (d: string) => isHoliday(d, ctx.locationId, ctx.holidays);
      const blocked = effectiveRules.some((rule) =>
        isRestDay(rule as RestRule, slot.date, slot.template, recentEmpEntries, isHolidayFn, slot.isNight)
      );
      if (blocked) continue;
    }

    if (allowOvertime) { kept.push(empId); continue; }

    // CONTRACTUAL
    const week = getISOWeekNumber(slot.date);
    const weekHardCap = contract?.weekly_hours
      ?? contract?.max_hours_per_week
      ?? contract?.target_hours_per_week
      ?? Number.POSITIVE_INFINITY;
    const effectiveWeekly = Math.min(constraints.maxHoursPerWeek, weekHardCap, emp.max_hours_per_week);
    if ((tracker.weeklyHours[week] || 0) + slot.durationHours > effectiveWeekly) continue;

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
  restRules: RestRule[] = [],
  employeeRestRules: EmployeeRestRule[] = [],
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
    // Lee el carácter nocturno EFECTIVO persistido en el entry; si es NULL (entries
    // históricos o creados por código viejo) cae al flag de la plantilla — mismo
    // COALESCE que el trigger recompute_equity_rollup.
    t.lastShiftWasNight = e.is_night ?? tpl?.is_night ?? false;
  }

  const timeOffMap = buildTimeOffLookup(timeOff);
  const contractTypeMap = new Map(contractTypes.map((c) => [c.id, c]));

  // Build rest rules index by contract_type_id
  const restRulesByContract = new Map<string, RestRule[]>();
  for (const rule of restRules) {
    const list = restRulesByContract.get(rule.contract_type_id) ?? [];
    list.push(rule);
    restRulesByContract.set(rule.contract_type_id, list);
  }

  // Build rest rules index by employee_id (override de las del contract)
  const restRulesByEmployee = new Map<string, EmployeeRestRule[]>();
  for (const rule of employeeRestRules) {
    const list = restRulesByEmployee.get(rule.employee_id) ?? [];
    list.push(rule);
    restRulesByEmployee.set(rule.employee_id, list);
  }

  // Build entries index by employee_id (for rest rule evaluation)
  const entriesByEmployee = new Map<string, ScheduleEntry[]>();
  for (const e of existingEntries) {
    const list = entriesByEmployee.get(e.employee_id) ?? [];
    list.push(e);
    entriesByEmployee.set(e.employee_id, list);
  }

  const positionEligibility = new Map<string, { primary: string[]; floater: string[] }>();
  for (const emp of selectedEmployees) {
    if (emp.is_floater) {
      // Floater: only eligible for their secondary_positions, never as primary.
      for (const sp of emp.secondary_positions ?? []) {
        const e = positionEligibility.get(sp.position_id) ?? { primary: [], floater: [] };
        if (!e.floater.includes(emp.id)) e.floater.push(emp.id);
        positionEligibility.set(sp.position_id, e);
      }
    } else {
      // Non-floater: primary for their position_id AND for secondary_positions.
      if (emp.position_id) {
        const e = positionEligibility.get(emp.position_id) ?? { primary: [], floater: [] };
        if (!e.primary.includes(emp.id)) e.primary.push(emp.id);
        positionEligibility.set(emp.position_id, e);
      }
      for (const sp of emp.secondary_positions ?? []) {
        const e = positionEligibility.get(sp.position_id) ?? { primary: [], floater: [] };
        if (!e.primary.includes(emp.id)) e.primary.push(emp.id);
        positionEligibility.set(sp.position_id, e);
      }
    }
  }

  const dates = getMonthDates(config.year, config.month);
  // Pasar TODOS los templates: buildDemandSlots usa config.shiftTemplateIds para la
  // demanda de día de semana, pero auto-incluye los turnos del perfil de festivo aunque
  // no estén seleccionados (resueltos desde el templateMap completo).
  const demandSlots = buildDemandSlots(config, dates, templates, staffingRequirements, holidays, config.locationId);
  const totalDemandHours = demandSlots.reduce((sum, s) => sum + s.durationHours, 0);
  const targetHours = totalDemandHours / selectedEmployees.length;
  const targetShifts = demandSlots.length / selectedEmployees.length;

  const employeeMap = new Map(selectedEmployees.map((e) => [e.id, e]));

  demandSlots.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    const aE = positionEligibility.get(a.positionId);
    const bE = positionEligibility.get(b.positionId);
    const aN = (aE?.primary.length ?? 0) + (aE?.floater.length ?? 0);
    const bN = (bE?.primary.length ?? 0) + (bE?.floater.length ?? 0);
    return aN - bN;
  });

  const ctx: ScoringContext = {
    weights, rollingRollupSums, quarterRollupSums,
    targetHours, targetShifts, holidays, locationId: config.locationId,
    contractTypes: contractTypeMap, constraints,
    restRulesByContract, restRulesByEmployee, entriesByEmployee,
  };

  for (const slot of demandSlots) {
    const eligibility = positionEligibility.get(slot.positionId);
    if (!eligibility || (eligibility.primary.length === 0 && eligibility.floater.length === 0)) {
      warnings.push({ kind: "no_employees_in_position",
        positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      continue;
    }

    let chosen: string | null = null;
    let overtimeCaps: CapExcessKind[] = [];

    // Pase 1: primarios + floaters compiten strict en un solo pool. El scoring
    // (position_primary_bonus 100 vs position_secondary_bonus 30) preserva la
    // preferencia natural por primarios; el floater gana solo si tiene mejor
    // equidad (déficit de horas/turnos) o si los primarios quedaron filtrados
    // por inviolables.
    const pass1Pool = [...eligibility.primary, ...eligibility.floater];
    if (pass1Pool.length > 0) {
      const pass1 = filterCandidates(pass1Pool, slot, employeeMap, trackers, timeOffMap, constraints, ctx, false);
      chosen = pickBestCandidate(pass1, employeeMap, trackers, slot, ctx);
    }

    // Pase 2: todos relaxed (overtime).
    if (!chosen) {
      const allCandidates = [...eligibility.primary, ...eligibility.floater];
      const pass2 = filterCandidates(allCandidates, slot, employeeMap, trackers, timeOffMap, constraints, ctx, true);
      chosen = pickBestCandidate(pass2, employeeMap, trackers, slot, ctx);
      if (chosen) {
        const emp = employeeMap.get(chosen)!;
        const tracker = trackers.get(chosen)!;
        overtimeCaps = computeExceededCaps(emp, slot, tracker, ctx, constraints);
      }
    }

    if (!chosen) {
      // ¿El slot corre en festivo con horario de festivo aplicado y su duración excede
      // el tope diario de TODOS los candidatos de la posición? Aviso diagnóstico claro.
      const slotIsHolidayHours =
        isHoliday(slot.date, ctx.locationId, ctx.holidays) &&
        slot.template.holiday_start_time != null &&
        slot.template.holiday_end_time != null;
      if (slotIsHolidayHours) {
        const posCandidateIds = [...eligibility.primary, ...eligibility.floater];
        const posCandidates = posCandidateIds.map((id) => employeeMap.get(id)).filter(Boolean) as ProfileWithPositions[];
        const dayCapOf = (e: ProfileWithPositions): number => {
          const c = ctx.contractTypes.get(e.contract_type_id ?? "");
          return c?.is_healthcare ? 12 : (c?.max_hours_per_day ?? constraints.maxHoursPerDay);
        };
        const maxDayCap = posCandidates.length
          ? Math.max(...posCandidates.map(dayCapOf))
          : constraints.maxHoursPerDay;
        if (slot.durationHours > maxDayCap) {
          warnings.push({
            kind: "holiday_hours_exceed_cap",
            positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
            holidayHours: slot.durationHours, maxDayCap,
          });
          continue; // no emitir el genérico para este slot
        }
      }

      // Distinguir entre: nadie elegible (no_safe_candidate) vs todos al cap (coverage_gap)
      const allCandidates = [...eligibility.primary, ...eligibility.floater];
      const reason: "all_at_cap" | "no_eligible" = allCandidates.some((id) => {
        const t = trackers.get(id);
        if (!t) return false;
        return t.lastShiftDate === prevDateStr(slot.date)
          && t.consecutiveDays + 1 > constraints.maxConsecutiveDays;
      })
        ? "all_at_cap"
        : "no_eligible";

      if (reason === "all_at_cap") {
        warnings.push({ kind: "coverage_gap",
          positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId,
          reason });
      } else {
        warnings.push({ kind: "no_safe_candidate",
          positionId: slot.positionId, date: slot.date, shiftTemplateId: slot.shiftTemplateId });
      }
      continue;
    }

    const tracker = trackers.get(chosen)!;
    entries.push({
      schedule_id: config.scheduleId, employee_id: chosen, position_id: slot.positionId,
      date: slot.date, start_time: slot.startTime, end_time: slot.endTime,
      shift_template_id: slot.shiftTemplateId, notes: null,
      // Persiste el carácter nocturno EFECTIVO del slot (deriva del horario real,
      // incluido el horario especial de festivo), no del flag de la plantilla.
      is_night: slot.isNight,
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
    tracker.lastShiftWasNight = slot.isNight;
    tracker.assignedDates.add(slot.date);
    stats[chosen].shifts++;
    stats[chosen].hours += slot.durationHours;

    // Update in-run rollup sums so subsequent slots see the updated state
    const isSun = dayOfWeek(slot.date) === 0;
    const isSat = dayOfWeek(slot.date) === 6;
    const isNight = slot.isNight;
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
