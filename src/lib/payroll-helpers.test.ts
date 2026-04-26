import { describe, it, expect } from "vitest";
import { formatCOP, parseCOP, getCurrentSalary, getSettingsForDate, computeHourlyRate } from "./payroll-helpers";
import type { SalaryHistory, PayrollSettings } from "./types";

describe("formatCOP", () => {
  it("formats integer COP with dot thousands", () => {
    expect(formatCOP(2800000)).toBe("$2.800.000");
  });
  it("zero", () => {
    expect(formatCOP(0)).toBe("$0");
  });
  it("rounds non-integers", () => {
    expect(formatCOP(2800000.7)).toBe("$2.800.001");
  });
});

describe("parseCOP", () => {
  it.each([
    ["$2.800.000", 2800000],
    ["2.800.000", 2800000],
    ["2800000", 2800000],
    ["$2,800,000", 2800000],
    ["  $ 2.800.000  ", 2800000],
    ["0", 0],
  ])("'%s' → %i", (input, expected) => {
    expect(parseCOP(input)).toBe(expected);
  });
  it.each(["", "abc", "$$", "1,2,3,4.5,6"])(
    "'%s' → null",
    (input) => {
      expect(parseCOP(input)).toBeNull();
    }
  );
});

const mkSal = (overrides: Partial<SalaryHistory>): SalaryHistory => ({
  id: "x",
  employee_id: "emp1",
  monthly_salary: 2_000_000,
  is_integral_salary: false,
  transport_aux_override: null,
  change_reason: null,
  effective_from: "2026-01-01",
  effective_to: null,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("getCurrentSalary", () => {
  it("empty history → null", () => {
    expect(getCurrentSalary([], "emp1", "2026-04-15")).toBeNull();
  });
  it("single open row covers any date ≥ effective_from", () => {
    const h = [mkSal({ effective_from: "2026-01-01" })];
    expect(getCurrentSalary(h, "emp1", "2026-04-15")).toBe(h[0]);
    expect(getCurrentSalary(h, "emp1", "2026-01-01")).toBe(h[0]);
  });
  it("date before effective_from → null", () => {
    const h = [mkSal({ effective_from: "2026-03-01" })];
    expect(getCurrentSalary(h, "emp1", "2026-02-01")).toBeNull();
  });
  it("picks the row whose [from,to] contains the date", () => {
    const r1 = mkSal({ id: "r1", effective_from: "2026-01-01", effective_to: "2026-03-31" });
    const r2 = mkSal({ id: "r2", effective_from: "2026-04-01", effective_to: null });
    const h = [r1, r2];
    expect(getCurrentSalary(h, "emp1", "2026-02-15")?.id).toBe("r1");
    expect(getCurrentSalary(h, "emp1", "2026-04-15")?.id).toBe("r2");
  });
  it("filters by employee_id", () => {
    const h = [
      mkSal({ id: "a", employee_id: "emp1" }),
      mkSal({ id: "b", employee_id: "emp2" }),
    ];
    expect(getCurrentSalary(h, "emp2", "2026-04-15")?.id).toBe("b");
  });
});

const settings2026: PayrollSettings[] = [
  { id: "p1", period_start: "2026-01-01", period_end: "2026-06-30", smmlv: 1750905, aux_transport: 249095, hourly_divisor: 220, night_start_hour: 19, sunday_surcharge_pct: 0.8, holiday_surcharge_pct: 0.8, updated_at: "2026-01-01" },
  { id: "p2", period_start: "2026-07-01", period_end: "2026-07-14", smmlv: 1750905, aux_transport: 249095, hourly_divisor: 220, night_start_hour: 19, sunday_surcharge_pct: 0.9, holiday_surcharge_pct: 0.9, updated_at: "2026-01-01" },
  { id: "p3", period_start: "2026-07-15", period_end: null, smmlv: 1750905, aux_transport: 249095, hourly_divisor: 210, night_start_hour: 19, sunday_surcharge_pct: 0.9, holiday_surcharge_pct: 0.9, updated_at: "2026-01-01" },
];

describe("getSettingsForDate", () => {
  it("April 15 → first sub-period", () => {
    expect(getSettingsForDate(settings2026, "2026-04-15")?.id).toBe("p1");
  });
  it("July 10 → second sub-period", () => {
    expect(getSettingsForDate(settings2026, "2026-07-10")?.id).toBe("p2");
  });
  it("August 1 → third (open-ended)", () => {
    expect(getSettingsForDate(settings2026, "2026-08-01")?.id).toBe("p3");
  });
  it("date before any period → null", () => {
    expect(getSettingsForDate(settings2026, "2025-12-31")).toBeNull();
  });
  it("empty settings → null", () => {
    expect(getSettingsForDate([], "2026-04-15")).toBeNull();
  });
});

describe("computeHourlyRate", () => {
  it("$2.800.000 / 220 → 12727 (rounded)", () => {
    expect(computeHourlyRate(2_800_000, 220)).toBe(12727);
  });
  it("$2.800.000 / 210 → 13333 (rounded)", () => {
    expect(computeHourlyRate(2_800_000, 210)).toBe(13333);
  });
  it("salary 0 → 0", () => {
    expect(computeHourlyRate(0, 220)).toBe(0);
  });
  it("divisor 0 → 0 (defensive)", () => {
    expect(computeHourlyRate(2_800_000, 0)).toBe(0);
  });
});
