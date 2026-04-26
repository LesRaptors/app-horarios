import { describe, it, expect } from "vitest";
import { isIncomeForConcept, getSolidarityRate } from "./payroll-engine-helpers";

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
