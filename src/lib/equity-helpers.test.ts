import { describe, it, expect } from "vitest";
import {
  getQuarter,
  getQuarterRange,
  getRollingWindow,
  sumRollupField,
  isHoliday,
  isNightShift,
  suggestIsNight,
  dayOfWeek,
  daysBetween,
  meanStdDev,
} from "./equity-helpers";
import type { EmployeeEquityRollup, HolidayDate, ShiftTemplate } from "./types";

describe("getQuarter", () => {
  it.each([
    [1, 1], [2, 1], [3, 1],
    [4, 2], [5, 2], [6, 2],
    [7, 3], [8, 3], [9, 3],
    [10, 4], [11, 4], [12, 4],
  ])("month %i → Q%i", (month, expected) => {
    expect(getQuarter(2026, month)).toBe(expected);
  });
});

describe("getQuarterRange", () => {
  it("April 15 2026 → Q2 = [4,5,6]", () => {
    expect(getQuarterRange("2026-04-15")).toEqual({ year: 2026, months: [4, 5, 6] });
  });

  it("December 31 2026 → Q4 = [10,11,12]", () => {
    expect(getQuarterRange("2026-12-31")).toEqual({ year: 2026, months: [10, 11, 12] });
  });

  it("January 1 2026 → Q1 = [1,2,3]", () => {
    expect(getQuarterRange("2026-01-01")).toEqual({ year: 2026, months: [1, 2, 3] });
  });
});

describe("getRollingWindow", () => {
  it("3 months ending April 2026 → Feb-Mar-Apr 2026", () => {
    expect(getRollingWindow(2026, 4, 3)).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]);
  });

  it("handles year boundary: 3 months ending Jan 2026 → Nov 2025 - Jan 2026", () => {
    expect(getRollingWindow(2026, 1, 3)).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });
});

describe("sumRollupField", () => {
  const rollups: EmployeeEquityRollup[] = [
    { employee_id: "e1", year: 2026, month: 2, sundays_worked: 1, saturdays_worked: 2, nights_worked: 0, holidays_worked: 0, total_hours: 80, updated_at: "" },
    { employee_id: "e1", year: 2026, month: 3, sundays_worked: 2, saturdays_worked: 3, nights_worked: 0, holidays_worked: 0, total_hours: 160, updated_at: "" },
    { employee_id: "e1", year: 2026, month: 4, sundays_worked: 1, saturdays_worked: 2, nights_worked: 0, holidays_worked: 0, total_hours: 160, updated_at: "" },
    { employee_id: "e2", year: 2026, month: 4, sundays_worked: 3, saturdays_worked: 0, nights_worked: 5, holidays_worked: 1, total_hours: 40, updated_at: "" },
  ];

  it("sums sundays_worked across 3-month window for e1", () => {
    const window = [{ year: 2026, month: 2 }, { year: 2026, month: 3 }, { year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e1", window, "sundays_worked")).toBe(4);
  });

  it("returns 0 for employee not in rollups", () => {
    const window = [{ year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e99", window, "sundays_worked")).toBe(0);
  });

  it("does not include other employees' data", () => {
    const window = [{ year: 2026, month: 4 }];
    expect(sumRollupField(rollups, "e1", window, "sundays_worked")).toBe(1);
  });
});

describe("isHoliday", () => {
  const holidays: HolidayDate[] = [
    { id: "h1", date: "2026-01-01", name: "Año Nuevo", location_id: null, created_at: "" },
    { id: "h2", date: "2026-03-19", name: "Día municipal", location_id: "loc-A", created_at: "" },
  ];

  it("national holiday matches any location", () => {
    expect(isHoliday("2026-01-01", "loc-A", holidays)).toBe(true);
    expect(isHoliday("2026-01-01", "loc-B", holidays)).toBe(true);
  });

  it("sede-specific holiday matches only that location", () => {
    expect(isHoliday("2026-03-19", "loc-A", holidays)).toBe(true);
    expect(isHoliday("2026-03-19", "loc-B", holidays)).toBe(false);
  });

  it("regular date is not a holiday", () => {
    expect(isHoliday("2026-06-15", "loc-A", holidays)).toBe(false);
  });
});

describe("suggestIsNight", () => {
  it.each<[string, string, boolean]>([
    ["22:00", "06:00", true],
    ["09:00", "18:00", false],
    ["14:00", "22:00", false],
    ["20:00", "04:00", true],
    ["04:00", "12:00", true],
    ["06:00", "14:00", false],
    ["21:00", "05:00", true],
  ])("%s–%s → is_night=%s", (start, end, expected) => {
    expect(suggestIsNight(start, end)).toBe(expected);
  });
});

describe("isNightShift", () => {
  it("reads template.is_night directly", () => {
    const t: ShiftTemplate = {
      id: "t1", name: "X", start_time: "09:00", end_time: "18:00",
      break_minutes: 0, color: "#000", location_id: "l1",
      is_night: true, created_at: "",
    };
    expect(isNightShift(t)).toBe(true);
    expect(isNightShift({ ...t, is_night: false })).toBe(false);
  });
});

describe("dayOfWeek", () => {
  it("returns JS day-of-week (0=Sunday)", () => {
    expect(dayOfWeek("2026-04-05")).toBe(0);
    expect(dayOfWeek("2026-04-06")).toBe(1);
    expect(dayOfWeek("2026-04-11")).toBe(6);
  });
});

describe("daysBetween", () => {
  it("returns positive integer days", () => {
    expect(daysBetween("2026-04-01", "2026-04-05")).toBe(4);
    expect(daysBetween("2026-04-05", "2026-04-01")).toBe(-4);
    expect(daysBetween("2026-04-05", "2026-04-05")).toBe(0);
  });
});

describe("meanStdDev", () => {
  it("empty array → mean=0, stdDev=0", () => {
    expect(meanStdDev([])).toEqual({ mean: 0, stdDev: 0 });
  });

  it("single value → mean=value, stdDev=0", () => {
    expect(meanStdDev([5])).toEqual({ mean: 5, stdDev: 0 });
  });

  it("uniform values → stdDev=0", () => {
    expect(meanStdDev([3, 3, 3, 3])).toEqual({ mean: 3, stdDev: 0 });
  });

  it("[2,4,4,4,5,5,7,9] → mean=5, stdDev=2 (population)", () => {
    const r = meanStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBe(5);
    expect(r.stdDev).toBe(2);
  });
});
