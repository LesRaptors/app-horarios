import { describe, it, expect } from "vitest";
import { generateSchedule } from "./schedule-generator";
import type {
  AutoGenConfig, ProfileWithPositions, ShiftTemplate, ScheduleEntry,
  LaborConstraints, EmployeeEquityRollup, HolidayDate, ContractType, ScoringWeights,
} from "./types";

const defaultConstraints: LaborConstraints = {
  maxHoursPerWeek: 40, maxHoursPerDay: 10,
  minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6,
};

const defaultWeights: ScoringWeights = {
  sunday_penalty: 20, saturday_penalty: 15, night_penalty: 12, holiday_penalty: 18,
  block_continuation_bonus: 15, fragmentation_penalty: 25, clean_restart_bonus: 5,
  position_primary_bonus: 100, position_secondary_bonus: 30,
  hour_deficit_multiplier: 10, shift_deficit_multiplier: 5,
};

const fullTime: ContractType = {
  id: "ct-full", name: "Full-time", description: null,
  max_sundays_per_quarter: 6, max_holidays_per_quarter: 3,
  target_saturdays_per_month: 2, target_nights_per_month: 4, target_hours_per_week: 40,
  max_hours_per_day: null, max_hours_per_week: null,
  weekly_hours_mode: "full", weekly_hours: null, is_healthcare: false,
  available_sundays: true, available_holidays: true, available_nights: true,
  created_at: "", updated_at: "",
};

function makeEmployee(overrides: Partial<ProfileWithPositions> = {}): ProfileWithPositions {
  return {
    id: "e1", first_name: "T", last_name: "U", email: "t@t.com", phone: null,
    role: "employee", position_id: "pos-1", location_id: "loc-1",
    max_hours_per_week: 40, is_active: true, is_demo: false, is_floater: false,
    contract_type_id: "ct-full", created_at: "", updated_at: "",
    secondary_positions: [],
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id: "tpl-morn", name: "Morning",
    start_time: "09:00:00", end_time: "17:00:00",
    break_minutes: 0, color: "#000", location_id: "loc-1",
    is_night: false, created_at: "",
    ...overrides,
  };
}

// Build an excludeDates array covering all of April 2026 EXCEPT the given date.
function excludeAllExcept(targetDate: string): string[] {
  const result: string[] = [];
  for (let i = 1; i <= 30; i++) {
    const d = `2026-04-${String(i).padStart(2, "0")}`;
    if (d !== targetDate) result.push(d);
  }
  return result;
}

function baseConfig(overrides: Partial<AutoGenConfig> = {}): AutoGenConfig {
  return {
    scheduleId: "sch-1", locationId: "loc-1",
    month: 3, year: 2026, // April 2026 (month 0-indexed)
    shiftTemplateIds: ["tpl-morn"],
    positionIds: ["pos-1"], excludeDates: [],
    employeeIds: ["e1", "e2", "e3"],
    useDemandRequirements: false,
    ...overrides,
  };
}

describe("generateSchedule — empty history", () => {
  it("picks a candidate for a Sunday slot, no overtime", () => {
    const employees = [
      makeEmployee({ id: "e1" }),
      makeEmployee({ id: "e2" }),
      makeEmployee({ id: "e3" }),
    ];
    const config = baseConfig({ excludeDates: excludeAllExcept("2026-04-05") /* Sunday */ });

    const result = generateSchedule(
      config, employees, [makeTemplate()], [], [],
      defaultConstraints, [], [], [], [fullTime], defaultWeights,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].overtime_status).toBe("none");
    expect(result.entries[0].exceeds_caps).toEqual([]);
  });
});

