import { getMonthDates, formatDateISO } from "./utils";
import type {
  AutoGenConfig,
  AutoGenResult,
  AutoGenWarning,
  ProfileWithPositions,
  ShiftTemplate,
  LaborConstraints,
  ScheduleEntry,
  StaffingRequirement,
} from "./types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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
}

interface EmployeeTracker {
  totalHours: number;
  totalShifts: number;
  weeklyHours: Record<number, number>; // weekNumber -> hours
  lastShiftDate: string | null;
  lastShiftEndTime: string | null;
  consecutiveDays: number;
  assignedDates: Set<string>;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function calcDurationHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60; // overnight shift
  return (totalMin - breakMin) / 60;
}

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

function hasEnoughRest(
  lastEndTime: string,
  lastDate: string,
  newStartTime: string,
  newDate: string,
  minRestHours: number
): boolean {
  const lastEnd = new Date(`${lastDate}T${lastEndTime}`);
  const newStart = new Date(`${newDate}T${newStartTime}`);
  const gapHours = (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
  return gapHours >= minRestHours;
}

function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return formatDateISO(d);
}

// ---------------------------------------------------------------------------
// Build demand slots
// ---------------------------------------------------------------------------

function buildDemandSlots(
  config: AutoGenConfig,
  dates: Date[],
  templates: ShiftTemplate[],
  staffingRequirements: StaffingRequirement[]
): DemandSlot[] {
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const slots: DemandSlot[] = [];

  // Build staffing requirement lookup: "posId_templateId_dow" -> count
  const reqMap = new Map<string, number>();
  for (const sr of staffingRequirements) {
    reqMap.set(`${sr.position_id}_${sr.shift_template_id}_${sr.day_of_week}`, sr.required_count);
  }

  const hasDemandConfig = staffingRequirements.length > 0 && config.useDemandRequirements;

  for (const date of dates) {
    const dateStr = formatDateISO(date);
    const dow = date.getDay(); // 0=Sunday, 6=Saturday

    if (config.excludeDates.includes(dateStr)) continue;

    for (const templateId of config.shiftTemplateIds) {
      const template = templateMap.get(templateId);
      if (!template) continue;

      const duration = calcDurationHours(template.start_time, template.end_time, template.break_minutes);

      if (hasDemandConfig) {
        // Demand-driven: create slots based on staffing requirements
        for (const posId of config.positionIds) {
          const key = `${posId}_${templateId}_${dow}`;
          const requiredCount = reqMap.get(key) ?? 0;
          for (let i = 0; i < requiredCount; i++) {
            slots.push({
              date: dateStr,
              dayOfWeek: dow,
              positionId: posId,
              shiftTemplateId: templateId,
              startTime: template.start_time,
              endTime: template.end_time,
              breakMinutes: template.break_minutes,
              durationHours: duration,
            });
          }
        }
      } else {
        // Fallback: 1 slot per position per template per day (legacy behavior)
        for (const posId of config.positionIds) {
          slots.push({
            date: dateStr,
            dayOfWeek: dow,
            positionId: posId,
            shiftTemplateId: templateId,
            startTime: template.start_time,
            endTime: template.end_time,
            breakMinutes: template.break_minutes,
            durationHours: duration,
          });
        }
      }
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Build time-off lookup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Score candidate for a demand slot
// ---------------------------------------------------------------------------

function scoreCandidate(
  employee: ProfileWithPositions,
  slot: DemandSlot,
  tracker: EmployeeTracker,
  targetHours: number,
  targetShifts: number
): number {
  let score = 0;

  // Position match: primary position strongly preferred
  if (employee.position_id === slot.positionId) {
    score += 100;
  } else {
    // Secondary position match
    score += 30;
  }

  // Equity: prefer employees below target hours
  const hourDeficit = targetHours - tracker.totalHours;
  score += hourDeficit * 10;

  // Equity: prefer employees below target shifts
  const shiftDeficit = targetShifts - tracker.totalShifts;
  score += shiftDeficit * 5;

  return score;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateSchedule(
  config: AutoGenConfig,
  employees: ProfileWithPositions[],
  templates: ShiftTemplate[],
  existingEntries: ScheduleEntry[],
  timeOff: TimeOffRange[],
  constraints: LaborConstraints,
  staffingRequirements: StaffingRequirement[] = []
): AutoGenResult {
  const warnings: AutoGenWarning[] = [];
  const entries: AutoGenResult["entries"] = [];
  const stats: Record<string, { shifts: number; hours: number }> = {};

  // Selected employees & templates
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

  // Init stats
  for (const emp of selectedEmployees) {
    stats[emp.id] = { shifts: 0, hours: 0 };
  }

  // Build employee trackers from existing entries
  const trackers = new Map<string, EmployeeTracker>();
  for (const emp of selectedEmployees) {
    trackers.set(emp.id, {
      totalHours: 0,
      totalShifts: 0,
      weeklyHours: {},
      lastShiftDate: null,
      lastShiftEndTime: null,
      consecutiveDays: 0,
      assignedDates: new Set(),
    });
  }

  // Pre-fill trackers from existing entries
  // Sort existing entries by date to correctly track consecutive days
  const sortedExisting = [...existingEntries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sortedExisting) {
    const t = trackers.get(e.employee_id);
    if (!t) continue;
    const dur = calcDurationHours(e.start_time, e.end_time, 0);
    const week = getISOWeekNumber(e.date);
    t.totalHours += dur;
    t.totalShifts++;
    t.weeklyHours[week] = (t.weeklyHours[week] || 0) + dur;
    t.assignedDates.add(e.date);
    stats[e.employee_id] = stats[e.employee_id] || { shifts: 0, hours: 0 };
    stats[e.employee_id].shifts++;
    stats[e.employee_id].hours += dur;

    // Track consecutive days
    if (t.lastShiftDate === prevDateStr(e.date)) {
      t.consecutiveDays++;
    } else {
      t.consecutiveDays = 1;
    }
    t.lastShiftDate = e.date;
    t.lastShiftEndTime = e.end_time;
  }

  // Build time-off lookup
  const timeOffMap = buildTimeOffLookup(timeOff);

  // Build position eligibility index: positionId -> { primary: empId[], secondary: empId[] }
  const positionEligibility = new Map<string, { primary: string[]; secondary: string[] }>();
  for (const emp of selectedEmployees) {
    // Primary position
    if (emp.position_id) {
      if (!positionEligibility.has(emp.position_id)) {
        positionEligibility.set(emp.position_id, { primary: [], secondary: [] });
      }
      positionEligibility.get(emp.position_id)!.primary.push(emp.id);
    }
    // Secondary positions
    for (const sp of emp.secondary_positions || []) {
      if (!positionEligibility.has(sp.position_id)) {
        positionEligibility.set(sp.position_id, { primary: [], secondary: [] });
      }
      positionEligibility.get(sp.position_id)!.secondary.push(emp.id);
    }
  }

  // Build demand slots
  const dates = getMonthDates(config.year, config.month);
  const demandSlots = buildDemandSlots(config, dates, selectedTemplates, staffingRequirements);

  // Calculate target hours/shifts for equity
  const totalDemandHours = demandSlots.reduce((sum, s) => sum + s.durationHours, 0);
  const targetHours = totalDemandHours / selectedEmployees.length;
  const targetShifts = demandSlots.length / selectedEmployees.length;

  // Sort demand slots: process by date, then by scarcity (fewer eligible employees first)
  const employeeMap = new Map(selectedEmployees.map((e) => [e.id, e]));

  demandSlots.sort((a, b) => {
    // First by date
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;

    // Then by scarcity: fewer eligible employees = process first
    const aElig = positionEligibility.get(a.positionId);
    const bElig = positionEligibility.get(b.positionId);
    const aCount = (aElig?.primary.length ?? 0) + (aElig?.secondary.length ?? 0);
    const bCount = (bElig?.primary.length ?? 0) + (bElig?.secondary.length ?? 0);
    return aCount - bCount;
  });

  // Assign employees to demand slots
  for (const slot of demandSlots) {
    const eligibility = positionEligibility.get(slot.positionId);
    if (!eligibility) {
      warnings.push({
        kind: "no_employees_in_position",
        positionId: slot.positionId,
        date: slot.date,
        shiftTemplateId: slot.shiftTemplateId,
      });
      continue;
    }

    // Gather all eligible employee IDs (primary + secondary)
    const candidateIds = [...eligibility.primary, ...eligibility.secondary];

    // Filter and score candidates
    const scored: { empId: string; score: number }[] = [];

    for (const empId of candidateIds) {
      const emp = employeeMap.get(empId);
      const tracker = trackers.get(empId);
      if (!emp || !tracker) continue;

      // Check: already assigned this day?
      if (tracker.assignedDates.has(slot.date)) continue;

      // Check: time off?
      if (timeOffMap.get(empId)?.has(slot.date)) continue;

      // Check: weekly hours limit
      const week = getISOWeekNumber(slot.date);
      const currentWeekHours = tracker.weeklyHours[week] || 0;
      const empMaxWeek = Math.min(constraints.maxHoursPerWeek, emp.max_hours_per_week);
      if (currentWeekHours + slot.durationHours > empMaxWeek) continue;

      // Check: daily hours limit
      if (slot.durationHours > constraints.maxHoursPerDay) continue;

      // Check: consecutive days
      if (tracker.lastShiftDate === prevDateStr(slot.date)) {
        if (tracker.consecutiveDays + 1 > constraints.maxConsecutiveDays) continue;
      }

      // Check: min rest between shifts
      if (tracker.lastShiftDate && tracker.lastShiftEndTime) {
        if (!hasEnoughRest(
          tracker.lastShiftEndTime,
          tracker.lastShiftDate,
          slot.startTime,
          slot.date,
          constraints.minRestHoursBetweenShifts
        )) continue;
      }

      // All checks passed — score this candidate
      const score = scoreCandidate(emp, slot, tracker, targetHours, targetShifts);
      scored.push({ empId, score });
    }

    if (scored.length === 0) {
      warnings.push({
        kind: "no_available_employee",
        positionId: slot.positionId,
        date: slot.date,
        shiftTemplateId: slot.shiftTemplateId,
      });
      continue;
    }

    // Sort by score descending, assign the best
    scored.sort((a, b) => b.score - a.score);
    const bestEmpId = scored[0].empId;
    const tracker = trackers.get(bestEmpId)!;

    // Create entry
    entries.push({
      schedule_id: config.scheduleId,
      employee_id: bestEmpId,
      position_id: slot.positionId,
      date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      shift_template_id: slot.shiftTemplateId,
      notes: null,
    });

    // Update tracker
    const week = getISOWeekNumber(slot.date);
    tracker.weeklyHours[week] = (tracker.weeklyHours[week] || 0) + slot.durationHours;
    tracker.totalHours += slot.durationHours;
    tracker.totalShifts++;

    if (tracker.lastShiftDate === prevDateStr(slot.date)) {
      tracker.consecutiveDays++;
    } else {
      tracker.consecutiveDays = 1;
    }
    tracker.lastShiftDate = slot.date;
    tracker.lastShiftEndTime = slot.endTime;
    tracker.assignedDates.add(slot.date);

    // Update stats
    stats[bestEmpId].shifts++;
    stats[bestEmpId].hours += slot.durationHours;
  }

  return { entries, warnings, stats };
}
