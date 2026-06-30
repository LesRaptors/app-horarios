import { describe, it, expect } from "vitest";
import { generateSchedule } from "./schedule-generator";
import type {
  AutoGenConfig, ProfileWithPositions, ScheduleEntry,
  LaborConstraints, EmployeeEquityRollup, HolidayDate, ContractType, ScoringWeights,
  RestRule, EmployeeRestRule, StaffingRequirement,
} from "./types";
import { makeTemplate } from "./test-utils/make-template";

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
    organization_id: null, contract_type_id: "ct-full", created_at: "", updated_at: "",
    secondary_positions: [],
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

describe("supernumerario (floater)", () => {
  it("floater no se usa si hay primario disponible", () => {
    const primary = makeEmployee({ id: "e-pri", position_id: "pos-1", is_floater: false });
    const floater = makeEmployee({
      id: "e-flo",
      position_id: "pos-other",
      is_floater: true,
      secondary_positions: [{ id: "sp-1", employee_id: "e-flo", position_id: "pos-1", created_at: "" }],
    });
    const tpl = makeTemplate({ id: "tpl-m" });

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e-pri", "e-flo"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [primary, floater], [tpl], [], [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 1, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const assigned = result.entries[0];
    expect(assigned?.employee_id).toBe("e-pri");
  });

  it("floater gana al primario en Pase 1 cuando primario tiene déficit menor (equidad)", () => {
    const primary = makeEmployee({ id: "e-pri", position_id: "pos-1" });
    const floater = makeEmployee({
      id: "e-flo",
      position_id: "pos-other",
      is_floater: true,
      secondary_positions: [{ id: "sp-1", employee_id: "e-flo", position_id: "pos-1", created_at: "" }],
    });
    const tpl = makeTemplate({ id: "tpl-m" });

    // Primario ya tiene 4 turnos (32h) en abril; floater 0.
    // Con hour_deficit_multiplier=10 y diferencia de 32h, el floater gana ~250 ptos
    // a pesar del position_primary_bonus (+100 vs +30) que favorece al primario.
    const existingEntries: ScheduleEntry[] = [
      "2026-04-01", "2026-04-02", "2026-04-08", "2026-04-09",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "s1", employee_id: "e-pri", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none" as const,
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));

    // Demand: lun 13 abril (gap >= 3 desde último turno del primario, sin block bonus).
    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e-pri", "e-flo"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: excludeAllExcept("2026-04-13"),
        useDemandRequirements: false },
      [primary, floater], [tpl], existingEntries, [],
      defaultConstraints, [], [], [], [fullTime], defaultWeights,
    );

    const assigned = result.entries.find((e) => e.date === "2026-04-13");
    expect(assigned?.employee_id).toBe("e-flo");
  });

  it("floater se usa cuando primario está en cap inviolable", () => {
    const primary = makeEmployee({ id: "e-pri", position_id: "pos-1" });
    const floater = makeEmployee({
      id: "e-flo",
      position_id: "pos-other",
      is_floater: true,
      secondary_positions: [{ id: "sp-1", employee_id: "e-flo", position_id: "pos-1", created_at: "" }],
    });
    const tpl = makeTemplate({ id: "tpl-m" });

    // Primario con 6 días consecutivos previos (lun-sáb 30 mar - 4 abr).
    const existingEntries: ScheduleEntry[] = [
      "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    ].map((date, i) => ({
      id: `pre-${i}`, schedule_id: "s1", employee_id: "e-pri", position_id: "pos-1",
      date, start_time: "09:00", end_time: "17:00", shift_template_id: "tpl-m",
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none" as const,
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    }));

    // Demand: domingo 5 abril (día 7 consecutivo para primary → cap inviolable).
    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e-pri", "e-flo"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [primary, floater], [tpl], existingEntries, [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 0, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [fullTime], defaultWeights,
    );

    const assigned = result.entries.find((e) => e.date === "2026-04-05");
    expect(assigned?.employee_id).toBe("e-flo");
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