describe("generateSchedule — sunday cap removed (equity via scoring)", () => {
  it("empleado con available_sundays=true y muchos domingos previos igual puede recibir domingo", () => {
    // Post-034: no hay cap trimestral. El scoring penaliza según rolling rollups (equidad).
    // Con available_sundays=true, el empleado puede trabajar domingos sin límite duro.
    const employees = [makeEmployee({ id: "e1" })];
    // e1 ya hizo 6 domingos — scoring lo penaliza pero no lo bloquea
    const rollups: EmployeeEquityRollup[] = [
      { employee_id: "e1", year: 2026, month: 4,
        sundays_worked: 6, saturdays_worked: 0, nights_worked: 0,
        holidays_worked: 0, total_hours: 0, updated_at: "" },
    ];
    const config = baseConfig({
      employeeIds: ["e1"],
      excludeDates: excludeAllExcept("2026-04-12") /* Sunday */,
    });

    const result = generateSchedule(
      config, employees, [makeTemplate()], [], [],
      defaultConstraints, [], rollups, [], [fullTime], defaultWeights,
    );

    // Asigna normalmente (único candidato, disponible)
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].overtime_status).toBe("none");
    expect(result.entries[0].exceeds_caps).toEqual([]);
  });
});

describe("generateSchedule — block packing", () => {
  it("prefers continuing a work block (gap 1) over fragmenting (gap 2)", () => {
    const employees = [makeEmployee({ id: "e1" }), makeEmployee({ id: "e2" })];
    // e1 worked yesterday (2026-04-06), e2 worked 2 days ago (2026-04-05)
    // Slot today is 2026-04-07 — e1 should win via continuation bonus
    const existing: ScheduleEntry[] = [
      { id: "x1", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-06", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
      { id: "x2", schedule_id: "sch-1", employee_id: "e2", position_id: "pos-1",
        date: "2026-04-05", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
    ];
    const config = baseConfig({
      employeeIds: ["e1", "e2"],
      excludeDates: excludeAllExcept("2026-04-07"),
    });

    const result = generateSchedule(
      config, employees, [makeTemplate()], existing, [],
      defaultConstraints, [], [], [], [fullTime], defaultWeights,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].employee_id).toBe("e1");
  });
});

describe("generateSchedule — tie-breaker by totalShifts", () => {
  it("when scores tie, prefers the employee with fewer existing shifts", () => {
    const employees = [makeEmployee({ id: "e1" }), makeEmployee({ id: "e2" })];

    // e1 already has 3 shifts in the month; e2 has 1. Both otherwise identical.
    const existing: ScheduleEntry[] = [
      { id: "x1", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-01", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
      { id: "x2", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-02", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
      { id: "x3", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-03", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
      { id: "x4", schedule_id: "sch-1", employee_id: "e2", position_id: "pos-1",
        date: "2026-04-04", start_time: "09:00:00", end_time: "17:00:00",
        shift_template_id: "tpl-morn", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
    ];
    // Slot on 2026-04-15 (far from existing to avoid block bonus/fragmentation)
    const config = baseConfig({
      employeeIds: ["e1", "e2"],
      excludeDates: excludeAllExcept("2026-04-15"),
    });

    const result = generateSchedule(
      config, employees, [makeTemplate()], existing, [],
      defaultConstraints, [], [], [], [fullTime], defaultWeights,
    );

    expect(result.entries).toHaveLength(1);
    // e2 has fewer prior shifts → wins the tie-breaker
    expect(result.entries[0].employee_id).toBe("e2");
  });
});

describe("generateSchedule — 24h rest after night", () => {
  it("rejects candidate who worked a night shift <24h before this slot", () => {
    const employees = [makeEmployee({ id: "e1" })];
    const morning = makeTemplate({ id: "tpl-morn", is_night: false });
    const night = makeTemplate({
      id: "tpl-night", name: "Night",
      start_time: "22:00:00", end_time: "06:00:00", is_night: true,
    });
    // e1 worked night ending 06:00 on 2026-04-07; trying 09:00 same day — only 3h rest
    const existing: ScheduleEntry[] = [
      { id: "n1", schedule_id: "sch-1", employee_id: "e1", position_id: "pos-1",
        date: "2026-04-06", start_time: "22:00:00", end_time: "06:00:00",
        shift_template_id: "tpl-night", notes: null,
        exceeds_caps: [], overtime_status: "none",
        overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
        created_at: "", updated_at: "" },
    ];
    const config = baseConfig({
      employeeIds: ["e1"],
      excludeDates: excludeAllExcept("2026-04-07"),
    });

    const result = generateSchedule(
      config, employees, [morning, night], existing, [],
      defaultConstraints, [], [], [], [fullTime], defaultWeights,
    );

    expect(result.entries).toHaveLength(0);
    expect(result.warnings.some((w) => w.kind === "no_safe_candidate")).toBe(true);
  });
});

describe("consecutive_days inviolable", () => {
  it("no asigna al empleado con 6 días consecutivos un séptimo día — emite coverage_gap", () => {
    const emp = makeEmployee({ id: "e1" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // Existing entries: 6 días consecutivos previos (lun-sáb, semana ISO 14)
    const existingEntries: ScheduleEntry[] = [
      "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "sched-1", employee_id: "e1", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none" as const,
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));

    // Demand: domingo 5 abril (día consecutivo #7)
    const result = generateSchedule(
      {
        scheduleId: "sched-1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true,
      },
      [emp], [tpl], existingEntries, [],
      { ...defaultConstraints, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 0, required_count: 1, created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    // No se asigna; queda como coverage_gap warning
    expect(result.entries.find((e) => e.date === "2026-04-05")).toBeUndefined();
    const gap = result.warnings.find((w) => w.kind === "coverage_gap" && w.date === "2026-04-05");
    expect(gap).toBeDefined();
  });
});

describe("score penaliza saturación", () => {
  it("prefiere empleado con holgura sobre uno al 90% de horas semana", () => {
    const fresh = makeEmployee({ id: "e-fresh" });
    const saturated = makeEmployee({ id: "e-sat" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // saturated tiene 5 turnos × 8h = 40h ya en la semana del 6 abril (lunes)
    // (ISO week 15 = lun 6 abr - dom 12 abr)
    const existingEntries: ScheduleEntry[] = [
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "sched-1", employee_id: "e-sat", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none" as const,
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));
    // contract.target_hours_per_week = 40 → ya está al 100% (saturado)

    // Demand: sábado 11 abr — los 2 elegibles, pero uno está saturado
    const result = generateSchedule(
      {
        scheduleId: "sched-1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e-fresh", "e-sat"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true,
      },
      [fresh, saturated], [tpl], existingEntries, [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
         day_of_week: 6, required_count: 1, created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const sat11 = result.entries.find((e) => e.date === "2026-04-11");
    expect(sat11?.employee_id).toBe("e-fresh");
  });
});

describe("contract caps overriden global", () => {
  it("empleado con contract.max_hours_per_day=12 puede recibir un turno de 11h", () => {
    const asistencial: ContractType = {
      ...fullTime, id: "ct-asist", name: "Asistencial",
      max_hours_per_day: 12, max_hours_per_week: 48,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-asist" });
    const tpl = makeTemplate({
      id: "tpl-12h", name: "12h", start_time: "07:00", end_time: "19:00",
    });

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-12h"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      { maxHoursPerWeek: 40, maxHoursPerDay: 10,
        minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-12h", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [asistencial], defaultWeights,
    );

    expect(result.entries.length).toBeGreaterThan(0);
  });
});

describe("contract availability flags", () => {
  it("empleado con available_sundays=false NO recibe domingo", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-no-sun", available_sundays: false,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-no-sun" });
    const tpl = makeTemplate({ id: "tpl-m" });

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      // Demand: domingo 5 abr
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 0, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [ct], defaultWeights,
    );

    expect(result.entries.find((e) => e.date === "2026-04-05")).toBeUndefined();
  });

  it("contract.is_healthcare=true permite turnos de hasta 12h", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-hc", is_healthcare: true,
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-hc" });
    const tpl = makeTemplate({
      id: "tpl-12h", name: "12h", start_time: "07:00", end_time: "19:00",
    });

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-12h"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      // Global: 10h/día. Pero is_healthcare lo eleva a 12.
      { maxHoursPerWeek: 48, maxHoursPerDay: 10,
        minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6 },
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-12h", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [ct], defaultWeights,
    );

    expect(result.entries.length).toBeGreaterThan(0);
  });
});
