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

  // 1. Resolve employee list
  let employees: (Profile & { hire_date: string | null; termination_date: string | null; arl_risk_class: number | null })[] = [];

  if (employeeIds) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", employeeIds)
      .eq("is_active", true)
      .eq("is_demo", false);
    employees = data ?? [];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .eq("is_demo", false)
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
  const ytdRes = await supabase
    .from("payroll_provisions")
    .select("employee_id, concept, amount")
    .in("employee_id", allEmployeeIds)
    .lt(
      "payroll_period_id",
      // We join to payroll_periods to filter by year + approved status
      // Simpler: fetch via the period's created_at or use a sub-select.
      // Instead, fetch all provisions for the year from approved/paid periods before this one.
      ""
    );
  // Override: fetch ytd via a separate structured query
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

    const output = computePayroll({
      employee,
      period: { start: periodStart, end: periodEnd, frequency },
      salaryHistory: empSalaryHistory,
      scheduleEntries: empEntries,
      shiftTemplates,
      holidays,
      absences: empAbsences,
      adjustments: empAdjustments,
      taxDeductions: empTaxDeductions,
      settings: payrollSettings,
      ytdProvisionsBefore: ytdBefore,
    });

    if (output.warnings.length > 0) {
      warnings.push(...output.warnings.map((w) => `[${employee.first_name} ${employee.last_name}] ${w}`));
    }
    if (output.errors.length > 0) {
      errors.push(...output.errors.map((e) => `[${employee.first_name} ${employee.last_name}] ${e}`));
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