describe("override de disponibilidad por empleado", () => {
  it("available_holidays=false a nivel empleado impide festivo aunque el contrato lo permita", () => {
    // fullTime tiene available_holidays=true; el override del empleado (false) debe ganar.
    const emp = makeEmployee({ id: "e1", available_holidays: false });
    const tpl = makeTemplate({ id: "tpl-m" });
    // 2026-04-09 es jueves (day_of_week=4) y se marca como festivo.
    const holidays: HolidayDate[] = [
      { id: "h1", date: "2026-04-09", name: "Test", location_id: null, created_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      // Demand: jueves (day_of_week=4) — cubre el festivo 2026-04-09.
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 4, required_count: 1,
         created_at: "", updated_at: "" }],
      [], holidays, [fullTime], defaultWeights,
    );

    // El override del empleado gana: no se asigna en el festivo.
    const onHoliday = result.entries.filter(
      (e) => e.employee_id === "e1" && e.date === "2026-04-09",
    );
    expect(onHoliday.length).toBe(0);
    // Pero sí debe haber entradas en los otros jueves del mes (2, 16, 23 abr).
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("available_holidays=true en empleado gana sobre contrato con false (dirección inversa)", () => {
    // Contrato con available_holidays=false; el override true del empleado debe ganar.
    const ctNoHoliday: ContractType = { ...fullTime, id: "ct-no-holiday", available_holidays: false };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-no-holiday", available_holidays: true });
    const tpl = makeTemplate({ id: "tpl-m" });
    // 2026-04-09 es jueves (day_of_week=4) y se marca como festivo.
    const holidays: HolidayDate[] = [
      { id: "h1", date: "2026-04-09", name: "Test", location_id: null, created_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 4, required_count: 1,
         created_at: "", updated_at: "" }],
      [], holidays, [ctNoHoliday], defaultWeights,
    );

    // El override true del empleado gana: SÍ debe asignarse en el festivo.
    const onHoliday = result.entries.find(
      (e) => e.employee_id === "e1" && e.date === "2026-04-09",
    );
    expect(onHoliday).toBeDefined();
  });

  it("available_holidays=null (hereda contrato) — contrato false impide festivo", () => {
    // Empleado sin override (null) hereda del contrato. Contrato tiene available_holidays=false.
    const ctNoHoliday: ContractType = { ...fullTime, id: "ct-no-holiday-2", available_holidays: false };
    // available_holidays no seteado en el empleado -> undefined -> cae al contrato via ??
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-no-holiday-2", available_holidays: null });
    const tpl = makeTemplate({ id: "tpl-m" });
    const holidays: HolidayDate[] = [
      { id: "h1", date: "2026-04-09", name: "Test", location_id: null, created_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 4, required_count: 1,
         created_at: "", updated_at: "" }],
      [], holidays, [ctNoHoliday], defaultWeights,
    );

    // Hereda false del contrato: no se asigna en el festivo.
    const onHoliday = result.entries.find(
      (e) => e.employee_id === "e1" && e.date === "2026-04-09",
    );
    expect(onHoliday).toBeUndefined();
    // Sí debe haber entradas en los otros jueves del mes.
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("available_sundays=true en empleado gana sobre contrato con false", () => {
    // Contrato prohíbe domingos; el override true del empleado lo permite.
    const ctNoSun: ContractType = { ...fullTime, id: "ct-no-sun-2", available_sundays: false };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-no-sun-2", available_sundays: true });
    const tpl = makeTemplate({ id: "tpl-m" });
    // 2026-04-05 es domingo (day_of_week=0).

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: excludeAllExcept("2026-04-05"),
        useDemandRequirements: false },
      [emp], [tpl], [], [],
      defaultConstraints, [], [], [], [ctNoSun], defaultWeights,
    );

    // El override true del empleado gana: SÍ debe asignarse el domingo.
    const onSunday = result.entries.find(
      (e) => e.employee_id === "e1" && e.date === "2026-04-05",
    );
    expect(onSunday).toBeDefined();
  });
});

