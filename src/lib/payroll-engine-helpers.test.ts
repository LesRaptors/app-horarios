import { describe, it, expect } from "vitest";
import { isIncomeForConcept, getSolidarityRate, getArlRate, isExonerationApplicable, applyDayProration, getCurrentTaxDeductions } from "./payroll-engine-helpers";
import type { TaxPersonalDeduction } from "./types";

describe("isIncomeForConcept", () => {
  it.each([
    "salary","transport","surcharge_night","surcharge_sunday","surcharge_holiday",
    "overtime_day","overtime_night","bonus_salary","bonus_non_salary",
    "vacation_pay","prima","cesantias_interest"
  ])("%s is income", (c) => expect(isIncomeForConcept(c)).toBe(true));

  it.each([
    "health_employee","pension_employee","solidarity_pension","income_tax",
    "embargo","libranza","voluntary_pension","afc","union_fee","other_deduction"
  ])("%s is deduction", (c) => expect(isIncomeForConcept(c)).toBe(false));
});

const SMMLV = 1_750_905;

describe("getSolidarityRate", () => {
  it("< 4 SMMLV → 0", () => {
    expect(getSolidarityRate(3 * SMMLV, SMMLV)).toBe(0);
  });
  it("≥ 4 SMMLV and < 16 → 0.01", () => {
    expect(getSolidarityRate(4 * SMMLV, SMMLV)).toBe(0.01);
    expect(getSolidarityRate(15 * SMMLV, SMMLV)).toBe(0.01);
  });
  it("≥ 16 and < 17 → 0.012", () => {
    expect(getSolidarityRate(16 * SMMLV, SMMLV)).toBe(0.012);
  });
  it("≥ 17 and < 18 → 0.014", () => {
    expect(getSolidarityRate(17 * SMMLV, SMMLV)).toBe(0.014);
  });
  it("≥ 18 and < 19 → 0.016", () => {
    expect(getSolidarityRate(18 * SMMLV, SMMLV)).toBe(0.016);
  });
  it("≥ 19 and < 20 → 0.018", () => {
    expect(getSolidarityRate(19 * SMMLV, SMMLV)).toBe(0.018);
  });
  it("≥ 20 SMMLV → 0.02", () => {
    expect(getSolidarityRate(20 * SMMLV, SMMLV)).toBe(0.02);
    expect(getSolidarityRate(25 * SMMLV, SMMLV)).toBe(0.02);
  });
});

describe("getArlRate", () => {
  it.each([
    [null, 0.00522],
    [1, 0.00522],
    [2, 0.01044],
    [3, 0.02436],
    [4, 0.04350],
    [5, 0.06960],
  ])("class %s → %f", (cls, expected) => {
    expect(getArlRate(cls as number | null)).toBeCloseTo(expected, 5);
  });
});

describe("isExonerationApplicable", () => {
  it("salary < 10×SMMLV → true", () => {
    expect(isExonerationApplicable(5_000_000, SMMLV)).toBe(true);
  });
  it("salary ≥ 10×SMMLV → false", () => {
    expect(isExonerationApplicable(10 * SMMLV, SMMLV)).toBe(false);
    expect(isExonerationApplicable(20 * SMMLV, SMMLV)).toBe(false);
  });
});

describe("applyDayProration", () => {
  it("30 days → full amount", () => {
    expect(applyDayProration(3_000_000, 30)).toBe(3_000_000);
  });
  it("15 days → half", () => {
    expect(applyDayProration(3_000_000, 15)).toBe(1_500_000);
  });
  it("0 days → 0", () => {
    expect(applyDayProration(3_000_000, 0)).toBe(0);
  });
  it("8 days → 8/30", () => {
    expect(applyDayProration(3_000_000, 8)).toBe(800_000);
  });
});

const mkTax = (overrides: Partial<TaxPersonalDeduction>): TaxPersonalDeduction => ({
  id: "x", employee_id: "emp1",
  dependents_count: 0, mortgage_interest_monthly: 0,
  prepaid_health_monthly: 0, voluntary_pension_monthly: 0, afc_monthly: 0,
  effective_from: "2026-01-01", effective_to: null,
  created_by: null, created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("getCurrentTaxDeductions", () => {
  it("empty → null", () => {
    expect(getCurrentTaxDeductions([], "emp1", "2026-04-15")).toBeNull();
  });
  it("matches employee + date", () => {
    const h = [
      mkTax({ id: "a", effective_from: "2026-01-01", effective_to: "2026-03-31" }),
      mkTax({ id: "b", effective_from: "2026-04-01", effective_to: null }),
    ];
    expect(getCurrentTaxDeductions(h, "emp1", "2026-04-15")?.id).toBe("b");
    expect(getCurrentTaxDeductions(h, "emp1", "2026-02-15")?.id).toBe("a");
  });
});
