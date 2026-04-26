import { describe, it, expect } from "vitest";
import { formatCOP, parseCOP, getCurrentSalary } from "./payroll-helpers";
import type { SalaryHistory } from "./types";

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