describe("rest rules en motor", () => {
  it("contract con work_cycle 4x3 descarta dias de descanso", () => {
    const ct: ContractType = {
      ...fullTime, id: "ct-cycle",
    };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-cycle" });
    const tpl = makeTemplate({ id: "tpl-m" });

    const restRules: RestRule[] = [{
      id: "r1", contract_type_id: "ct-cycle",
      rule_type: "work_cycle",
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-04-06" },
      created_at: "", updated_at: "",
    }];

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      // Demand: lun 6 (trabajo) + vie 10 (descanso por ciclo)
      [
        { id: "sr-1", location_id: "loc-1", position_id: "pos-1",
          shift_template_id: "tpl-m", day_of_week: 1, required_count: 1,
          created_at: "", updated_at: "" },
        { id: "sr-2", location_id: "loc-1", position_id: "pos-1",
          shift_template_id: "tpl-m", day_of_week: 5, required_count: 1,
          created_at: "", updated_at: "" },
      ],
      [], [], [ct], defaultWeights,
      restRules,
    );

    // Lunes 6 abr (trabajo) -> asignado.
    expect(result.entries.find((e) => e.date === "2026-04-06")).toBeDefined();
    // Viernes 10 abr (descanso por ciclo 4x3) -> no asignado.
    expect(result.entries.find((e) => e.date === "2026-04-10")).toBeUndefined();
  });
});

describe("reglas de descanso por empleado (override)", () => {
  it("dos empleados con misma contract pero distinto offset descansan en findes opuestos", () => {
    const ct: ContractType = { ...fullTime, id: "ct-rot" };
    const e1 = makeEmployee({ id: "e1", contract_type_id: "ct-rot" });
    const e2 = makeEmployee({ id: "e2", contract_type_id: "ct-rot" });
    const tpl = makeTemplate({ id: "tpl-m" });

    // e1 offset 0: bloquea findes en semanas con (week % 2 === 0) → ISO 18 (par)
    // e2 offset 1: bloquea findes en semanas con (week % 2 === 1) → ISO 19 (impar)
    const employeeRules: EmployeeRestRule[] = [
      { id: "er1", employee_id: "e1", rule_type: "weekend_rotation",
        params: { every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true },
        created_at: "", updated_at: "" },
      { id: "er2", employee_id: "e2", rule_type: "weekend_rotation",
        params: { every_n_weeks: 2, offset: 1, include_saturday: true, include_sunday: true },
        created_at: "", updated_at: "" },
    ];

    // Demand: 2 sábados consecutivos
    // sáb 2 may = ISO week 18 (par) → e1 bloqueado
    // sáb 9 may = ISO week 19 (impar) → e2 bloqueado
    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 4,
        employeeIds: ["e1", "e2"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [e1, e2], [tpl], [], [],
      defaultConstraints,
      [
        { id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
          day_of_week: 6, required_count: 1, created_at: "", updated_at: "" },
      ],
      [], [], [ct], defaultWeights,
      [], // contract rest rules vacíos
      employeeRules,
    );

    const may2 = result.entries.find((en) => en.date === "2026-05-02");
    expect(may2?.employee_id).toBe("e2");
    const may9 = result.entries.find((en) => en.date === "2026-05-09");
    expect(may9?.employee_id).toBe("e1");
  });

  it("empleado sin reglas individuales hace fallback al contract", () => {
    const ct: ContractType = { ...fullTime, id: "ct-cycle-fb" };
    const emp = makeEmployee({ id: "e1", contract_type_id: "ct-cycle-fb" });
    const tpl = makeTemplate({ id: "tpl-m" });

    const contractRules: RestRule[] = [{
      id: "r1", contract_type_id: "ct-cycle-fb", rule_type: "work_cycle",
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-04-06" },
      created_at: "", updated_at: "",
    }];

    const result = generateSchedule(
      { scheduleId: "s1", locationId: "loc-1", year: 2026, month: 3,
        employeeIds: ["e1"], shiftTemplateIds: ["tpl-m"],
        positionIds: ["pos-1"], excludeDates: [], useDemandRequirements: true },
      [emp], [tpl], [], [],
      defaultConstraints,
      [{ id: "sr-1", location_id: "loc-1", position_id: "pos-1",
         shift_template_id: "tpl-m", day_of_week: 5, required_count: 1,
         created_at: "", updated_at: "" }],
      [], [], [ct], defaultWeights,
      contractRules,
      [], // employeeRestRules vacío → fallback a contractRules
    );

    // Vie 10 abr: descanso por ciclo 4x3 (sigue aplicando vía fallback)
    expect(result.entries.find((en) => en.date === "2026-04-10")).toBeUndefined();
  });
});

