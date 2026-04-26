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

import { getCurrentSalary, getSettingsForDate } from "./payroll-helpers";
import { applyDayProration, isIncomeForConcept } from "./payroll-engine-helpers";

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
// Orchestrator — computePayroll (skeleton wiring stages 1-3)
// ---------------------------------------------------------------------------

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

  const entries: ComputedEntry[] = [
    ...salaryEntries,
    ...(transportEntry ? [transportEntry] : []),
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
