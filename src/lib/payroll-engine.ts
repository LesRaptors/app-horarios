/**
 * payroll-engine.ts — Pure compute engine (sub-spec 2).
 *
 * No Supabase, no IO. All inputs come in, all outputs come out.
 * Each stage is an internal function exported for unit testing.
 */

import type {
  Profile,
  PaymentFrequency,
  SalaryHistory,
  ScheduleEntry,
  ShiftTemplate,
  HolidayDate,
  AbsenceRecord,
  SalaryAdjustment,
  TaxPersonalDeduction,
  PayrollSettings,
  PayrollConceptType,
  ProvisionConcept,
} from "./types";

import { getCurrentSalary, getSettingsForDate, computeHourlyRate } from "./payroll-helpers";
import { applyDayProration, isIncomeForConcept, classifyHour } from "./payroll-engine-helpers";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PayrollComputeInput {
  employee: Profile & {
    hire_date: string | null;
    termination_date: string | null;
    arl_risk_class: number | null;
  };
  period: { start: string; end: string; frequency: PaymentFrequency };
  salaryHistory: SalaryHistory[];
  scheduleEntries: ScheduleEntry[];
  shiftTemplates: ShiftTemplate[];
  holidays: HolidayDate[];
  absences: AbsenceRecord[];
  adjustments: SalaryAdjustment[];
  taxDeductions: TaxPersonalDeduction | null;
  settings: PayrollSettings[];
  ytdProvisionsBefore: {
    cesantias: number;
    cesantias_interest: number;
    prima: number;
    vacaciones: number;
  };
}

export interface ComputedEntry {
  concept_type: PayrollConceptType;
  is_income: boolean;
  base: number | null;
  rate: number | null;
  amount: number;
  description: string | null;
}

export interface ComputedProvision {
  concept: ProvisionConcept;
  base: number;
  rate: number;
  amount: number;
  accumulated_ytd: number;
}

export interface ComputedEmployerCost {
  health_employer: number;
  pension_employer: number;
  arl_employer: number;
  parafiscales_caja: number;
  parafiscales_sena: number;
  parafiscales_icbf: number;
  total: number;
}

