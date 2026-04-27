/**
 * payroll-period-builder.ts
 *
 * Async orchestrator that, for each active (non-terminated) employee:
 *  1. Fetches all inputs required by the engine.
 *  2. Calls computePayroll(input).
 *  3. Batch-inserts payroll_entries / payroll_provisions / payroll_employer_cost.
 *
 * Called from PeriodGenerateModal (initial run) and from the
 * "Recalcular todos" / "Recalcular este empleado" buttons.
 *
 * When recalculating, non-manual rows for the affected employees are deleted
 * first so they can be replaced (manual overrides with is_manual_override=true
 * are preserved).
 */

import { createClient } from "@/lib/supabase/client";
import { computePayroll } from "@/lib/payroll-engine";
import type { ComputedEntry } from "@/lib/payroll-engine";
import type {
  Profile,
  SalaryHistory,
  ScheduleEntry,
  ShiftTemplate,
  HolidayDate,
  AbsenceRecord,
  SalaryAdjustment,
  TaxPersonalDeduction,
  PayrollSettings,
  PaymentFrequency,
  PayrollProvision,
} from "@/lib/types";

export interface BuildResult {
  employeesProcessed: number;
  warnings: string[];
  errors: string[]; // per-employee hard errors
}

/**
 * Core builder. Runs the full pipeline for the given employees over the given period.
 * If `replaceExisting=true`, deletes non-manual rows first (recalc path).
 */
