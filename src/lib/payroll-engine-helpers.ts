import type { PayrollConceptType } from "./types";

const INCOME_CONCEPTS = new Set<PayrollConceptType>([
  "salary", "transport",
  "surcharge_night", "surcharge_sunday", "surcharge_holiday",
  "overtime_day", "overtime_night",
  "bonus_salary", "bonus_non_salary",
  "vacation_pay", "prima", "cesantias_interest",
]);

export function isIncomeForConcept(concept: string): boolean {
  return INCOME_CONCEPTS.has(concept as PayrollConceptType);
}

export function getSolidarityRate(ibc: number, smmlv: number): number {
  const ratio = ibc / smmlv;
  if (ratio < 4) return 0;
  if (ratio < 16) return 0.01;
  if (ratio < 17) return 0.012;
  if (ratio < 18) return 0.014;
  if (ratio < 19) return 0.016;
  if (ratio < 20) return 0.018;
  return 0.02;
}

export function getArlRate(class_: number | null): number {
  switch (class_) {
    case 1:
    case null:
    case undefined:
      return 0.00522;
    case 2: return 0.01044;
    case 3: return 0.02436;
    case 4: return 0.04350;
    case 5: return 0.06960;
    default: return 0.00522;
  }
}

export function isExonerationApplicable(monthlySalary: number, smmlv: number): boolean {
  return monthlySalary < 10 * smmlv;
}

import type { TaxPersonalDeduction } from "./types";

export function applyDayProration(monthlyAmount: number, workedDays: number): number {
  if (workedDays <= 0) return 0;
  if (workedDays >= 30) return Math.round(monthlyAmount);
  return Math.round((monthlyAmount * workedDays) / 30);
}

export function getCurrentTaxDeductions(
  history: TaxPersonalDeduction[],
  employeeId: string,
  date: string
): TaxPersonalDeduction | null {
  for (const r of history) {
    if (r.employee_id !== employeeId) continue;
    if (r.effective_from > date) continue;
    if (r.effective_to !== null && r.effective_to < date) continue;
    return r;
  }
  return null;
}