describe("demanda de festivos", () => {
  it("posición con perfil de festivo usa el turno de festivo en un festivo y NO el de día de semana", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({ id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    // Demanda: día de semana (jueves=4) turno normal req 1; festivo turno festivo req 1.
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm", "tpl-fest"], positionIds: ["pos-1"],
        excludeDates: [], employeeIds: ["e1"], useDemandRequirements: true },
      [emp], [tplNormal, tplFest], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );

    const onHoliday = result.entries.filter((e) => e.date === "2026-04-09");
    expect(onHoliday.length).toBe(1);
    expect(onHoliday[0].start_time).toBe("09:00:00"); // turno de festivo, no el normal 08:00
  });

  it("perfil de festivo con required_count=0 para un turno no genera slots de ese turno", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tplZero = makeTemplate({ id: "tpl-fz", start_time: "06:00:00", end_time: "10:00:00" });
    const tplActive = makeTemplate({ id: "tpl-fa", start_time: "09:00:00", end_time: "13:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    // Perfil de festivo: tpl-fz con req 0 (no debe generar slots) + tpl-fa con req 1
    // (la posición tiene perfil porque ≥1 fila is_holiday=true existe).
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fz",
        day_of_week: 0, required_count: 0, is_holiday: true, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fa",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-fz", "tpl-fa"], positionIds: ["pos-1"],
        excludeDates: [], employeeIds: ["e1"], useDemandRequirements: true },
      [emp], [tplZero, tplActive], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );

    const onHoliday = result.entries.filter((e) => e.date === "2026-04-09");
    // El turno con count 0 no genera slots; sólo el turno activo (req 1) se asigna.
    expect(onHoliday).toHaveLength(1);
    expect(onHoliday[0].shift_template_id).toBe("tpl-fa");
    expect(onHoliday.some((e) => e.shift_template_id === "tpl-fz")).toBe(false);
  });

  it("posición SIN perfil de festivo se comporta como día de semana en un festivo (retrocompat)", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    // Sólo demanda de día de semana (jueves=4); ninguna fila is_holiday → posición sin perfil.
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
    ];

    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [emp], [tplNormal], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );

    const onHoliday = result.entries.filter((e) => e.date === "2026-04-09");
    // Sin perfil de festivo, el festivo usa la demanda del jueves (retrocompat).
    expect(onHoliday).toHaveLength(1);
    expect(onHoliday[0].start_time).toBe("08:00:00");
  });

  it("auto-incluye el turno del perfil de festivo aunque NO esté en shiftTemplateIds", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({ id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];

    // El turno de festivo (tpl-fest) NO está en shiftTemplateIds. El perfil de festivo
    // es la fuente de verdad: en el festivo, su turno debe auto-incluirse igual.
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [emp], [tplNormal, tplFest], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );

    const onHoliday = result.entries.filter((e) => e.date === "2026-04-09");
    expect(onHoliday).toHaveLength(1);
    expect(onHoliday[0].shift_template_id).toBe("tpl-fest");
    expect(onHoliday[0].start_time).toBe("09:00:00");
  });

  it("fecha NO festiva ignora el perfil de festivo y usa la demanda de día de semana", () => {
    const holidays: HolidayDate[] = [
      { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
    ];
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({ id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00" });
    const emp = makeEmployee({ id: "e1", position_id: "pos-1" });
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];

    // Jueves 2026-04-02 NO es festivo (el festivo es el 09).
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm", "tpl-fest"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-02"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [emp], [tplNormal, tplFest], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );

    const onDay = result.entries.filter((e) => e.date === "2026-04-02");
    // Día normal: usa el turno de día de semana (08:00), NO el perfil de festivo.
    expect(onDay).toHaveLength(1);
    expect(onDay[0].shift_template_id).toBe("tpl-norm");
    expect(onDay[0].start_time).toBe("08:00:00");
  });
});

