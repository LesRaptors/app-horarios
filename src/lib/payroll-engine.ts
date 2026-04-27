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
import {
  applyDayProration,
  isIncomeForConcept,
  classifyHour,
  getSolidarityRate,
  getArlRate,
  isExonerationApplicable,
  depurarBaseRetencion,
  aplicarTablaRetencion,
} from "./payroll-engine-helpers";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PayrollComputeInput {
  employee: Profile & {
    hire_date: string | null;
    termination_date: string | null;
    arl_risk_class: number | null;
  };
  period: { start: string; end: string; frequency: PaymentFrequency; paymentMode?: "independent" | "advance_settlement" };
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
  /**
   * For Q2 settlement only: the salary+transport entries already paid in the Q1 advance
   * of the same month. Engine subtracts them from the corresponding Q2 entries.
   */
  q1AdvanceEntries?: ComputedEntry[];
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
// Stage 5 — computeOvertime
// ---------------------------------------------------------------------------

/**
 * Process approved overtime entries. Each hour classified as night → overtime_night
 * (75%), day → overtime_day (25%). Additionally, if the hour falls on a sunday or
 * holiday, the corresponding surcharge is also emitted (research §4.1 d — recargos
 * suman aritméticamente).
 *
 * Stage 4 is guaranteed not to double-count because it skips approved entries.
 */
export function computeOvertime(input: PayrollComputeInput): ComputedEntry[] {
  const { employee, period, scheduleEntries, holidays, settings, salaryHistory } = input;

  const approvedEntries = scheduleEntries.filter((e) => e.overtime_status === "approved");
  if (approvedEntries.length === 0) return [];

  let otDayHours = 0;
  let otNightHours = 0;
  let otSundayHours = 0;
  let otHolidayHours = 0;

  for (const entry of approvedEntries) {
    const cfg = getSettingsForDate(settings, entry.date);
    if (!cfg) continue;

    const hours = decomposeEntryIntoHours(entry.date, entry.start_time, entry.end_time);

    for (const { date: hourDate, hour } of hours) {
      const { isNight, isSunday, isHoliday: isHol } = classifyHour(
        hourDate,
        hour,
        holidays,
        cfg,
        employee.location_id ?? ""
      );
      if (isNight) {
        otNightHours += 1;
      } else {
        otDayHours += 1;
      }
      if (isSunday) otSundayHours += 1;
      if (isHol) otHolidayHours += 1;
    }
  }

  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);
  const cfg = getSettingsForDate(settings, period.start);
  if (!sal || !cfg) return [];

  const valorHora = computeHourlyRate(sal.monthly_salary, cfg.hourly_divisor);
  const entries: ComputedEntry[] = [];

  if (otDayHours > 0) {
    entries.push({
      concept_type: "overtime_day",
      is_income: isIncomeForConcept("overtime_day"),
      base: valorHora,
      rate: 0.25,
      amount: Math.round(otDayHours * valorHora * 0.25),
      description: `Hora extra diurna (${otDayHours}h)`,
    });
  }

  if (otNightHours > 0) {
    entries.push({
      concept_type: "overtime_night",
      is_income: isIncomeForConcept("overtime_night"),
      base: valorHora,
      rate: 0.75,
      amount: Math.round(otNightHours * valorHora * 0.75),
      description: `Hora extra nocturna (${otNightHours}h)`,
    });
  }

  // Recargos adicionales por extras dominicales/festivas (suman aritméticamente)
  if (otSundayHours > 0) {
    entries.push({
      concept_type: "surcharge_sunday",
      is_income: isIncomeForConcept("surcharge_sunday"),
      base: valorHora,
      rate: cfg.sunday_surcharge_pct,
      amount: Math.round(otSundayHours * valorHora * cfg.sunday_surcharge_pct),
      description: `Recargo dominical en hora extra (${otSundayHours}h)`,
    });
  }

  if (otHolidayHours > 0) {
    entries.push({
      concept_type: "surcharge_holiday",
      is_income: isIncomeForConcept("surcharge_holiday"),
      base: valorHora,
      rate: cfg.holiday_surcharge_pct,
      amount: Math.round(otHolidayHours * valorHora * cfg.holiday_surcharge_pct),
      description: `Recargo festivo en hora extra (${otHolidayHours}h)`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Stage 6 — computeAdjustments
// ---------------------------------------------------------------------------

/**
 * Emit one ComputedEntry per salary_adjustment with payment_date within
 * [period.start, period.end]. Each adjustment is emitted independently
 * (no aggregation). is_salary_component → bonus_salary; else → bonus_non_salary.
 */
export function computeAdjustments(input: PayrollComputeInput): ComputedEntry[] {
  const { period, adjustments } = input;

  return adjustments
    .filter(
      (adj) => adj.payment_date >= period.start && adj.payment_date <= period.end
    )
    .map((adj) => ({
      concept_type: adj.is_salary_component
        ? ("bonus_salary" as const)
        : ("bonus_non_salary" as const),
      is_income: true,
      base: null,
      rate: null,
      amount: adj.amount,
      description: adj.concept_label,
    }));
}

// ---------------------------------------------------------------------------
// Stage 7 — computeIBC
// ---------------------------------------------------------------------------

/** Concept types that count toward IBC (exclude transport and bonus_non_salary). */
const IBC_INCOME_CONCEPTS = new Set([
  "salary",
  "surcharge_night",
  "surcharge_sunday",
  "surcharge_holiday",
  "overtime_day",
  "overtime_night",
  "bonus_salary",
]);

/**
 * Compute the Ingreso Base de Cotización (IBC) for the period.
 *
 * Normal employee: IBC = sum of salary + surcharges + overtime + bonus_salary.
 * Integral salary: IBC = 70% × monthly_salary (prorated by worked days).
 * Caps: IBC ∈ [SMMLV, 25 × SMMLV].
 */
export function computeIBC(input: PayrollComputeInput, allEntries: ComputedEntry[]): number {
  const { employee, period, salaryHistory, settings } = input;

  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);
  const cfg = getSettingsForDate(settings, period.start);

  const smmlv = cfg?.smmlv ?? 1_750_905;

  const salaryEntry = allEntries.find((e) => e.concept_type === "salary");
  const isIntegral = salaryEntry?.description === "salario integral";

  let ibc: number;

  if (isIntegral && sal) {
    // IBC = 70% × monthly_salary prorated by same days ratio as salary entry
    const days = salaryEntry ? Math.round((salaryEntry.amount / sal.monthly_salary) * 30) : 30;
    ibc = Math.round(0.70 * sal.monthly_salary * days / 30);
  } else {
    // Normal: sum of IBC-eligible income entries
    ibc = allEntries
      .filter((e) => IBC_INCOME_CONCEPTS.has(e.concept_type))
      .reduce((sum, e) => sum + e.amount, 0);
  }

  // Caps: [SMMLV, 25 × SMMLV]
  ibc = Math.max(smmlv, Math.min(25 * smmlv, ibc));

  return ibc;
}

// ---------------------------------------------------------------------------
// Stage 8 — computeEmployeeDeductions
// ---------------------------------------------------------------------------

/**
 * Compute employee deductions:
 * - health_employee = ibc × 0.04
 * - pension_employee = ibc × 0.04
 * - solidarity_pension (if IBC ≥ 4 × SMMLV)
 * - income_tax (retención en la fuente, via depuración + tabla Art. 383 ET)
 *
 * Returns up to 4 ComputedEntry rows with is_income=false.
 */
export function computeEmployeeDeductions(
  input: PayrollComputeInput,
  ibc: number,
  totalDevengado: number
): ComputedEntry[] {
  const { employee, period, settings, taxDeductions } = input;

  const cfg = getSettingsForDate(settings, period.start);
  const smmlv = cfg?.smmlv ?? 1_750_905;
  const uvt = cfg?.uvt ?? 52_374;

  const health = Math.round(ibc * 0.04);
  const pension = Math.round(ibc * 0.04);
  const solidarityRate = getSolidarityRate(ibc, smmlv);

  const deductions: ComputedEntry[] = [];

  deductions.push({
    concept_type: "health_employee",
    is_income: false,
    base: ibc,
    rate: 0.04,
    amount: health,
    description: "Salud empleado 4%",
  });

  deductions.push({
    concept_type: "pension_employee",
    is_income: false,
    base: ibc,
    rate: 0.04,
    amount: pension,
    description: "Pensión empleado 4%",
  });

  if (solidarityRate > 0) {
    deductions.push({
      concept_type: "solidarity_pension",
      is_income: false,
      base: ibc,
      rate: solidarityRate,
      amount: Math.round(ibc * solidarityRate),
      description: `Fondo solidaridad pensional ${(solidarityRate * 100).toFixed(1)}%`,
    });
  }

  // Retención en la fuente (income_tax)
  const mandatorySS = health + pension;
  const depInput = {
    grossIncome: totalDevengado,
    mandatorySS,
    dependents: taxDeductions?.dependents_count ?? 0,
    mortgageInterest: taxDeductions?.mortgage_interest_monthly ?? 0,
    prepaidHealth: taxDeductions?.prepaid_health_monthly ?? 0,
    voluntaryPension: taxDeductions?.voluntary_pension_monthly ?? 0,
    afc: taxDeductions?.afc_monthly ?? 0,
    uvt,
  };

  const baseDepurada = depurarBaseRetencion(depInput);
  const incomeTaxAmount = aplicarTablaRetencion(baseDepurada, uvt);

  if (incomeTaxAmount > 0) {
    deductions.push({
      concept_type: "income_tax",
      is_income: false,
      base: baseDepurada,
      rate: null,
      amount: incomeTaxAmount,
      description: "Retención en la fuente",
    });
  }

  return deductions;
}

// ---------------------------------------------------------------------------
// Stage 9 — computeProvisionsAndEmployerCost
// ---------------------------------------------------------------------------

/**
 * Compute monthly provisions (cesantias, cesantias_interest, prima, vacaciones)
 * and employer contribution costs (health, pension, ARL, parafiscales).
 *
 * Integral salary: provisions = [] (included in the integral factor by law).
 * Normal salary: base_provisiones = salary + transport + surcharges + overtime + bonus_salary.
 */
export function computeProvisionsAndEmployerCost(
  input: PayrollComputeInput,
  ibc: number,
  allEntries: ComputedEntry[],
  ytdBefore: { cesantias: number; cesantias_interest: number; prima: number; vacaciones: number }
): { provisions: ComputedProvision[]; employer_cost: ComputedEmployerCost } {
  const { employee, period, salaryHistory, settings } = input;

  const sal = getCurrentSalary(salaryHistory, employee.id, period.start);
  const cfg = getSettingsForDate(settings, period.start);
  const smmlv = cfg?.smmlv ?? 1_750_905;

  const isIntegral = allEntries.some(
    (e) => e.concept_type === "salary" && e.description === "salario integral"
  );

  const provisions: ComputedProvision[] = [];

  if (!isIntegral) {
    // Base provisiones: salary + transport + surcharges + overtime + bonus_salary
    const PROVISION_CONCEPTS = new Set([
      "salary", "transport",
      "surcharge_night", "surcharge_sunday", "surcharge_holiday",
      "overtime_day", "overtime_night",
      "bonus_salary",
    ]);
    const base = allEntries
      .filter((e) => PROVISION_CONCEPTS.has(e.concept_type))
      .reduce((sum, e) => sum + e.amount, 0);

    const monthlySalary = sal?.monthly_salary ?? 0;

    const cesantiasAmt = Math.round(base * 0.0833);
    const cesantiasIntAmt = Math.round(cesantiasAmt * 0.01);
    const primaAmt = Math.round(base * 0.0833);
    const vacacionesAmt = Math.round(monthlySalary * 0.0417);

    provisions.push({
      concept: "cesantias",
      base,
      rate: 0.0833,
      amount: cesantiasAmt,
      accumulated_ytd: ytdBefore.cesantias + cesantiasAmt,
    });

    provisions.push({
      concept: "cesantias_interest",
      base: cesantiasAmt,
      rate: 0.01,
      amount: cesantiasIntAmt,
      accumulated_ytd: ytdBefore.cesantias_interest + cesantiasIntAmt,
    });

    provisions.push({
      concept: "prima",
      base,
      rate: 0.0833,
      amount: primaAmt,
      accumulated_ytd: ytdBefore.prima + primaAmt,
    });

    provisions.push({
      concept: "vacaciones",
      base: monthlySalary,
      rate: 0.0417,
      amount: vacacionesAmt,
      accumulated_ytd: ytdBefore.vacaciones + vacacionesAmt,
    });
  }

  // Employer cost
  const monthlySalary = sal?.monthly_salary ?? 0;
  const arlRate = getArlRate(employee.arl_risk_class);
  const exonerated = isExonerationApplicable(monthlySalary, smmlv);

  const health_employer = Math.round(ibc * 0.085);
  const pension_employer = Math.round(ibc * 0.12);
  const arl_employer = Math.round(ibc * arlRate);
  const parafiscales_caja = Math.round(ibc * 0.04);
  const parafiscales_sena = exonerated ? 0 : Math.round(ibc * 0.02);
  const parafiscales_icbf = exonerated ? 0 : Math.round(ibc * 0.03);
  const total = health_employer + pension_employer + arl_employer + parafiscales_caja + parafiscales_sena + parafiscales_icbf;

  return {
    provisions,
    employer_cost: {
      health_employer,
      pension_employer,
      arl_employer,
      parafiscales_caja,
      parafiscales_sena,
      parafiscales_icbf,
      total,
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — computePayroll (stages 1-9)
// ---------------------------------------------------------------------------

/**
 * Top-level pure payroll computation entry point.
 *
 * All 9 stages wired in order. Stages 7-9 (IBC, deductions, provisions,
 * employer cost) run once on the combined entries from stages 1-6.
 *
 * Contract:
 * - `errors[]` → hard problems that block period approval.
 * - `warnings[]` → soft messages surfaced in the UI but don't block.
 */

/** Helper: check whether an entry represents an integral salary. */
export function entryIsIntegral(entry: ComputedEntry): boolean {
  return entry.concept_type === "salary" && entry.description === "salario integral";
}

/** Returns a zero-valued ComputedEmployerCost. */
function emptyEmployerCost(): ComputedEmployerCost {
  return {
    health_employer: 0,
    pension_employer: 0,
    arl_employer: 0,
    parafiscales_caja: 0,
    parafiscales_sena: 0,
    parafiscales_icbf: 0,
    total: 0,
  };
}

function isFirstDayOfMonth(dateStr: string): boolean {
  return dateStr.endsWith("-01");
}

function isFifteenthOfMonth(dateStr: string): boolean {
  return dateStr.endsWith("-15");
}

function isLastDayOfMonth(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  return next.getUTCMonth() !== m - 1;
}

function isQ1Advance(period: { start: string; end: string; frequency: string; paymentMode?: string }): boolean {
  return (
    period.paymentMode === "advance_settlement" &&
    period.frequency === "quincenal" &&
    isFirstDayOfMonth(period.start) &&
    isFifteenthOfMonth(period.end)
  );
}

function isQ2Settlement(period: { start: string; end: string; frequency: string; paymentMode?: string }): boolean {
  return (
    period.paymentMode === "advance_settlement" &&
    period.frequency === "quincenal" &&
    period.start.endsWith("-16") &&
    isLastDayOfMonth(period.end)
  );
}

/**
 * Detect whether the period crosses a settings boundary.
 * Returns an array of sub-period {start, end} ranges if it does, otherwise null.
 */
function splitPeriodBySettings(
  settings: PayrollSettings[],
  periodStart: string,
  periodEnd: string
): Array<{ start: string; end: string }> | null {
  const boundaries: string[] = settings
    .map((s) => s.period_start)
    .filter((d) => d > periodStart && d <= periodEnd)
    .sort();

  if (boundaries.length === 0) return null;

  const subPeriods: Array<{ start: string; end: string }> = [];
  let cursor = periodStart;
  for (const boundary of boundaries) {
    const dayBefore = isoDateMinusOneDay(boundary);
    subPeriods.push({ start: cursor, end: dayBefore });
    cursor = boundary;
  }
  subPeriods.push({ start: cursor, end: periodEnd });

  return subPeriods;
}

/** Return YYYY-MM-DD string for the day before the given date string. */
function isoDateMinusOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - 86_400_000;
  const dt = new Date(ms);
  const yr = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(dt.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

/** Merge duplicate concept_type entries by summing amounts (for multi-period aggregation). */
function mergeEntriesByConcept(entries: ComputedEntry[]): ComputedEntry[] {
  const map = new Map<string, ComputedEntry>();
  for (const e of entries) {
    const existing = map.get(e.concept_type);
    if (!existing) {
      map.set(e.concept_type, { ...e });
    } else {
      existing.amount += e.amount;
    }
  }
  return Array.from(map.values());
}

/**
 * Internal full pipeline (stages 1-9). Does NOT check advance/settlement branches.
 * Called by computePayroll (which checks branches first) and by the Q2 settlement branch.
 */
function runFullPipeline(input: PayrollComputeInput): PayrollComputeOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Detect multi-period split (§4.2)
  const subPeriods = splitPeriodBySettings(input.settings, input.period.start, input.period.end);

  let incomeEntries: ComputedEntry[];

  if (subPeriods) {
    // Multi-period split:
    // - Stages 1-3 (salary, transport) run ONCE on the full period
    // - Stages 4-5 (surcharges, overtime) run per sub-period with per-sub-period settings
    // - Stage 6 (adjustments) run per sub-period by payment_date
    const allSubEntries: ComputedEntry[] = [];

    // Stages 1-3: full period
    const workedDays = computeWorkedDays(input);
    const { entries: salaryEntries, errors: salaryErrors } = computeBaseSalary(input, workedDays);
    errors.push(...salaryErrors);

    const baseSalaryEntry = salaryEntries[0] ?? null;
    const transportEntry = baseSalaryEntry
      ? computeTransportAux(input, workedDays, baseSalaryEntry)
      : null;

    allSubEntries.push(...salaryEntries);
    if (transportEntry) allSubEntries.push(transportEntry);

    // Stages 4-6: per sub-period
    for (const sub of subPeriods) {
      const subInput: PayrollComputeInput = {
        ...input,
        period: { ...input.period, start: sub.start, end: sub.end },
        scheduleEntries: input.scheduleEntries.filter(
          (e) => e.date >= sub.start && e.date <= sub.end
        ),
        adjustments: input.adjustments.filter(
          (a) => a.payment_date >= sub.start && a.payment_date <= sub.end
        ),
        absences: input.absences.filter(
          (a) => a.start_date <= sub.end && a.end_date >= sub.start
        ),
      };

      const surchargeE = computeSurcharges(subInput);
      const overtimeE = computeOvertime(subInput);
      const adjustE = computeAdjustments(subInput);

      allSubEntries.push(...surchargeE, ...overtimeE, ...adjustE);
    }

    // Salary and transport stay as single entries; merge surcharges/overtime/adjustments
    const salaryAndTransport = allSubEntries.filter(
      (e) => e.concept_type === "salary" || e.concept_type === "transport"
    );
    const rest = allSubEntries.filter(
      (e) => e.concept_type !== "salary" && e.concept_type !== "transport"
    );
    incomeEntries = [...salaryAndTransport, ...mergeEntriesByConcept(rest)];
  } else {
    // Single period — stages 1-6 run normally
    const workedDays = computeWorkedDays(input);

    const { entries: salaryEntries, errors: salaryErrors } = computeBaseSalary(input, workedDays);
    errors.push(...salaryErrors);

    const baseSalaryEntry = salaryEntries[0] ?? null;
    const transportEntry = baseSalaryEntry
      ? computeTransportAux(input, workedDays, baseSalaryEntry)
      : null;

    const surchargeEntries = computeSurcharges(input);
    const overtimeEntries = computeOvertime(input);
    const adjustmentEntries = computeAdjustments(input);

    incomeEntries = [
      ...salaryEntries,
      ...(transportEntry ? [transportEntry] : []),
      ...surchargeEntries,
      ...overtimeEntries,
      ...adjustmentEntries,
    ];
  }

  // Stage 7 — IBC (once on combined entries)
  const ibc = incomeEntries.length > 0 ? computeIBC(input, incomeEntries) : 0;

  // Stage 8 — Employee deductions
  const totalDevengado = incomeEntries
    .filter((e) => e.is_income)
    .reduce((sum, e) => sum + e.amount, 0);

  const deductionEntries = incomeEntries.length > 0 && ibc > 0
    ? computeEmployeeDeductions(input, ibc, totalDevengado)
    : [];

  // Stage 9 — Provisions + employer cost (once on combined totals)
  const { provisions, employer_cost } = incomeEntries.length > 0 && ibc > 0
    ? computeProvisionsAndEmployerCost(input, ibc, incomeEntries, input.ytdProvisionsBefore)
    : {
        provisions: [] as ComputedProvision[],
        employer_cost: emptyEmployerCost(),
      };

  return {
    entries: [...incomeEntries, ...deductionEntries],
    provisions,
    employer_cost,
    warnings,
    errors,
  };
}

export function computePayroll(input: PayrollComputeInput): PayrollComputeOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Q1 advance branch: emit only salary+transport, skip stages 4-9.
  if (isQ1Advance(input.period)) {
    const termInQ1 =
      input.employee.termination_date &&
      input.employee.termination_date >= input.period.start &&
      input.employee.termination_date <= input.period.end;

    if (!termInQ1) {
      const workedDays = computeWorkedDays(input);
      const { entries: salaryEntries, errors: salaryErrors } = computeBaseSalary(input, workedDays);
      errors.push(...salaryErrors);

      const baseSalaryEntry = salaryEntries[0] ?? null;
      const transportEntry = baseSalaryEntry
        ? computeTransportAux(input, workedDays, baseSalaryEntry)
        : null;

      const advanceEntries: ComputedEntry[] = [
        ...salaryEntries,
        ...(transportEntry ? [transportEntry] : []),
      ];

      return {
        entries: advanceEntries,
        provisions: [],
        employer_cost: emptyEmployerCost(),
        warnings: ["Anticipo de Q1 — la liquidación completa llega en la segunda quincena"],
        errors,
      };
    }
  }

  // Q2 settlement branch: compute on full month, then subtract Q1 advance.
  if (isQ2Settlement(input.period)) {
    const monthStart = input.period.start.slice(0, 7) + "-01";
    // Use the period end as-is (it should already be the last day of the month)
    const monthEnd = input.period.end;

    const fullMonthInput: PayrollComputeInput = {
      ...input,
      // Override to "mensual" so computeWorkedDays uses 30-day cap (not 15).
      period: { ...input.period, start: monthStart, end: monthEnd, frequency: "mensual" },
    };

    const monthlyOutput = runFullPipeline(fullMonthInput);

    // Subtract Q1 advance from salary and transport entries.
    if (input.q1AdvanceEntries && input.q1AdvanceEntries.length > 0) {
      const q1Salary = input.q1AdvanceEntries.find((e) => e.concept_type === "salary")?.amount ?? 0;
      const q1Transport = input.q1AdvanceEntries.find((e) => e.concept_type === "transport")?.amount ?? 0;

      monthlyOutput.entries = monthlyOutput.entries.map((e) => {
        if (e.concept_type === "salary") {
          return { ...e, amount: e.amount - q1Salary };
        }
        if (e.concept_type === "transport") {
          return { ...e, amount: e.amount - q1Transport };
        }
        return e;
      });

      monthlyOutput.warnings.push(`Anticipo Q1 ya pagado: ${q1Salary + q1Transport} restado`);
    }

    return monthlyOutput;
  }

  // Normal pipeline (independent mode or full mensual).
  return runFullPipeline(input);
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