export async function assemblePayrollPeriod(
  periodId: string,
  periodStart: string,
  periodEnd: string,
  frequency: PaymentFrequency,
  employeeIds: string[] | null, // null = all active non-terminated
  replaceExisting: boolean
): Promise<BuildResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const warnings: string[] = [];
  const errors: string[] = [];

  // 0. Read payment_mode from app_flags (cached for the whole period build)
  const { data: flagsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "app_flags")
    .maybeSingle();

  const paymentMode: "independent" | "advance_settlement" =
    ((flagsRow?.value as Record<string, unknown>)?.payment_mode as string) === "advance_settlement"
      ? "advance_settlement"
      : "independent";

  // Detect structural Q1 advance: advance_settlement + quincenal + 01-to-15 window
  const isQ1Advance =
    paymentMode === "advance_settlement" &&
    frequency === "quincenal" &&
    periodStart.endsWith("-01") &&
    periodEnd.endsWith("-15");

  // Detect structural Q2 settlement: advance_settlement + quincenal + 16-to-EOM window
  const isQ2Settlement =
    paymentMode === "advance_settlement" &&
    frequency === "quincenal" &&
    periodStart.endsWith("-16");

  // If this is a Q1 advance period, mark it on payroll_periods immediately (once, not per employee)
  if (isQ1Advance) {
    await supabase
      .from("payroll_periods")
      .update({ is_advance: true })
      .eq("id", periodId);
  }

  // Hoist Q1 period ID lookup for Q2 settlement (doesn't depend on individual employee)
  let q1PeriodId: string | null = null;
  if (isQ2Settlement) {
    const monthStart = periodStart.slice(0, 7) + "-01";
    const q1End = periodStart.slice(0, 7) + "-15";
    const { data: q1PeriodRow } = await supabase
      .from("payroll_periods")
      .select("id")
      .eq("period_start", monthStart)
      .eq("period_end", q1End)
      .eq("is_advance", true)
      .maybeSingle();
    q1PeriodId = q1PeriodRow?.id ?? null;
  }

  // 1. Resolve employee list
  let employees: (Profile & { hire_date: string | null; termination_date: string | null; arl_risk_class: number | null })[] = [];

  if (employeeIds) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", employeeIds)
      .eq("is_active", true);
    employees = data ?? [];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .or("is_terminated.is.null,is_terminated.eq.false");
    employees = data ?? [];
  }

  if (employees.length === 0) return { employeesProcessed: 0, warnings, errors };

  const allEmployeeIds = employees.map((e) => e.id);

  // 2. Fetch shared data (applies to all employees)
  const [
    salaryHistoryRes,
    scheduleEntriesRes,
    shiftTemplatesRes,
    holidaysRes,
    absencesRes,
    adjustmentsRes,
    taxDeductionsRes,
    payrollSettingsRes,
  ] = await Promise.all([
    supabase
      .from("salary_history")
      .select("*")
      .in("employee_id", allEmployeeIds),
    supabase
      .from("schedule_entries")
      .select("*, schedule:schedules(location_id, status)")
      .in("employee_id", allEmployeeIds)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .neq("overtime_status", "rejected"),
    supabase.from("shift_templates").select("*"),
    supabase
      .from("holidays")
      .select("*")
      .gte("date", periodStart)
      .lte("date", periodEnd),
    supabase
      .from("absence_records")
      .select("*")
      .in("employee_id", allEmployeeIds)
      .lte("start_date", periodEnd)
      .gte("end_date", periodStart),
    supabase
      .from("salary_adjustments")
      .select("*")
      .in("employee_id", allEmployeeIds)
      .gte("payment_date", periodStart)
      .lte("payment_date", periodEnd),
    supabase
      .from("tax_personal_deductions")
      .select("*")
      .in("employee_id", allEmployeeIds)
      .lte("effective_from", periodEnd)
      .or("effective_to.is.null,effective_to.gte." + periodStart),
    supabase
      .from("payroll_settings")
      .select("*")
      .lte("period_start", periodEnd)
      .order("period_start", { ascending: false }),
  ]);

  const salaryHistory: SalaryHistory[] = salaryHistoryRes.data ?? [];
  const scheduleEntries: ScheduleEntry[] = (scheduleEntriesRes.data ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => e.schedule?.status === "published"
  );
  const shiftTemplates: ShiftTemplate[] = shiftTemplatesRes.data ?? [];
  const holidays: HolidayDate[] = holidaysRes.data ?? [];
  const absences: AbsenceRecord[] = absencesRes.data ?? [];
  const adjustments: SalaryAdjustment[] = adjustmentsRes.data ?? [];
  const taxDeductionsAll: TaxPersonalDeduction[] = taxDeductionsRes.data ?? [];
  const payrollSettings: PayrollSettings[] = payrollSettingsRes.data ?? [];

  // Year for YTD accumulation
  const periodYear = parseInt(periodStart.slice(0, 4), 10);

  // 3. Fetch ytd provisions before this period for all employees
  const ytdProvisionsMap: Record<string, { cesantias: number; cesantias_interest: number; prima: number; vacaciones: number }> = {};

  // Fetch all payroll_provisions for these employees for this year from periods with status approved/paid
  // that have period_end < periodStart
  const periodsBeforeRes = await supabase
    .from("payroll_periods")
    .select("id")
    .in("status", ["approved", "paid"])
    .gte("period_start", `${periodYear}-01-01`)
    .lt("period_end", periodStart);

  const periodsBefore: string[] = (periodsBeforeRes.data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.id
  );

  if (periodsBefore.length > 0) {
    const provisionsBeforeRes = await supabase
      .from("payroll_provisions")
      .select("employee_id, concept, amount")
      .in("employee_id", allEmployeeIds)
      .in("payroll_period_id", periodsBefore);

    for (const row of provisionsBeforeRes.data ?? []) {
      if (!ytdProvisionsMap[row.employee_id]) {
        ytdProvisionsMap[row.employee_id] = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
      }
      const bucket = ytdProvisionsMap[row.employee_id];
      if (row.concept === "cesantias") bucket.cesantias += row.amount;
      else if (row.concept === "cesantias_interest") bucket.cesantias_interest += row.amount;
      else if (row.concept === "prima") bucket.prima += row.amount;
      else if (row.concept === "vacaciones") bucket.vacaciones += row.amount;
    }
  }

  // 4. If recalculating, delete non-manual rows for these employees in this period
  if (replaceExisting) {
    await supabase
      .from("payroll_entries")
      .delete()
      .eq("payroll_period_id", periodId)
      .in("employee_id", allEmployeeIds)
      .eq("is_manual_override", false);

    await supabase
      .from("payroll_provisions")
      .delete()
      .eq("payroll_period_id", periodId)
      .in("employee_id", allEmployeeIds);

    await supabase
      .from("payroll_employer_cost")
      .delete()
      .eq("payroll_period_id", periodId)
      .in("employee_id", allEmployeeIds);
  }

  // 5. Run engine per employee and collect rows for batch insert
  const entriesInsert: object[] = [];
  const provisionsInsert: object[] = [];
  const employerCostInsert: object[] = [];
  let anyAdvanceWarning = false;

  for (const employee of employees) {
    const empEntries = scheduleEntries.filter((e) => e.employee_id === employee.id);
    const empAbsences = absences.filter((a) => a.employee_id === employee.id);
    const empAdjustments = adjustments.filter((a) => a.employee_id === employee.id);
    const empSalaryHistory = salaryHistory.filter((s) => s.employee_id === employee.id);

    // Tax deductions: most recent vigente row for the employee
    const empTaxDeductions =
      taxDeductionsAll
        .filter(
          (t) =>
            t.employee_id === employee.id &&
            t.effective_from <= periodEnd &&
            (t.effective_to === null || t.effective_to >= periodStart)
        )
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;

    const ytdBefore = ytdProvisionsMap[employee.id] ?? {
      cesantias: 0,
      cesantias_interest: 0,
      prima: 0,
      vacaciones: 0,
    };

    // Q2 settlement: fetch Q1 advance entries for this employee
    let q1AdvanceEntries: ComputedEntry[] | undefined;
    if (isQ2Settlement && q1PeriodId) {
      const { data: q1Rows } = await supabase
        .from("payroll_entries")
        .select("concept_type, amount, is_income, base, rate, description")
        .eq("payroll_period_id", q1PeriodId)
        .eq("employee_id", employee.id)
        .in("concept_type", ["salary", "transport"]);
      q1AdvanceEntries = (q1Rows ?? []) as ComputedEntry[];
    }

    const output = computePayroll({
      employee,
      period: { start: periodStart, end: periodEnd, frequency, paymentMode },
      salaryHistory: empSalaryHistory,
      scheduleEntries: empEntries,
      shiftTemplates,
      holidays,
      absences: empAbsences,
      adjustments: empAdjustments,
      taxDeductions: empTaxDeductions,
      settings: payrollSettings,
      ytdProvisionsBefore: ytdBefore,
      q1AdvanceEntries,
    });

    if (output.warnings.length > 0) {
      warnings.push(...output.warnings.map((w) => `[${employee.first_name} ${employee.last_name}] ${w}`));
    }
    if (output.errors.length > 0) {
      errors.push(...output.errors.map((e) => `[${employee.first_name} ${employee.last_name}] ${e}`));
    }

    // Track if engine flagged this as a Q1 advance (belt-and-suspenders for the is_advance DB flag)
    if (!anyAdvanceWarning && output.warnings.some((w) => w.includes("Anticipo de Q1"))) {
      anyAdvanceWarning = true;
    }

    // Collect entries
    for (const entry of output.entries) {
      entriesInsert.push({
        payroll_period_id: periodId,
        employee_id: employee.id,
        concept_type: entry.concept_type,
        is_income: entry.is_income,
        base: entry.base,
        rate: entry.rate,
        amount: entry.amount,
        description: entry.description,
        is_manual_override: false,
      });
    }

    // Collect provisions
    for (const prov of output.provisions) {
      provisionsInsert.push({
        payroll_period_id: periodId,
        employee_id: employee.id,
        concept: prov.concept,
        base: prov.base,
        rate: prov.rate,
        amount: prov.amount,
        accumulated_ytd: prov.accumulated_ytd,
      });
    }

    // Collect employer cost
    const ec = output.employer_cost;
    employerCostInsert.push({
      payroll_period_id: periodId,
      employee_id: employee.id,
      health_employer: ec.health_employer,
      pension_employer: ec.pension_employer,
      arl_employer: ec.arl_employer,
      parafiscales_caja: ec.parafiscales_caja,
      parafiscales_sena: ec.parafiscales_sena,
      parafiscales_icbf: ec.parafiscales_icbf,
    });
  }

  // 6. Batch insert
  if (entriesInsert.length > 0) {
    await supabase.from("payroll_entries").insert(entriesInsert);
  }
  if (provisionsInsert.length > 0) {
    await supabase.from("payroll_provisions").insert(provisionsInsert);
  }
  if (employerCostInsert.length > 0) {
    await supabase.from("payroll_employer_cost").insert(employerCostInsert);
  }

  // 7. Belt-and-suspenders: if engine reported "Anticipo de Q1" but structural detection
  //    didn't catch it (e.g., non-standard date), mark the period as advance now.
  if (anyAdvanceWarning && !isQ1Advance) {
    await supabase
      .from("payroll_periods")
      .update({ is_advance: true })
      .eq("id", periodId);
  }

  return { employeesProcessed: employees.length, warnings, errors };
}

// Convenience: compute per-employee aggregate for summary
export interface EmployeeAggregate {
  employee_id: string;
  devengado: number;
  deducciones: number;
  neto: number;
  costo_empleador: number;
  provisions_total: number;
  has_errors: boolean;
  warnings: string[];
  entries: import("@/lib/types").PayrollEntry[];
  provisions: PayrollProvision[];
  employer_cost: import("@/lib/types").PayrollEmployerCost | null;
}
