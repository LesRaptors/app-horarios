import { createClient } from "@/lib/supabase/client";
import { computeLiquidacion } from "@/lib/liquidacion-engine";
import { getSettingsForDate } from "@/lib/payroll-helpers";
import type { Liquidation, PayrollSettings, SalaryHistory } from "@/lib/types";

export interface AssembleResult {
  errors: string[];
  warnings: string[];
}

export async function assembleLiquidacion(
  liquidationId: string
): Promise<AssembleResult> {
  const supabase = createClient() as any;

  // 1. Liquidación
  const { data: liq, error: liqErr } = await supabase
    .from("liquidations")
    .select("*")
    .eq("id", liquidationId)
    .maybeSingle();
  if (liqErr || !liq) {
    return { errors: ["No se encontró la liquidación."], warnings: [] };
  }
  const liquidation = liq as Liquidation;

  // 2. Último salario (para is_integral_salary)
  const { data: salaries } = await supabase
    .from("salary_history")
    .select("*")
    .eq("employee_id", liquidation.employee_id)
    .order("effective_from", { ascending: false });
  const latestSalary = ((salaries ?? []) as SalaryHistory[])[0] ?? null;

  // 3. payroll_settings vigente a termination_date
  const { data: settingsRows } = await supabase
    .from("payroll_settings")
    .select("*")
    .lte("period_start", liquidation.termination_date)
    .order("period_start", { ascending: false });
  const settings = getSettingsForDate(
    (settingsRows ?? []) as PayrollSettings[],
    liquidation.termination_date
  );

  // 4. Pre-validaciones que el motor no puede hacer (faltan datos externos)
  const preErrors: string[] = [];
  if (!settings) {
    preErrors.push(
      "No hay configuración de nómina (payroll_settings) vigente a la fecha de terminación."
    );
  }
  if (!latestSalary) {
    preErrors.push("El empleado no tiene salario registrado (salary_history).");
  }
  if (preErrors.length > 0 || !settings) {
    await supabase
      .from("liquidations")
      .update({ compute_errors: preErrors, compute_warnings: [] })
      .eq("id", liquidationId);
    return { errors: preErrors, warnings: [] };
  }

  // 5. Motor puro
  const output = computeLiquidacion({
    termination_date: liquidation.termination_date,
    hire_date: liquidation.hire_date,
    reason: liquidation.reason,
    contract_kind: liquidation.contract_kind,
    contract_end_date: liquidation.contract_end_date,
    cesantias_cutoff: liquidation.cesantias_cutoff,
    vacations_cutoff: liquidation.vacations_cutoff,
    vacation_days_pending: Number(liquidation.vacation_days_pending),
    base_salary: Number(liquidation.base_salary),
    is_integral_salary: latestSalary?.is_integral_salary ?? false,
    settings,
  });

  // 6. Borrar items no-override y reinsertar
  await supabase
    .from("liquidation_items")
    .delete()
    .eq("liquidation_id", liquidationId)
    .eq("is_manual_override", false);

  const itemsInsert = output.items.map((it) => ({
    liquidation_id: liquidationId,
    organization_id: liquidation.organization_id,
    concept: it.concept,
    base: it.base,
    days: it.days,
    amount: it.amount,
    description: it.description,
    is_manual_override: false,
  }));

  if (itemsInsert.length > 0) {
    const { error } = await supabase.from("liquidation_items").insert(itemsInsert);
    if (error) {
      output.errors.push(
        `No se pudieron guardar los conceptos de la liquidación: ${error.message}`
      );
    }
  }

  // 7. Persistir mensajes del motor
  await supabase
    .from("liquidations")
    .update({
      compute_errors: output.errors,
      compute_warnings: output.warnings,
    })
    .eq("id", liquidationId);

  return { errors: output.errors, warnings: output.warnings };
}