describe("horario de festivo del turno", () => {
  const holidays: HolidayDate[] = [
    { id: "h", date: "2026-04-09", name: "Jueves Santo", location_id: null, created_at: "" },
  ];
  // 2026-04-09 es jueves (day_of_week=4) y festivo.
  const weekdayReq = (tplId: string): StaffingRequirement[] => [
    { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: tplId,
      day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
  ];

  it("usa el horario de festivo cuando el turno cae en festivo (con demanda)", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00", break_minutes: 60,
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("10:00:00");
    expect(onHoliday?.end_time).toBe("15:00:00");
  });

  it("festivo sin horario de festivo configurado usa las horas normales", () => {
    const tpl = makeTemplate({ id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00" });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("08:00:00");
  });

  it("día NO festivo ignora el horario de festivo del turno", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    // 2026-04-02 es jueves pero NO festivo (el festivo es el 09).
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-02"), employeeIds: ["e1"],
        useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, weekdayReq("tpl-m"), [], holidays, [fullTime], defaultWeights,
    );
    const onDay = result.entries.find((e) => e.date === "2026-04-02");
    expect(onDay?.start_time).toBe("08:00:00");
  });

  it("perfil de festivo (Necesidades) + horario de festivo del turno se combinan", () => {
    const tplNormal = makeTemplate({ id: "tpl-norm", start_time: "08:00:00", end_time: "17:00:00" });
    const tplFest = makeTemplate({
      id: "tpl-fest", start_time: "09:00:00", end_time: "13:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "14:00:00", holiday_break_minutes: 0,
    });
    const reqs: StaffingRequirement[] = [
      { id: "r1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-norm",
        day_of_week: 4, required_count: 1, is_holiday: false, created_at: "", updated_at: "" },
      { id: "r2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-fest",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-norm", "tpl-fest"], positionIds: ["pos-1"],
        excludeDates: [], employeeIds: ["e1"], useDemandRequirements: true },
      [makeEmployee({ id: "e1" })], [tplNormal, tplFest], [], [],
      defaultConstraints, reqs, [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    // El perfil de festivo pide tpl-fest; como es festivo y tpl-fest tiene horario de festivo,
    // usa 10:00-14:00 en vez de su horario normal 09:00-13:00.
    expect(onHoliday?.shift_template_id).toBe("tpl-fest");
    expect(onHoliday?.start_time).toBe("10:00:00");
    expect(onHoliday?.end_time).toBe("14:00:00");
  });

  it("modo sin demanda: festivo usa el horario de festivo del turno", () => {
    const tpl = makeTemplate({
      id: "tpl-m", start_time: "08:00:00", end_time: "17:00:00",
      holiday_start_time: "10:00:00", holiday_end_time: "15:00:00", holiday_break_minutes: 0,
    });
    const result = generateSchedule(
      { scheduleId: "s", locationId: "loc-1", year: 2026, month: 3,
        shiftTemplateIds: ["tpl-m"], positionIds: ["pos-1"],
        excludeDates: excludeAllExcept("2026-04-09"), employeeIds: ["e1"],
        useDemandRequirements: false },
      [makeEmployee({ id: "e1" })], [tpl], [], [],
      defaultConstraints, [], [], holidays, [fullTime], defaultWeights,
    );
    const onHoliday = result.entries.find((e) => e.date === "2026-04-09");
    expect(onHoliday?.start_time).toBe("10:00:00");
  });
});
