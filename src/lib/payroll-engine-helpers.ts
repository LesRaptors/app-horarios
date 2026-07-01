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

import type { HolidayDate, PayrollSettings } from "./types";

export function classifyHour(
  date: string,
  hourOfDay: number,
  holidays: HolidayDate[],
  settings: PayrollSettings,
  locationId: string
): { isNight: boolean; isSunday: boolean; isHoliday: boolean } {
  const dow = new Date(date + "T00:00:00").getDay();
  const isSunday = dow === 0;
  const isNight = hourOfDay >= settings.night_start_hour || hourOfDay < 6;
  const isHoliday = holidays.some(
    (h) => h.date === date && (h.location_id === null || h.location_id === locationId)
  );
  return { isNight, isSunday, isHoliday };
}

/**
 * Fracción trabajada [0..1] de cada hora del turno tras descontar el descanso.
 * El descanso (breakMinutes) se resta de las horas de MENOR peso de recargo primero
 * (ordinaria antes que nocturna antes que dominical/festiva), propagando el remanente.
 * `weights[i]` = suma de porcentajes de recargo de la hora i (0 = ordinaria).
 */
export function workedFractionsAfterBreak(weights: number[], breakMinutes: number): number[] {
  const worked = weights.map(() => 1);
  let remaining = breakMinutes / 60;
  if (remaining <= 0) return worked;
  const order = weights.map((_, i) => i).sort((a, b) => weights[a] - weights[b]);
  for (const i of order) {
    if (remaining <= 0) break;
    const deduct = Math.min(worked[i], remaining);
    worked[i] -= deduct;
    remaining -= deduct;
  }
  return worked;
}

export function aplicarTablaRetencion(baseDepurada: number, uvt: number): number {
  const baseUvt = baseDepurada / uvt;
  if (baseUvt <= 95) return 0;
  if (baseUvt <= 150) {
    return Math.round((baseUvt - 95) * 0.19 * uvt);
  }
  if (baseUvt <= 360) {
    const acc = (150 - 95) * 0.19;
    return Math.round((acc + (baseUvt - 150) * 0.28) * uvt);
  }
  if (baseUvt <= 640) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28;
    return Math.round((acc + (baseUvt - 360) * 0.33) * uvt);
  }
  if (baseUvt <= 945) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33;
    return Math.round((acc + (baseUvt - 640) * 0.35) * uvt);
  }
  if (baseUvt <= 2300) {
    const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33 + (945 - 640) * 0.35;
    return Math.round((acc + (baseUvt - 945) * 0.37) * uvt);
  }
  const acc = (150 - 95) * 0.19 + (360 - 150) * 0.28 + (640 - 360) * 0.33 + (945 - 640) * 0.35 + (2300 - 945) * 0.37;
  return Math.round((acc + (baseUvt - 2300) * 0.39) * uvt);
}

export interface DepurarRetencionInput {
  grossIncome: number;
  mandatorySS: number;
  dependents: number;
  mortgageInterest: number;
  prepaidHealth: number;
  voluntaryPension: number;
  afc: number;
  uvt: number;
}

export function depurarBaseRetencion(input: DepurarRetencionInput): number {
  const { grossIncome, mandatorySS, dependents, mortgageInterest,
          prepaidHealth, voluntaryPension, afc, uvt } = input;
  if (grossIncome <= 0) return 0;

  // 1. Restar aportes obligatorios SS.
  let base = grossIncome - mandatorySS;

  // 2. Restar deducciones (con topes en UVT).
  const dependentsCap = Math.min(grossIncome * 0.10, 32 * uvt);
  const dependentsDed = dependents > 0 ? dependentsCap : 0;
  const mortgageCap = Math.min(mortgageInterest, 100 * uvt);
  const prepaidCap = Math.min(prepaidHealth, 16 * uvt);
  base -= dependentsDed + mortgageCap + prepaidCap;

  // 3. Restar rentas exentas (AFC + voluntary AFP, tope 30% del bruto).
  const exentaCap = Math.min(voluntaryPension + afc, grossIncome * 0.30);
  base -= exentaCap;

  // 4. Restar 25% renta exenta laboral con tope 240 UVT/mes.
  const laboralExenta = Math.min(base * 0.25, 240 * uvt);
  base -= laboralExenta;

  return Math.max(0, base);
}
