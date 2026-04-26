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