export interface PayrollComputeOutput {
  entries: ComputedEntry[];
  provisions: ComputedProvision[];
  employer_cost: ComputedEmployerCost;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Stage 1 — computeWorkedDays
// ---------------------------------------------------------------------------

export interface WorkedDaysResult {
  /** Total payable days in the period (30-day convention). */
  totalDays: number;
  /** Days covered by the employer (totalDays minus EPS/ARL/unpaid buckets). */
  paidByEmployer: number;
  paidByEps: number;
  paidByArl: number;
  unpaid: number;
}

/**
 * Count payable days using the Colombian 30-day convention.
 *
 * Cap:
 * - monthly  → max 30 days
 * - quincenal → max 15 days
 *
 * Hire/termination dates within the period shrink the window.
 * Absences with payer ∈ {eps, arl, none} reduce employer-paid days but don't
 * reduce totalDays (the employee was still entitled to pay from somewhere),
 * except payer='none' (unpaid leave / suspension) which reduces totalDays.
 */
export function computeWorkedDays(input: PayrollComputeInput): WorkedDaysResult {
  const { employee, period, absences } = input;

  // Parse period boundaries
  const pStart = parseDate(period.start);
  const pEnd = parseDate(period.end);

  // Convention cap
  const maxDays = period.frequency === "quincenal" ? 15 : 30;

  // Effective window considering hire / termination
  let windowStart = pStart;
  let windowEnd = pEnd;

  if (employee.hire_date) {
    const hd = parseDate(employee.hire_date);
    if (dateCmp(hd, windowStart) > 0) windowStart = hd;
  }

  if (employee.termination_date) {
    const td = parseDate(employee.termination_date);
    if (dateCmp(td, windowEnd) < 0) windowEnd = td;
  }

  // Days in effective window (1-indexed inclusive, capped to convention)
  let totalDays = Math.min(daysBetweenInclusive(windowStart, windowEnd), maxDays);
  if (totalDays < 0) totalDays = 0;

  // Now process absences that fall within the period
  let paidByEps = 0;
  let paidByArl = 0;
  let unpaid = 0;

  for (const abs of absences) {
    // Clip the absence to the actual period window
    const absStart = parseDate(abs.start_date);
    const absEnd = parseDate(abs.end_date);

    const clampedStart = maxDate(absStart, pStart);
    const clampedEnd = minDate(absEnd, pEnd);

    if (dateCmp(clampedStart, clampedEnd) > 0) continue;

    const absDays = daysBetweenInclusive(clampedStart, clampedEnd);
    if (absDays <= 0) continue;

    if (abs.payer === "eps") {
      paidByEps += absDays;
    } else if (abs.payer === "arl") {
      paidByArl += absDays;
    } else if (abs.payer === "none") {
      unpaid += absDays;
      // Unpaid days reduce totalDays (employee is not paid at all)
      totalDays = Math.max(0, totalDays - absDays);
    }
  }

  const paidByEmployer = totalDays - paidByEps - paidByArl;

  return {
    totalDays,
    paidByEmployer: Math.max(0, paidByEmployer),
    paidByEps,
    paidByArl,
    unpaid,
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — computeBaseSalary
// ---------------------------------------------------------------------------

/**
 * Look up the vigente salary for the period and emit a `salary` ComputedEntry
 * prorated by worked days (convention 30).
 *
 * Integral salary gets `description='salario integral'` so downstream stages
 * know to use 70% × monthly_salary for IBC.
 *
 * Returns an empty entry list + an error string when no salary is found
 * (this blocks the `approve` action on the period).
 */
export function computeBaseSalary(
  input: PayrollComputeInput,
  workedDays: WorkedDaysResult
): { entries: ComputedEntry[]; errors: string[] } {
  const { employee, period, salaryHistory } = input;

  // Look up salary record vigente at the period start
  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);

  if (!sal) {
    return {
      entries: [],
      errors: [`Sin salario vigente para el empleado ${employee.id} en el período`],
    };
  }

  const amount = applyDayProration(sal.monthly_salary, workedDays.totalDays);

  const entry: ComputedEntry = {
    concept_type: "salary",
    is_income: true,
    base: sal.monthly_salary,
    rate: null,
    amount,
    description: sal.is_integral_salary ? "salario integral" : null,
  };

  return { entries: [entry], errors: [] };
}

// ---------------------------------------------------------------------------
// Stage 3 — computeTransportAux
// ---------------------------------------------------------------------------

/**
 * Emit the `transport` (auxilio de transporte) ComputedEntry when applicable.
 *
 * Rules (in priority order):
 * 1. `transport_aux_override === false` → never emit.
 * 2. `transport_aux_override === true`  → always emit.
 * 3. `null` (auto)                      → emit only when `monthly_salary ≤ 2×SMMLV`.
 *
 * Amount is prorated using the same worked-days convention as salary.
 */
export function computeTransportAux(
  input: PayrollComputeInput,
  workedDays: WorkedDaysResult,
  baseSalaryEntry: ComputedEntry
): ComputedEntry | null {
  const { employee, period, salaryHistory, settings } = input;

  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);
  if (!sal) return null;

  const cfg = getSettingsForDate(settings, period.start);
  if (!cfg) return null;

  const { monthly_salary, transport_aux_override } = sal;

  // Determine whether to emit
  let shouldEmit: boolean;
  if (transport_aux_override === false) {
    shouldEmit = false;
  } else if (transport_aux_override === true) {
    shouldEmit = true;
  } else {
    // null → auto: emit only if salary ≤ 2 × SMMLV
    shouldEmit = monthly_salary <= 2 * cfg.smmlv;
  }

  if (!shouldEmit) return null;

  const amount = applyDayProration(cfg.aux_transport, workedDays.totalDays);

  return {
    concept_type: "transport",
    is_income: isIncomeForConcept("transport"),
    base: cfg.aux_transport,
    rate: null,
    amount,
    description: null,
  };
}

// ---------------------------------------------------------------------------
// Stage 4 — computeSurcharges
// ---------------------------------------------------------------------------

/**
 * Decompose every non-overtime schedule_entry into hours and accumulate
 * surcharges for night (35%), sunday (sunday_surcharge_pct), and holiday
 * (holiday_surcharge_pct). Recargos add arithmetically per research §3.3.
 *
 * Returns up to 3 ComputedEntry rows (one per surcharge type, if > 0).
 * Skips entries with overtime_status='approved' (handled by stage 5).
 *
 * Uses the salary and settings vigentes at each entry's date. The final
 * amounts are computed using the salary vigente at period.start (spec
 * does not require per-hour salary-change splits within an entry; that is
 * the §4.2 multi-period split concern which operates at a higher level).
 */
export function computeSurcharges(input: PayrollComputeInput): ComputedEntry[] {
  const { employee, scheduleEntries, holidays, settings, salaryHistory, period } = input;

  if (scheduleEntries.length === 0) return [];

  let nightHours = 0;
  let sundayHours = 0;
  let holidayHours = 0;

  for (const entry of scheduleEntries) {
    // Stage 4 only processes non-overtime entries
    if (entry.overtime_status === "approved") continue;

    const cfg = getSettingsForDate(settings, entry.date);
    if (!cfg) continue;

    const sal = getCurrentSalary(salaryHistory, employee.id, entry.date);
    if (!sal) continue;

    const hours = decomposeEntryIntoHours(entry.date, entry.start_time, entry.end_time);

    for (const { date: hourDate, hour } of hours) {
      const { isNight, isSunday, isHoliday: isHol } = classifyHour(
        hourDate,
        hour,
        holidays,
        cfg,
        employee.location_id ?? ""
      );
      if (isNight) nightHours += 1;
      if (isSunday) sundayHours += 1;
      if (isHol) holidayHours += 1;
    }
  }

  // Use salary/settings vigentes at period.start for the aggregate amount
  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);
  const cfg = getSettingsForDate(settings, period.start);
  if (!sal || !cfg) return [];

