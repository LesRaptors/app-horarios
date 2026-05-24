import { describe, it, expect } from "vitest";
import { calculateNextPeriodEnd, calculateIva, calculateTotalWithIva, isOverEmployeeLimit, shouldPauseAfterGrace, copToCents } from "./engine";

describe("calculateNextPeriodEnd", () => {
  it("suma 1 mes calendario", () => {
    const r = calculateNextPeriodEnd(new Date("2026-05-24T15:00:00Z"));
    expect(r.toISOString()).toBe("2026-06-24T15:00:00.000Z");
  });
  it("31 ene → marzo (overflow JS Date)", () => {
    const r = calculateNextPeriodEnd(new Date("2026-01-31T15:00:00Z"));
    expect(r.getUTCMonth()).toBe(2);
  });
});

describe("calculateIva", () => {
  it("19% Col", () => expect(calculateIva(100000)).toBe(19000));
  it("redondea al peso entero", () => expect(calculateIva(99999)).toBe(19000));
});

describe("calculateTotalWithIva", () => {
  it("100k + 19% IVA = 119000", () => expect(calculateTotalWithIva(100000)).toBe(119000));
});

describe("isOverEmployeeLimit", () => {
  it("starter max=30 con 30 emp → false", () => {
    expect(isOverEmployeeLimit({ max_employees: 30 } as any, 30)).toBe(false);
  });
  it("starter max=30 con 31 emp → true", () => {
    expect(isOverEmployeeLimit({ max_employees: 30 } as any, 31)).toBe(true);
  });
  it("enterprise max=null → false (ilimitado)", () => {
    expect(isOverEmployeeLimit({ max_employees: null } as any, 999)).toBe(false);
  });
});

describe("shouldPauseAfterGrace", () => {
  it("T+8 → true (>7 días)", () => {
    const periodEnd = new Date("2026-05-17T00:00:00Z");
    const now = new Date("2026-05-25T00:00:00Z");
    expect(shouldPauseAfterGrace(periodEnd, now)).toBe(true);
  });
  it("T+6 → false (dentro del grace)", () => {
    const periodEnd = new Date("2026-05-19T00:00:00Z");
    const now = new Date("2026-05-25T00:00:00Z");
    expect(shouldPauseAfterGrace(periodEnd, now)).toBe(false);
  });
});

describe("copToCents", () => {
  it("multiplica por 100", () => expect(copToCents(99000)).toBe(9900000));
});
