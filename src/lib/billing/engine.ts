import { IVA_RATE, GRACE_DAYS, type Plan } from "./types";

export function calculateNextPeriodEnd(currentEnd: Date): Date {
  const next = new Date(currentEnd);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function calculateIva(amountCop: number): number {
  return Math.round(amountCop * IVA_RATE);
}

export function calculateTotalWithIva(amountCop: number): number {
  return amountCop + calculateIva(amountCop);
}

export function isOverEmployeeLimit(plan: Plan, currentEmployees: number): boolean {
  if (plan.max_employees === null) return false;
  return currentEmployees > plan.max_employees;
}

export function shouldPauseAfterGrace(periodEnd: Date, now: Date): boolean {
  const msInGrace = GRACE_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - periodEnd.getTime() > msInGrace;
}

export function copToCents(cop: number): number {
  return cop * 100;
}