  const valorHora = computeHourlyRate(sal.monthly_salary, cfg.hourly_divisor);
  const entries: ComputedEntry[] = [];

  if (nightHours > 0) {
    entries.push({
      concept_type: "surcharge_night",
      is_income: isIncomeForConcept("surcharge_night"),
      base: valorHora,
      rate: 0.35,
      amount: Math.round(nightHours * valorHora * 0.35),
      description: `Recargo nocturno (${nightHours}h)`,
    });
  }

  if (sundayHours > 0) {
    entries.push({
      concept_type: "surcharge_sunday",
      is_income: isIncomeForConcept("surcharge_sunday"),
      base: valorHora,
      rate: cfg.sunday_surcharge_pct,
      amount: Math.round(sundayHours * valorHora * cfg.sunday_surcharge_pct),
      description: `Recargo dominical (${sundayHours}h)`,
    });
  }

  if (holidayHours > 0) {
    entries.push({
      concept_type: "surcharge_holiday",
      is_income: isIncomeForConcept("surcharge_holiday"),
      base: valorHora,
      rate: cfg.holiday_surcharge_pct,
      amount: Math.round(holidayHours * valorHora * cfg.holiday_surcharge_pct),
      description: `Recargo festivo (${holidayHours}h)`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Orchestrator — computePayroll (stages 1-4)
// ---------------------------------------------------------------------------

/**
 * Top-level pure payroll computation entry point.
 *
 * Stages 1-4 wired. Stages 5-9 pending later tasks.
 *
 * Contract:
 * - `errors[]` → hard problems that block period approval.
 * - `warnings[]` → soft messages surfaced in the UI but don't block.
 * - `provisions` and `employer_cost` are zero-valued stubs until tasks 17-18.
 */

/** Helper: check whether an entry represents an integral salary. */
export function entryIsIntegral(entry: ComputedEntry): boolean {
  return entry.concept_type === "salary" && entry.description === "salario integral";
}

const ZERO_EMPLOYER_COST: ComputedEmployerCost = {
  health_employer: 0,
  pension_employer: 0,
  arl_employer: 0,
  parafiscales_caja: 0,
  parafiscales_sena: 0,
  parafiscales_icbf: 0,
  total: 0,
};

export function computePayroll(input: PayrollComputeInput): PayrollComputeOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Stage 1
  const workedDays = computeWorkedDays(input);

  // Stage 2
  const { entries: salaryEntries, errors: salaryErrors } = computeBaseSalary(input, workedDays);
  errors.push(...salaryErrors);

  // Stage 3
  const baseSalaryEntry = salaryEntries[0] ?? null;
  const transportEntry = baseSalaryEntry
    ? computeTransportAux(input, workedDays, baseSalaryEntry)
    : null;

  // Stage 4 — surcharges for ordinary (non-overtime) entries
  const surchargeEntries = computeSurcharges(input);

  const entries: ComputedEntry[] = [
    ...salaryEntries,
    ...(transportEntry ? [transportEntry] : []),
    ...surchargeEntries,
  ];

  return {
    entries,
    provisions: [],
    employer_cost: { ...ZERO_EMPLOYER_COST },
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string into { year, month (1-based), day } */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

type DateParts = { year: number; month: number; day: number };

function dateCmp(a: DateParts, b: DateParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function maxDate(a: DateParts, b: DateParts): DateParts {
  return dateCmp(a, b) >= 0 ? a : b;
}

function minDate(a: DateParts, b: DateParts): DateParts {
  return dateCmp(a, b) <= 0 ? a : b;
}

/**
 * Inclusive calendar-day count between two dates.
 *
 * For prorrateo purposes we count real calendar days and then the caller
 * caps the result to the convention max (30 for mensual, 15 for quincenal).
 * The "31 = 30" rule only matters when computing the span of a full calendar
 * month (e.g. 1–31 March must not count as 31 days); the simplest correct
 * approach is: cap the result with Math.min at the call site.
 */
function daysBetweenInclusive(start: DateParts, end: DateParts): number {
  const toMs = (dp: DateParts) =>
    Date.UTC(dp.year, dp.month - 1, dp.day);
  const ms = toMs(end) - toMs(start);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Decompose a schedule_entry's time range into individual whole-hours,
 * each tagged with its calendar date. Handles midnight crossings.
 *
 * start_time and end_time are HH:MM strings. If end_time ≤ start_time the
 * shift crosses midnight and the date increments for hours after 00:00.
 *
 * Returns an array of { date: YYYY-MM-DD, hour: number (0–23) } for each
 * starting hour of the shift (e.g. a 3-hour shift 21:00–00:00 yields
 * hours 21, 22, 23 on the entry date).
 */
function decomposeEntryIntoHours(
  date: string,
  startTime: string,
  endTime: string
): { date: string; hour: number }[] {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  // Convert to minutes since start-of-day
  const startMinutes = sh * 60 + (sm ?? 0);
  let endMinutes = eh * 60 + (em ?? 0);

  // Midnight crossing: end is on the next day
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const result: { date: string; hour: number }[] = [];
  const dp = parseDate(date);
  const baseMs = Date.UTC(dp.year, dp.month - 1, dp.day);

  let cursor = startMinutes;
  while (cursor < endMinutes) {
    const hourOfDay = Math.floor(cursor / 60) % 24;
    // Which calendar date does this hour fall on?
    const dayOffset = Math.floor(cursor / (24 * 60));
    const msForDay = baseMs + dayOffset * 86_400_000;
    const d = new Date(msForDay);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dy = String(d.getUTCDate()).padStart(2, "0");
    result.push({ date: `${y}-${mo}-${dy}`, hour: hourOfDay });
    cursor += 60;
  }

  return result;
}
