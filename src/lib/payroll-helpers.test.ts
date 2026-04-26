import { describe, it, expect } from "vitest";
import { formatCOP, parseCOP } from "./payroll-helpers";

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
