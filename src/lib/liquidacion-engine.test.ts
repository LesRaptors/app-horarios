import { describe, it, expect } from "vitest";
import { days360, suggestVacationDays } from "./liquidacion-engine";

describe("days360 (convención 360 días)", () => {
  it("un año completo (1-ene a 1-ene siguiente) = 360", () => {
    expect(days360("2026-01-01", "2027-01-01")).toBe(360);
  });
  it("medio año (1-ene a 1-jul) = 180", () => {
    expect(days360("2026-01-01", "2026-07-01")).toBe(180);
  });
  it("un trimestre (1-ene a 1-abr) = 90", () => {
    expect(days360("2026-01-01", "2026-04-01")).toBe(90);
  });
  it("misma fecha = 0", () => {
    expect(days360("2026-06-15", "2026-06-15")).toBe(0);
  });
});

describe("suggestVacationDays (15 días hábiles/año proporcional)", () => {
  it("1 año completo → 15 días", () => {
    expect(suggestVacationDays("2025-04-01", "2026-04-01")).toBe(15);
  });
  it("medio año → 7.5 días", () => {
    expect(suggestVacationDays("2026-01-01", "2026-07-01")).toBe(7.5);
  });
  it("cutoff = terminación → 0 días", () => {
    expect(suggestVacationDays("2026-06-15", "2026-06-15")).toBe(0);
  });
});
