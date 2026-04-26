import { describe, it, expect } from "vitest";
import { isIncomeForConcept } from "./payroll-engine-helpers";

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
