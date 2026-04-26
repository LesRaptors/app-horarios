// Pure helpers for the payroll module (sub-spec 1).
// All functions are deterministic and side-effect free.

import type { SalaryHistory, PayrollSettings } from "./types";

export function formatCOP(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$${withDots}`;
}

export function parseCOP(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Remove leading $ and surrounding whitespace
  const noSign = trimmed.replace(/^\s*\$?\s*/, "");
  // Accept formats:
  //   digits only: 2800000
  //   dot-thousands: 2.800.000
  //   comma-thousands: 2,800,000
  // Reject anything else (mixed separators, non-3-digit groups after first, etc.)
  const dotThousands = /^-?\d{1,3}(\.\d{3})*$/;
  const commaThousands = /^-?\d{1,3}(,\d{3})*$/;
  const plainDigits = /^-?\d+$/;
  if (!dotThousands.test(noSign) && !commaThousands.test(noSign) && !plainDigits.test(noSign)) {
    return null;
  }
  const digits = noSign.replace(/[.,]/g, "");
  return parseInt(digits, 10);
}

export function getCurrentSalary(
  history: SalaryHistory[],
  employeeId: string,
  date: string
): SalaryHistory | null {
  for (const r of history) {
    if (r.employee_id !== employeeId) continue;
    if (r.effective_from > date) continue;
    if (r.effective_to !== null && r.effective_to < date) continue;
    return r;
  }
  return null;
}

export function getSettingsForDate(
  settings: PayrollSettings[],
  date: string
): PayrollSettings | null {
  for (const s of settings) {
    if (s.period_start > date) continue;
    if (s.period_end !== null && s.period_end < date) continue;
    return s;
  }
  return null;
}

export function computeHourlyRate(monthlySalary: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return Math.round(monthlySalary / divisor);
}

export function validateSalary(
  amount: number,
  smmlv: number,
  isIntegral: boolean
): { ok: boolean; error?: string; warning?: string } {
  if (!isIntegral && amount < smmlv) {
    return { ok: false, error: "El salario no puede ser menor al SMMLV vigente" };
  }
  if (isIntegral && amount < 13 * smmlv) {
    return {
      ok: true,
      warning: "El salario integral debería ser mayor o igual a 13 SMMLV",
    };
  }
  return { ok: true };
}
