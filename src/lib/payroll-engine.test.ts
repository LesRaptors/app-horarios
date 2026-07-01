import { describe, it, expect } from "vitest";
import {
  computeWorkedDays,
  computeBaseSalary,
  computeTransportAux,
  computeSurcharges,
  computeOvertime,
  computeAdjustments,
  computeIBC,
  computeEmployeeDeductions,
  computeProvisionsAndEmployerCost,
  computePayroll,
} from "./payroll-engine";
import type {
  PayrollComputeInput,
  WorkedDaysResult,
  ComputedEntry,
} from "./payroll-engine";
import type { PaymentMode } from "./types";
import type {
  Profile,
  SalaryHistory,
  PayrollSettings,
  AbsenceRecord,
  HolidayDate,
  ScheduleEntry,
  ShiftTemplate,
  SalaryAdjustment,
  TaxPersonalDeduction,
  PaymentFrequency,
} from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMMLV = 1_750_905;
const AUX_TRANSPORT = 249_095;

const baseProfile: Profile & {
  hire_date: string | null;
  termination_date: string | null;
  arl_risk_class: number | null;
} = {
  id: "emp1",
  first_name: "Ana",
  last_name: "García",
  email: "ana@test.com",
  phone: null,
  role: "employee",
  position_id: "pos1",
  location_id: "loc1",
  max_hours_per_week: 47,
  is_active: true,
  is_demo: false,
  is_floater: false,
  organization_id: "org1",
  contract_type_id: "ct1",
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  hire_date: null,
  termination_date: null,
  arl_risk_class: null,
};

const baseSettings: PayrollSettings = {
  id: "s1",
  period_start: "2026-01-01",
  period_end: null,
  smmlv: SMMLV,
  aux_transport: AUX_TRANSPORT,
  hourly_divisor: 220,
  night_start_hour: 21,
  sunday_surcharge_pct: 0.8,
  holiday_surcharge_pct: 0.8,
  uvt: 52374,
  updated_at: "2026-01-01T00:00:00Z",
};

const mkSalary = (overrides: Partial<SalaryHistory> = {}): SalaryHistory => ({
  id: "sal1",
  employee_id: "emp1",
  monthly_salary: 2_800_000,
  is_integral_salary: false,
  transport_aux_override: null,
  change_reason: null,
  effective_from: "2020-01-01",
  effective_to: null,
  created_by: null,
  created_at: "2020-01-01T00:00:00Z",
  ...overrides,
});

const mkAbsence = (overrides: Partial<AbsenceRecord>): AbsenceRecord => ({
  id: "abs1",
  employee_id: "emp1",
  start_date: "2026-03-10",
  end_date: "2026-03-14",
  type: "sick_eps",
  paid_pct: 0.6667,
  payer: "eps",
  notes: null,
  source_request_id: null,
  created_by: null,
  created_at: "2026-03-01T00:00:00Z",
  ...overrides,
});

function mkInput(overrides: Partial<PayrollComputeInput> = {}): PayrollComputeInput {
  return {
    employee: { ...baseProfile },
    period: { start: "2026-03-01", end: "2026-03-31", frequency: "mensual" as PaymentFrequency },
    salaryHistory: [mkSalary()],
    scheduleEntries: [],
    shiftTemplates: [],
    holidays: [],
    absences: [],
    adjustments: [],
    taxDeductions: null,
    settings: [baseSettings],
    ytdProvisionsBefore: { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stage 1 — computeWorkedDays
// ---------------------------------------------------------------------------

describe("computeWorkedDays", () => {
  it("full month, no absences → totalDays=30, paidByEmployer=30", () => {
    const result = computeWorkedDays(mkInput());
    expect(result.totalDays).toBe(30);
    expect(result.paidByEmployer).toBe(30);
    expect(result.paidByEps).toBe(0);
    expect(result.paidByArl).toBe(0);
    expect(result.unpaid).toBe(0);
  });

  it("hire_date=2026-03-24 → totalDays=8 (days 24-31)", () => {
    const input = mkInput({
      employee: { ...baseProfile, hire_date: "2026-03-24" },
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(8);
    expect(result.paidByEmployer).toBe(8);
  });

  it("termination_date=2026-03-14 → totalDays=14", () => {
    const input = mkInput({
      employee: { ...baseProfile, termination_date: "2026-03-14" },
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(14);
    expect(result.paidByEmployer).toBe(14);
  });

  it("5 days sick_eps (payer=eps) → paidByEmployer=25, paidByEps=5", () => {
    const input = mkInput({
      absences: [mkAbsence({ start_date: "2026-03-10", end_date: "2026-03-14", payer: "eps" })],
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(30);
    expect(result.paidByEps).toBe(5);
    expect(result.paidByEmployer).toBe(25);
  });

  it("3 days unpaid_leave (payer=none) → totalDays=27, paidByEmployer=27, unpaid=3", () => {
    const input = mkInput({
      absences: [mkAbsence({
        start_date: "2026-03-05",
        end_date: "2026-03-07",
        type: "unpaid_leave",
        payer: "none",
        paid_pct: 0,
      })],
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(27);
    expect(result.paidByEmployer).toBe(27);
    expect(result.unpaid).toBe(3);
  });

  it("31-day real month is normalised to max 30 convention days", () => {
    // March has 31 real days but convention = 30
    const result = computeWorkedDays(mkInput());
    expect(result.totalDays).toBeLessThanOrEqual(30);
  });

  it("quincenal period 1-15 → totalDays max 15", () => {
    const input = mkInput({
      period: { start: "2026-03-01", end: "2026-03-15", frequency: "quincenal" },
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(15);
    expect(result.paidByEmployer).toBe(15);
  });

  it("absence payer=arl → paidByArl tracked correctly", () => {
    const input = mkInput({
      absences: [mkAbsence({ start_date: "2026-03-05", end_date: "2026-03-07", type: "sick_arl", payer: "arl" })],
    });
    const result = computeWorkedDays(input);
    expect(result.paidByArl).toBe(3);
    expect(result.paidByEmployer).toBe(27);
    expect(result.totalDays).toBe(30);
  });

  it("hire_date before period start → full 30 days", () => {
    const input = mkInput({
      employee: { ...baseProfile, hire_date: "2025-01-01" },
    });
    const result = computeWorkedDays(input);
    expect(result.totalDays).toBe(30);
  });

  it("absence crossing period boundary counts only days within period", () => {
    // Absence starts Feb 26, ends Mar 5 — only 5 days fall in March
    const input = mkInput({
      absences: [mkAbsence({ start_date: "2026-02-26", end_date: "2026-03-05", payer: "eps" })],
    });
    const result = computeWorkedDays(input);
    expect(result.paidByEps).toBe(5); // Mar 1-5
    expect(result.paidByEmployer).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Stage 2 — computeBaseSalary
// ---------------------------------------------------------------------------

describe("computeBaseSalary", () => {
  it("$2.8M, 30 days → salary entry = $2.800.000", () => {
    const input = mkInput();
    const workedDays: WorkedDaysResult = { totalDays: 30, paidByEmployer: 30, paidByEps: 0, paidByArl: 0, unpaid: 0 };
    const { entries, errors } = computeBaseSalary(input, workedDays);
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].concept_type).toBe("salary");
    expect(entries[0].is_income).toBe(true);
    expect(entries[0].amount).toBe(2_800_000);
  });

  it("$2.8M, 8 days (hire mid-month) → salary prorated = $746.667", () => {
    const input = mkInput();
    const workedDays: WorkedDaysResult = { totalDays: 8, paidByEmployer: 8, paidByEps: 0, paidByArl: 0, unpaid: 0 };
    const { entries, errors } = computeBaseSalary(input, workedDays);
    expect(errors).toHaveLength(0);
    // 2_800_000 * 8 / 30 = 746666.67 → rounds to 746667
    expect(entries[0].amount).toBe(Math.round(2_800_000 * 8 / 30));
  });

  it("integral salary $30M, 30 days → amount=$30M, description includes 'integral'", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 30_000_000, is_integral_salary: true })],
    });
    const workedDays: WorkedDaysResult = { totalDays: 30, paidByEmployer: 30, paidByEps: 0, paidByArl: 0, unpaid: 0 };
    const { entries, errors } = computeBaseSalary(input, workedDays);
    expect(errors).toHaveLength(0);
    expect(entries[0].amount).toBe(30_000_000);
    expect(entries[0].description?.toLowerCase()).toContain("integral");
  });

  it("no salary history → entries=[], error about missing salary", () => {
    const input = mkInput({ salaryHistory: [] });
    const workedDays: WorkedDaysResult = { totalDays: 30, paidByEmployer: 30, paidByEps: 0, paidByArl: 0, unpaid: 0 };
    const { entries, errors } = computeBaseSalary(input, workedDays);
    expect(entries).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("emp1");
  });

  it("salary not yet effective at period start → no match → error", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ effective_from: "2026-04-01" })], // starts after period end
    });
    const workedDays: WorkedDaysResult = { totalDays: 30, paidByEmployer: 30, paidByEps: 0, paidByArl: 0, unpaid: 0 };
    const { entries, errors } = computeBaseSalary(input, workedDays);
    expect(entries).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Stage 3 — computeTransportAux
// ---------------------------------------------------------------------------

describe("computeTransportAux", () => {
  const workedDays30: WorkedDaysResult = { totalDays: 30, paidByEmployer: 30, paidByEps: 0, paidByArl: 0, unpaid: 0 };
  const workedDays8: WorkedDaysResult = { totalDays: 8, paidByEmployer: 8, paidByEps: 0, paidByArl: 0, unpaid: 0 };

  function salaryEntry(amount: number) {
    return { concept_type: "salary" as const, is_income: true, base: null, rate: null, amount, description: null };
  }

  it("$1M salary (≤ 2×SMMLV), override=null → emite $249.095", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 1_000_000 })],
    });
    const entry = computeTransportAux(input, workedDays30, salaryEntry(1_000_000));
    expect(entry).not.toBeNull();
    expect(entry!.concept_type).toBe("transport");
    expect(entry!.amount).toBe(AUX_TRANSPORT);
  });

  it("$5M salary (> 2×SMMLV), override=null → null (no aux transport)", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 5_000_000 })],
    });
    const entry = computeTransportAux(input, workedDays30, salaryEntry(5_000_000));
    expect(entry).toBeNull();
  });

  it("$5M salary, override=true → always emite transport", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 5_000_000, transport_aux_override: true })],
    });
    const entry = computeTransportAux(input, workedDays30, salaryEntry(5_000_000));
    expect(entry).not.toBeNull();
    expect(entry!.amount).toBe(AUX_TRANSPORT);
  });

  it("$1M salary, override=false → always null", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 1_000_000, transport_aux_override: false })],
    });
    const entry = computeTransportAux(input, workedDays30, salaryEntry(1_000_000));
    expect(entry).toBeNull();
  });

  it("transport prorated to 8 days → $66.425", () => {
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 1_000_000 })],
    });
    const entry = computeTransportAux(input, workedDays8, salaryEntry(1_000_000));
    expect(entry).not.toBeNull();
    // 249_095 * 8 / 30 = 66425.33 → rounds to 66425
    expect(entry!.amount).toBe(Math.round(AUX_TRANSPORT * 8 / 30));
  });

  it("no salary history → null (nothing to emit)", () => {
    const input = mkInput({ salaryHistory: [] });
    const entry = computeTransportAux(input, workedDays30, salaryEntry(0));
    expect(entry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Orchestrator stub — computePayroll (Tasks 11-13 validation)
// ---------------------------------------------------------------------------

describe("computePayroll orchestrator (stages 1-3)", () => {
  it("full month, $2.8M normal salary → has salary entry, has transport entry, no errors", () => {
    const result = computePayroll(mkInput());
    expect(result.errors).toHaveLength(0);
    const salary = result.entries.find((e) => e.concept_type === "salary");
    const transport = result.entries.find((e) => e.concept_type === "transport");
    expect(salary).toBeDefined();
    expect(salary!.amount).toBe(2_800_000);
    expect(transport).toBeDefined();
    expect(transport!.amount).toBe(AUX_TRANSPORT);
  });

  it("no salary history → errors block approve, entries empty", () => {
    const result = computePayroll(mkInput({ salaryHistory: [] }));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.entries.filter((e) => e.concept_type === "salary")).toHaveLength(0);
  });

  it("hire mid-month → prorated salary in entries", () => {
    const input = mkInput({
      employee: { ...baseProfile, hire_date: "2026-03-24" },
    });
    const result = computePayroll(input);
    const salary = result.entries.find((e) => e.concept_type === "salary");
    expect(salary!.amount).toBe(Math.round(2_800_000 * 8 / 30));
  });

  it("output has provisions and employer_cost (stubs replaced by stages 7-9)", () => {
    // Provisions and employer_cost are non-zero now that stages 7-9 are implemented
    const result = computePayroll(mkInput());
    expect(result.provisions).toBeDefined();
    expect(result.employer_cost).toBeDefined();
    expect(result.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for stages 4-5-6 tests
// ---------------------------------------------------------------------------

// $2.8M salary, hourly_divisor=220 → VH = round(2800000/220) = 12727
const VH = Math.round(2_800_000 / 220); // 12727

// Build a minimal ScheduleEntry for test purposes
function mkEntry(overrides: {
  date: string;
  start_time: string;
  end_time: string;
  overtime_status?: "none" | "pending" | "approved" | "rejected";
  break_minutes?: number | null;
}): ScheduleEntry {
  return {
    id: "entry1",
    schedule_id: "sched1",
    employee_id: "emp1",
    position_id: "pos1",
    date: overrides.date,
    start_time: overrides.start_time,
    end_time: overrides.end_time,
    shift_template_id: null,
    notes: null,
    is_night: null,
    exceeds_caps: [],
    overtime_status: overrides.overtime_status ?? "none",
    overtime_reviewed_by: null,
    overtime_reviewed_at: null,
    overtime_note: null,
    break_minutes: overrides.break_minutes ?? null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  };
}

// Mayo 1 2026 — Dia del trabajo (festivo nacional)
const mayo1Holiday: HolidayDate = {
  id: "h1",
  date: "2026-05-01",
  name: "Dia del trabajo",
  location_id: null,
  created_at: "2026-01-01T00:00:00Z",
};

// Settings with night_start=21 (default)
const settingsNight21 = baseSettings; // night_start_hour: 21

// Settings with night_start=19 (Ley 2466 style)
const settingsNight19: PayrollSettings = {
  ...baseSettings,
  id: "s2",
  night_start_hour: 19,
};

// ---------------------------------------------------------------------------
// Stage 4 — computeSurcharges
// ---------------------------------------------------------------------------

describe("computeSurcharges", () => {
  it("lunes 14:00-18:00 (4h diurnas, no holiday) → 0 recargos", () => {
    // 2026-03-02 is a Monday
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-02", start_time: "14:00", end_time: "18:00" })],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    expect(entries).toHaveLength(0);
  });

  it("lunes 21:00-05:00 (8h nocturnas con night_start=21) → surcharge_night = 8 × VH × 0.35", () => {
    // 2026-03-02 is Monday; 21:00-05:00 = 8h, all night (21:00 is exactly night_start, 00:00-05:00 also night)
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-02", start_time: "21:00", end_time: "05:00" })],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    const night = entries.find((e) => e.concept_type === "surcharge_night");
    expect(night).toBeDefined();
    expect(night!.amount).toBe(Math.round(8 * VH * 0.35));
    expect(entries.filter((e) => e.concept_type === "surcharge_sunday")).toHaveLength(0);
    expect(entries.filter((e) => e.concept_type === "surcharge_holiday")).toHaveLength(0);
  });

  it("lunes 19:00-23:00 con night_start=19 → 4h nocturnas", () => {
    // 2026-03-02 Monday, 19:00-23:00 = 4h, all night because night_start=19
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-02", start_time: "19:00", end_time: "23:00" })],
      settings: [settingsNight19],
    });
    const entries = computeSurcharges(input);
    const night = entries.find((e) => e.concept_type === "surcharge_night");
    expect(night).toBeDefined();
    expect(night!.amount).toBe(Math.round(4 * VH * 0.35));
  });

  it("domingo 14:00-22:00 sunday_pct=0.8 night_start=19: surcharge_sunday=8h×VH×0.8, surcharge_night=3h×VH×0.35", () => {
    // 2026-03-01 is a Sunday; 14:00-22:00=8h; night hours: 19:00-22:00=3h
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-01", start_time: "14:00", end_time: "22:00" })],
      settings: [settingsNight19],
    });
    const entries = computeSurcharges(input);
    const sunday = entries.find((e) => e.concept_type === "surcharge_sunday");
    const night = entries.find((e) => e.concept_type === "surcharge_night");
    expect(sunday).toBeDefined();
    expect(sunday!.amount).toBe(Math.round(8 * VH * 0.8));
    expect(night).toBeDefined();
    expect(night!.amount).toBe(Math.round(3 * VH * 0.35));
  });

  it("festivo Mayo 1 (viernes) 09:00-17:00 → surcharge_holiday = 8 × VH × 0.8", () => {
    // 2026-05-01 is Friday (dia del trabajo)
    const input = mkInput({
      period: { start: "2026-05-01", end: "2026-05-31", frequency: "mensual" },
      scheduleEntries: [mkEntry({ date: "2026-05-01", start_time: "09:00", end_time: "17:00" })],
      holidays: [mayo1Holiday],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    const holiday = entries.find((e) => e.concept_type === "surcharge_holiday");
    expect(holiday).toBeDefined();
    expect(holiday!.amount).toBe(Math.round(8 * VH * 0.8));
  });

  it("sin schedule_entries → entries vacio", () => {
    const input = mkInput({ scheduleEntries: [] });
    const entries = computeSurcharges(input);
    expect(entries).toHaveLength(0);
  });

  it("schedule_entry con overtime_status='approved' → ignorado por stage 4", () => {
    // 2026-03-02 Monday night shift, but approved overtime → stage 4 skips it
    const input = mkInput({
      scheduleEntries: [mkEntry({
        date: "2026-03-02",
        start_time: "21:00",
        end_time: "05:00",
        overtime_status: "approved",
      })],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    expect(entries).toHaveLength(0);
  });

  it("descuenta el descanso de las horas recargadas (turno festivo íntegro)", () => {
    // Turno festivo Mayo 1 (viernes) 07:00-19:00 = 12h, todas festivas (night_start=21, no
    // domingo). break_minutes=30 → 0.5h se descuenta de la hora de menor recargo (todas 0.8),
    // dejando el recargo festivo sobre 11.5h netas.
    const input = mkInput({
      period: { start: "2026-05-01", end: "2026-05-31", frequency: "mensual" },
      scheduleEntries: [mkEntry({ date: "2026-05-01", start_time: "07:00", end_time: "19:00", break_minutes: 30 })],
      holidays: [mayo1Holiday],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    const holiday = entries.find((e) => e.concept_type === "surcharge_holiday");
    expect(holiday).toBeDefined();
    expect(holiday!.amount).toBe(Math.round(11.5 * VH * 0.8));
    // No hay noche ni domingo → sin otros recargos.
    expect(entries.filter((e) => e.concept_type === "surcharge_night")).toHaveLength(0);
    expect(entries.filter((e) => e.concept_type === "surcharge_sunday")).toHaveLength(0);
  });

  it("turno diurno normal con break=60 → recargos sin cambio (descuento sale de horas ordinarias)", () => {
    // 2026-03-02 lunes 14:00-18:00 (4h diurnas ordinarias) con break_minutes=60: el descanso
    // se descuenta de las horas ordinarias, que no generan recargo → 0 recargos, igual que sin break.
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-02", start_time: "14:00", end_time: "18:00", break_minutes: 60 })],
      settings: [settingsNight21],
    });
    const entries = computeSurcharges(input);
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Stage 5 — computeOvertime
// ---------------------------------------------------------------------------

describe("computeOvertime", () => {
  it("sin entries con overtime_status='approved' → vacio", () => {
    const input = mkInput({
      scheduleEntries: [mkEntry({ date: "2026-03-02", start_time: "21:00", end_time: "05:00", overtime_status: "none" })],
    });
    const entries = computeOvertime(input);
    expect(entries).toHaveLength(0);
  });

  it("lunes 18:00-20:00 overtime_status='approved', night_start=19: 1h diurna + 1h nocturna", () => {
    // 18:00-20:00 = 2h; 18:00-19:00 diurna (overtime_day), 19:00-20:00 nocturna (overtime_night)
    const input = mkInput({
      scheduleEntries: [mkEntry({
        date: "2026-03-02", // Monday
        start_time: "18:00",
        end_time: "20:00",
        overtime_status: "approved",
      })],
      settings: [settingsNight19],
    });
    const entries = computeOvertime(input);
    const dayOT = entries.find((e) => e.concept_type === "overtime_day");
    const nightOT = entries.find((e) => e.concept_type === "overtime_night");
    expect(dayOT).toBeDefined();
    expect(dayOT!.amount).toBe(Math.round(1 * VH * 0.25));
    expect(nightOT).toBeDefined();
    expect(nightOT!.amount).toBe(Math.round(1 * VH * 0.75));
  });

  it("domingo 14:00-18:00 overtime_status='approved' (4h diurnas): overtime_day + surcharge_sunday emitidos", () => {
    // 2026-03-01 Sunday, 14:00-18:00 = 4h, diurnas (night_start=21 → not night)
    const input = mkInput({
      scheduleEntries: [mkEntry({
        date: "2026-03-01", // Sunday
        start_time: "14:00",
        end_time: "18:00",
        overtime_status: "approved",
      })],
      settings: [settingsNight21],
    });
    const entries = computeOvertime(input);
    const dayOT = entries.find((e) => e.concept_type === "overtime_day");
    const sundayRec = entries.find((e) => e.concept_type === "surcharge_sunday");
    expect(dayOT).toBeDefined();
    expect(dayOT!.amount).toBe(Math.round(4 * VH * 0.25));
    expect(sundayRec).toBeDefined();
    expect(sundayRec!.amount).toBe(Math.round(4 * VH * 0.8));
  });

  it("festivo overtime 4h diurnas → overtime_day + surcharge_holiday", () => {
    // 2026-05-01 festivo Friday, 09:00-13:00 = 4h diurnas overtime
    const input = mkInput({
      period: { start: "2026-05-01", end: "2026-05-31", frequency: "mensual" },
      scheduleEntries: [mkEntry({
        date: "2026-05-01",
        start_time: "09:00",
        end_time: "13:00",
        overtime_status: "approved",
      })],
      holidays: [mayo1Holiday],
      settings: [settingsNight21],
    });
    const entries = computeOvertime(input);
    const dayOT = entries.find((e) => e.concept_type === "overtime_day");
    const holRec = entries.find((e) => e.concept_type === "surcharge_holiday");
    expect(dayOT).toBeDefined();
    expect(dayOT!.amount).toBe(Math.round(4 * VH * 0.25));
    expect(holRec).toBeDefined();
    expect(holRec!.amount).toBe(Math.round(4 * VH * 0.8));
  });
});

// ---------------------------------------------------------------------------
// Stage 6 — computeAdjustments
// ---------------------------------------------------------------------------

describe("computeAdjustments", () => {
  const mkAdj = (overrides: Partial<SalaryAdjustment>): SalaryAdjustment => ({
    id: "adj1",
    employee_id: "emp1",
    payment_date: "2026-03-15",
    concept_label: "Comision febrero",
    amount: 200_000,
    is_salary_component: true,
    description: null,
    created_by: null,
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  });

  it("sin adjustments → entries vacio", () => {
    const input = mkInput({ adjustments: [] });
    expect(computeAdjustments(input)).toHaveLength(0);
  });

  it("is_salary=true dentro del periodo → bonus_salary con amount y description", () => {
    const adj = mkAdj({ is_salary_component: true, amount: 200_000, concept_label: "Comision febrero" });
    const input = mkInput({ adjustments: [adj] });
    const entries = computeAdjustments(input);
    expect(entries).toHaveLength(1);
    expect(entries[0].concept_type).toBe("bonus_salary");
    expect(entries[0].amount).toBe(200_000);
    expect(entries[0].description).toBe("Comision febrero");
  });

  it("is_salary=false → bonus_non_salary", () => {
    const adj = mkAdj({ is_salary_component: false });
    const input = mkInput({ adjustments: [adj] });
    const entries = computeAdjustments(input);
    expect(entries[0].concept_type).toBe("bonus_non_salary");
  });

  it("payment_date fuera del periodo → ignorado", () => {
    const adj = mkAdj({ payment_date: "2026-04-01" }); // April, outside March period
    const input = mkInput({ adjustments: [adj] });
    expect(computeAdjustments(input)).toHaveLength(0);
  });

  it("multiples adjustments → cada uno como entry separada (no se agregan)", () => {
    const adj1 = mkAdj({ id: "adj1", concept_label: "Comision A", amount: 100_000, is_salary_component: true });
    const adj2 = mkAdj({ id: "adj2", concept_label: "Comision B", amount: 150_000, is_salary_component: true });
    const input = mkInput({ adjustments: [adj1, adj2] });
    const entries = computeAdjustments(input);
    expect(entries).toHaveLength(2);
    expect(entries[0].amount).toBe(100_000);
    expect(entries[1].amount).toBe(150_000);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator — computePayroll (stages 4-6 wired)
// ---------------------------------------------------------------------------

describe("computePayroll orchestrator (stages 4-6)", () => {
  it("turno nocturno ordinario + adjustment + approved overtime emite todas las entries correctas", () => {
    // Night shift (ordinary): Monday 21:00-05:00 = 8h night (night_start=21) → surcharge_night
    // Approved overtime: Tuesday 17:00-19:00 = 2h diurna (night_start=21, all before 21) → overtime_day
    // Adjustment: $300K is_salary → bonus_salary
    const nightEntry = mkEntry({ date: "2026-03-02", start_time: "21:00", end_time: "05:00", overtime_status: "none" });
    const overtimeEntry = mkEntry({
      date: "2026-03-03", // Tuesday
      start_time: "17:00",
      end_time: "19:00",
      overtime_status: "approved",
    });
    const adj: SalaryAdjustment = {
      id: "adj1",
      employee_id: "emp1",
      payment_date: "2026-03-15",
      concept_label: "Bono",
      amount: 300_000,
      is_salary_component: true,
      description: null,
      created_by: null,
      created_at: "2026-03-01T00:00:00Z",
    };
    const input = mkInput({
      scheduleEntries: [nightEntry, overtimeEntry],
      adjustments: [adj],
      settings: [settingsNight21],
    });
    const result = computePayroll(input);
    expect(result.errors).toHaveLength(0);

    // Salary + transport from stages 1-3
    expect(result.entries.find((e) => e.concept_type === "salary")).toBeDefined();
    expect(result.entries.find((e) => e.concept_type === "transport")).toBeDefined();

    // Stage 4: surcharge_night for the ordinary night shift (8h)
    const surchargeNight = result.entries.find((e) => e.concept_type === "surcharge_night");
    expect(surchargeNight).toBeDefined();
    expect(surchargeNight!.amount).toBe(Math.round(8 * VH * 0.35));

    // Stage 5: overtime_day for the 2h diurna approved overtime (17:00-19:00, night_start=21)
    const otDay = result.entries.find((e) => e.concept_type === "overtime_day");
    expect(otDay).toBeDefined();
    expect(otDay!.amount).toBe(Math.round(2 * VH * 0.25));

    // Stage 6: bonus_salary
    const bonus = result.entries.find((e) => e.concept_type === "bonus_salary");
    expect(bonus).toBeDefined();
    expect(bonus!.amount).toBe(300_000);
  });
});

// ---------------------------------------------------------------------------
// Stage 7 — computeIBC
// ---------------------------------------------------------------------------

describe("computeIBC", () => {
  const SMMLV_VAL = 1_750_905;

  function makeSalaryEntry(amount: number, isIntegral = false): ComputedEntry {
    return {
      concept_type: "salary",
      is_income: true,
      base: null,
      rate: null,
      amount,
      description: isIntegral ? "salario integral" : null,
    };
  }

  it("empleado normal: salary=$2.8M + recargos=$200K + overtime=$100K + transport=$249K → IBC=$3.1M (transport excluido)", () => {
    const entries: ComputedEntry[] = [
      makeSalaryEntry(2_800_000),
      { concept_type: "transport", is_income: true, base: null, rate: null, amount: 249_095, description: null },
      { concept_type: "surcharge_night", is_income: true, base: null, rate: null, amount: 200_000, description: null },
      { concept_type: "overtime_day", is_income: true, base: null, rate: null, amount: 100_000, description: null },
    ];
    const input = mkInput();
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(3_100_000);
  });

  it("empleado integral $30M, 30 días → IBC = 70% × $30M = $21M", () => {
    const entries: ComputedEntry[] = [
      makeSalaryEntry(30_000_000, true),
    ];
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 30_000_000, is_integral_salary: true })],
    });
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(Math.round(0.70 * 30_000_000));
  });

  it("empleado integral $30M, 15 días → IBC = 70% × $30M × 15/30 = $10.5M", () => {
    const proratedAmount = Math.round(30_000_000 * 15 / 30);
    const entries: ComputedEntry[] = [
      makeSalaryEntry(proratedAmount, true),
    ];
    const input = mkInput({
      period: { start: "2026-03-01", end: "2026-03-15", frequency: "quincenal" },
      salaryHistory: [mkSalary({ monthly_salary: 30_000_000, is_integral_salary: true })],
    });
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(Math.round(0.70 * 30_000_000 * 15 / 30));
  });

  it("IBC < SMMLV → cap a SMMLV", () => {
    const entries: ComputedEntry[] = [
      makeSalaryEntry(500_000),
    ];
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 500_000 })],
    });
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(SMMLV_VAL);
  });

  it("IBC > 25 × SMMLV → cap a 25 × SMMLV", () => {
    const hugeSalary = 60_000_000;
    const entries: ComputedEntry[] = [
      makeSalaryEntry(hugeSalary),
    ];
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: hugeSalary })],
    });
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(25 * SMMLV_VAL);
  });

  it("bonus_salary incluido en IBC, bonus_non_salary excluido", () => {
    const entries: ComputedEntry[] = [
      makeSalaryEntry(2_800_000),
      { concept_type: "bonus_salary", is_income: true, base: null, rate: null, amount: 100_000, description: null },
      { concept_type: "bonus_non_salary", is_income: true, base: null, rate: null, amount: 500_000, description: null },
    ];
    const input = mkInput();
    const ibc = computeIBC(input, entries);
    expect(ibc).toBe(2_900_000);
  });
});

// ---------------------------------------------------------------------------
// Stage 8 — computeEmployeeDeductions
// ---------------------------------------------------------------------------

describe("computeEmployeeDeductions", () => {
  it("salary $2.8M + recargos, devengado ~$3.39M → base depurada < 95 UVT → income_tax = 0", () => {
    const ibc = 3_100_000;
    const totalDevengado = 3_390_000;
    const input = mkInput({ taxDeductions: null });
    const deductions = computeEmployeeDeductions(input, ibc, totalDevengado);

    const health = deductions.find((e) => e.concept_type === "health_employee");
    const pension = deductions.find((e) => e.concept_type === "pension_employee");
    const incTax = deductions.find((e) => e.concept_type === "income_tax");

    expect(health).toBeDefined();
    expect(health!.amount).toBe(Math.round(ibc * 0.04));
    expect(pension).toBeDefined();
    expect(pension!.amount).toBe(Math.round(ibc * 0.04));
    const taxAmt = incTax?.amount ?? 0;
    expect(taxAmt).toBe(0);
  });

  it("salario $8M, sin extras → income_tax > 0", () => {
    const ibc = 8_000_000;
    const totalDevengado = 8_000_000;
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 8_000_000 })],
      taxDeductions: null,
    });
    const deductions = computeEmployeeDeductions(input, ibc, totalDevengado);
    const incTax = deductions.find((e) => e.concept_type === "income_tax");
    expect(incTax).toBeDefined();
    expect(incTax!.amount).toBeGreaterThan(0);
  });

  it("salario $12M → income_tax alto (> 0, escalón > 95 UVT)", () => {
    const ibc = 12_000_000;
    const totalDevengado = 12_000_000;
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 12_000_000 })],
      taxDeductions: null,
    });
    const deductions = computeEmployeeDeductions(input, ibc, totalDevengado);
    const incTax = deductions.find((e) => e.concept_type === "income_tax");
    expect(incTax).toBeDefined();
    expect(incTax!.amount).toBeGreaterThan(0);

    const health = deductions.find((e) => e.concept_type === "health_employee");
    const pension = deductions.find((e) => e.concept_type === "pension_employee");
    expect(health!.amount).toBe(Math.round(ibc * 0.04));
    expect(pension!.amount).toBe(Math.round(ibc * 0.04));
  });

  it("IBC = 4 × SMMLV → solidarity_pension = ibc × 0.01", () => {
    const ibc = 4 * SMMLV;
    const input = mkInput();
    const deductions = computeEmployeeDeductions(input, ibc, ibc);
    const solidarity = deductions.find((e) => e.concept_type === "solidarity_pension");
    expect(solidarity).toBeDefined();
    expect(solidarity!.amount).toBe(Math.round(ibc * 0.01));
  });

  it("IBC = 16 × SMMLV → solidarity_pension = ibc × 0.012", () => {
    const ibc = 16 * SMMLV;
    const input = mkInput();
    const deductions = computeEmployeeDeductions(input, ibc, ibc);
    const solidarity = deductions.find((e) => e.concept_type === "solidarity_pension");
    expect(solidarity).toBeDefined();
    expect(solidarity!.amount).toBe(Math.round(ibc * 0.012));
  });

  it("IBC < 4 SMMLV → no solidarity_pension emitted", () => {
    const ibc = 3 * SMMLV;
    const input = mkInput();
    const deductions = computeEmployeeDeductions(input, ibc, ibc);
    const solidarity = deductions.find((e) => e.concept_type === "solidarity_pension");
    expect(solidarity).toBeUndefined();
  });

  it("taxDeductions=null → 0 dependents/mortgage/etc, no crash", () => {
    const ibc = 3_100_000;
    const input = mkInput({ taxDeductions: null });
    expect(() => computeEmployeeDeductions(input, ibc, ibc)).not.toThrow();
    const deductions = computeEmployeeDeductions(input, ibc, ibc);
    expect(deductions.length).toBeGreaterThan(0);
  });

  it("all deductions have is_income=false", () => {
    const ibc = 5_000_000;
    const input = mkInput();
    const deductions = computeEmployeeDeductions(input, ibc, ibc);
    for (const d of deductions) {
      expect(d.is_income).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Stage 9 — computeProvisionsAndEmployerCost
// ---------------------------------------------------------------------------

describe("computeProvisionsAndEmployerCost", () => {
  it("salario $2.8M normal, base=$3.4M → cesantias≈$283K, prima≈$283K, vacaciones≈$116.9K", () => {
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: 2_800_000, description: null },
      { concept_type: "transport", is_income: true, base: null, rate: null, amount: 249_095, description: null },
      { concept_type: "surcharge_night", is_income: true, base: null, rate: null, amount: 200_000, description: null },
      { concept_type: "overtime_day", is_income: true, base: null, rate: null, amount: 100_000, description: null },
      { concept_type: "bonus_salary", is_income: true, base: null, rate: null, amount: 50_000, description: null },
    ];
    const ibc = 3_150_000;
    const input = mkInput();
    const ytdBefore = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { provisions } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);

    const cesantias = provisions.find((p) => p.concept === "cesantias");
    const prima = provisions.find((p) => p.concept === "prima");
    const vacaciones = provisions.find((p) => p.concept === "vacaciones");

    const base = 2_800_000 + 249_095 + 200_000 + 100_000 + 50_000;
    expect(cesantias).toBeDefined();
    expect(cesantias!.amount).toBe(Math.round(base * 0.0833));
    expect(prima).toBeDefined();
    expect(prima!.amount).toBe(Math.round(base * 0.0833));
    expect(vacaciones).toBeDefined();
    expect(vacaciones!.amount).toBe(Math.round(2_800_000 * 0.0417));
  });

  it("salario integral → provisions=[] (no aplican)", () => {
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: 25_000_000, description: "salario integral" },
    ];
    const ibc = Math.round(25_000_000 * 0.70);
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: 25_000_000, is_integral_salary: true })],
    });
    const ytdBefore = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { provisions } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);
    expect(provisions).toHaveLength(0);
  });

  it("costo empleador: ARL clase 1, salario < 10 SMMLV → sena=0, icbf=0, total correcto", () => {
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: 2_800_000, description: null },
    ];
    const ibc = 2_800_000;
    const input = mkInput({ employee: { ...baseProfile, arl_risk_class: 1 } });
    const ytdBefore = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { employer_cost } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);

    expect(employer_cost.health_employer).toBe(Math.round(ibc * 0.085));
    expect(employer_cost.pension_employer).toBe(Math.round(ibc * 0.12));
    expect(employer_cost.arl_employer).toBe(Math.round(ibc * 0.00522));
    expect(employer_cost.parafiscales_caja).toBe(Math.round(ibc * 0.04));
    expect(employer_cost.parafiscales_sena).toBe(0);
    expect(employer_cost.parafiscales_icbf).toBe(0);
    const expectedTotal = Math.round(ibc * (0.085 + 0.12 + 0.00522 + 0.04));
    expect(employer_cost.total).toBe(expectedTotal);
  });

  it("ARL clase 5 → arl_employer = ibc × 0.0696", () => {
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: 2_800_000, description: null },
    ];
    const ibc = 2_800_000;
    const input = mkInput({ employee: { ...baseProfile, arl_risk_class: 5 } });
    const ytdBefore = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { employer_cost } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);
    expect(employer_cost.arl_employer).toBe(Math.round(ibc * 0.06960));
  });

  it("salario > 10 SMMLV → sena=ibc×0.02, icbf=ibc×0.03 (no exoneración)", () => {
    const highSalary = 20_000_000;
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: highSalary, description: null },
    ];
    const ibc = highSalary;
    const input = mkInput({
      salaryHistory: [mkSalary({ monthly_salary: highSalary })],
    });
    const ytdBefore = { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { employer_cost } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);
    expect(employer_cost.parafiscales_sena).toBe(Math.round(ibc * 0.02));
    expect(employer_cost.parafiscales_icbf).toBe(Math.round(ibc * 0.03));
  });

  it("YTD accumulation: ytdBefore.cesantias=$500K → accumulated_ytd = $500K + new amount", () => {
    const entries: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: null, rate: null, amount: 2_800_000, description: null },
    ];
    const ibc = 2_800_000;
    const input = mkInput();
    const ytdBefore = { cesantias: 500_000, cesantias_interest: 0, prima: 0, vacaciones: 0 };
    const { provisions } = computeProvisionsAndEmployerCost(input, ibc, entries, ytdBefore);
    const cesantias = provisions.find((p) => p.concept === "cesantias");
    expect(cesantias!.accumulated_ytd).toBe(500_000 + cesantias!.amount);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator E2E — computePayroll full pipeline ($2.8M fixture, research §9)
// ---------------------------------------------------------------------------

describe("computePayroll E2E — $2.8M fixture (research §9)", () => {
  it("full pipeline: salary=$2.8M, 2 dominicales 8h, OT nocturna 8h → neto/costo en rango esperado", () => {
    const sundayEntry1 = mkEntry({ date: "2026-03-01", start_time: "09:00", end_time: "17:00", overtime_status: "none" });
    const sundayEntry2 = mkEntry({ date: "2026-03-08", start_time: "09:00", end_time: "17:00", overtime_status: "none" });
    const otNightEntry = mkEntry({ date: "2026-03-02", start_time: "21:00", end_time: "05:00", overtime_status: "approved" });

    const input = mkInput({
      scheduleEntries: [sundayEntry1, sundayEntry2, otNightEntry],
      settings: [settingsNight21],
    });

    const result = computePayroll(input);
    expect(result.errors).toHaveLength(0);

    const salary = result.entries.find((e) => e.concept_type === "salary");
    expect(salary!.amount).toBe(2_800_000);

    const transport = result.entries.find((e) => e.concept_type === "transport");
    expect(transport!.amount).toBe(AUX_TRANSPORT);

    // Sunday surcharge: 16h × VH × 0.8
    const sundayRec = result.entries.find((e) => e.concept_type === "surcharge_sunday");
    expect(sundayRec).toBeDefined();
    expect(sundayRec!.amount).toBe(Math.round(16 * VH * 0.8));

    // Overtime night: 8h × VH × 0.75
    const otNight = result.entries.find((e) => e.concept_type === "overtime_night");
    expect(otNight).toBeDefined();
    expect(otNight!.amount).toBe(Math.round(8 * VH * 0.75));

    // Deductions exist
    expect(result.entries.find((e) => e.concept_type === "health_employee")).toBeDefined();
    expect(result.entries.find((e) => e.concept_type === "pension_employee")).toBeDefined();

    // Provisions exist
    expect(result.provisions.length).toBeGreaterThan(0);
    expect(result.provisions.find((p) => p.concept === "cesantias")).toBeDefined();
    expect(result.provisions.find((p) => p.concept === "prima")).toBeDefined();
    expect(result.provisions.find((p) => p.concept === "vacaciones")).toBeDefined();

    // Employer cost > 0
    expect(result.employer_cost.total).toBeGreaterThan(0);

    // Gross devengado in expected range
    const totalDevengado = result.entries
      .filter((e) => e.is_income)
      .reduce((s, e) => s + e.amount, 0);
    expect(totalDevengado).toBeGreaterThan(3_000_000);
    expect(totalDevengado).toBeLessThan(4_000_000);

    // Neto = devengado - deducciones
    const totalDed = result.entries
      .filter((e) => !e.is_income)
      .reduce((s, e) => s + e.amount, 0);
    const neto = totalDevengado - totalDed;
    expect(neto).toBeGreaterThan(2_800_000);
  });

  it("output has provisions populated and employer_cost.total > 0", () => {
    const result = computePayroll(mkInput());
    expect(result.provisions.length).toBeGreaterThan(0);
    expect(result.employer_cost.total).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 20 — Multi-period split
// ---------------------------------------------------------------------------

describe("computePayroll multi-period split", () => {
  // Two payroll settings: p2 covers up to Jul 14, p3 starts Jul 15 (divisor changes)
  const settingsP2: PayrollSettings = {
    id: "p2",
    period_start: "2026-01-01",
    period_end: "2026-07-14",
    smmlv: SMMLV,
    aux_transport: AUX_TRANSPORT,
    hourly_divisor: 220,
    night_start_hour: 21,
    sunday_surcharge_pct: 0.9,
    holiday_surcharge_pct: 0.9,
    uvt: 52374,
    updated_at: "2026-01-01T00:00:00Z",
  };
  const settingsP3: PayrollSettings = {
    id: "p3",
    period_start: "2026-07-15",
    period_end: null,
    smmlv: SMMLV,
    aux_transport: AUX_TRANSPORT,
    hourly_divisor: 210,
    night_start_hour: 21,
    sunday_surcharge_pct: 0.9,
    holiday_surcharge_pct: 0.9,
    uvt: 52374,
    updated_at: "2026-07-15T00:00:00Z",
  };

  it("período jul 2026: 1h dominical el 5-jul (div=220) + 1h dominical el 19-jul (div=210) → surcharge_sunday = suma de ambos valores horarios", () => {
    // 2026-07-05 = Sunday (verified: Jan 1 = Thu, day 186: (4+185)%7=0=Sun)
    // 2026-07-19 = Sunday (day 200: (4+199)%7=0=Sun)
    const sundayBefore = mkEntry({ date: "2026-07-05", start_time: "09:00", end_time: "10:00", overtime_status: "none" });
    const sundayAfter = mkEntry({ date: "2026-07-19", start_time: "09:00", end_time: "10:00", overtime_status: "none" });

    const salary = 3_000_000;
    const vhP2 = Math.round(salary / 220);
    const vhP3 = Math.round(salary / 210);

    const input: PayrollComputeInput = {
      employee: { ...baseProfile },
      period: { start: "2026-07-01", end: "2026-07-31", frequency: "mensual" },
      salaryHistory: [mkSalary({ monthly_salary: salary })],
      scheduleEntries: [sundayBefore, sundayAfter],
      shiftTemplates: [],
      holidays: [],
      absences: [],
      adjustments: [],
      taxDeductions: null,
      settings: [settingsP2, settingsP3],
      ytdProvisionsBefore: { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 },
    };

    const result = computePayroll(input);
    expect(result.errors).toHaveLength(0);

    // surcharge_sunday = 1h×vhP2×0.9 + 1h×vhP3×0.9 (two different hourly rates)
    const sundayRec = result.entries
      .filter((e) => e.concept_type === "surcharge_sunday")
      .reduce((s, e) => s + e.amount, 0);
    const expectedSunday = Math.round(1 * vhP2 * 0.9) + Math.round(1 * vhP3 * 0.9);
    expect(sundayRec).toBe(expectedSunday);

    // Salary covers the full 30-day convention period (not double-counted)
    const salaryEntry = result.entries.find((e) => e.concept_type === "salary");
    expect(salaryEntry!.amount).toBe(salary);
  });

  it("divisores de p2 y p3 son distintos → VH distintos en surcharges", () => {
    const salary = 3_000_000;
    const vhP2 = Math.round(salary / 220);
    const vhP3 = Math.round(salary / 210);
    expect(vhP2).not.toBe(vhP3);
    expect(vhP3).toBeGreaterThan(vhP2);
  });

  it("stages 7-9 (IBC, deductions, provisions) corren UNA vez sobre el total combinado", () => {
    const sundayBefore = mkEntry({ date: "2026-07-05", start_time: "09:00", end_time: "10:00", overtime_status: "none" });
    const sundayAfter = mkEntry({ date: "2026-07-19", start_time: "09:00", end_time: "10:00", overtime_status: "none" });
    const salary = 3_000_000;

    const input: PayrollComputeInput = {
      employee: { ...baseProfile },
      period: { start: "2026-07-01", end: "2026-07-31", frequency: "mensual" },
      salaryHistory: [mkSalary({ monthly_salary: salary })],
      scheduleEntries: [sundayBefore, sundayAfter],
      shiftTemplates: [],
      holidays: [],
      absences: [],
      adjustments: [],
      taxDeductions: null,
      settings: [settingsP2, settingsP3],
      ytdProvisionsBefore: { cesantias: 0, cesantias_interest: 0, prima: 0, vacaciones: 0 },
    };

    const result = computePayroll(input);

    // Provisions run once (not duplicated per sub-period)
    const cesantias = result.provisions.find((p) => p.concept === "cesantias");
    expect(cesantias).toBeDefined();
    expect(cesantias!.amount).toBeGreaterThan(0);

    // Exactly one health_employee deduction (not duplicated per sub-period)
    const healthEntries = result.entries.filter((e) => e.concept_type === "health_employee");
    expect(healthEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// makeInput — convenience helper for advance/settlement tests
// Accepts named overrides for common fields used in Tasks 6+7.
// ---------------------------------------------------------------------------

function makeInput(opts: {
  period: { start: string; end: string; frequency: "mensual" | "quincenal"; paymentMode?: "independent" | "advance_settlement" };
  monthlySalary?: number;
  hireDate?: string;
  terminationDate?: string;
  q1AdvanceEntries?: ComputedEntry[];
}): PayrollComputeInput {
  const salary = opts.monthlySalary ?? 2_800_000;
  return mkInput({
    employee: {
      ...baseProfile,
      hire_date: opts.hireDate ?? null,
      termination_date: opts.terminationDate ?? null,
    },
    period: opts.period as PayrollComputeInput["period"],
    salaryHistory: [mkSalary({ monthly_salary: salary })],
    q1AdvanceEntries: opts.q1AdvanceEntries,
  });
}

// ---------------------------------------------------------------------------
// Task 6 — computePayroll advance/settlement mode (Q1 branch)
// ---------------------------------------------------------------------------

describe("computePayroll — advance/settlement mode", () => {
  it("Q1 advance emits only salary + transport, no SS deductions", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({ period, monthlySalary: 2_800_000 });
    const out = computePayroll(input);

    const concepts = out.entries.map((e) => e.concept_type).sort();
    expect(concepts).toEqual(["salary", "transport"]);
    expect(out.provisions).toHaveLength(0);
    expect(out.employer_cost.total).toBe(0);
    expect(out.warnings).toContain(
      "Anticipo de Q1 — la liquidación completa llega en la segunda quincena"
    );
  });

  it("Q1 advance with hire mid-Q1: prorrateo correcto", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 3_000_000,
      hireDate: "2026-04-08",
    });
    const out = computePayroll(input);
    const salary = out.entries.find((e) => e.concept_type === "salary");
    // 8 days × 3M / 30 = 800K
    expect(salary?.amount).toBe(800_000);
  });

  it("Q1 fallback when termination ∈ Q1: full calc, is_advance=false", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 2_800_000,
      terminationDate: "2026-04-10",
    });
    const out = computePayroll(input);
    // Full calculation should run (deducciones present)
    const concepts = out.entries.map((e) => e.concept_type);
    expect(concepts).toContain("salary");
    expect(concepts).toContain("health_employee");
    expect(concepts).toContain("pension_employee");
  });

  it("independent mode quincenal: full calc per period", () => {
    const period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "independent" as const,
    };
    const input = makeInput({ period, monthlySalary: 2_800_000 });
    const out = computePayroll(input);
    const concepts = out.entries.map((e) => e.concept_type);
    expect(concepts).toContain("salary");
    expect(concepts).toContain("health_employee");
  });
});

// ---------------------------------------------------------------------------
// Task 7 — computePayroll Q2 settlement subtraction
// ---------------------------------------------------------------------------

describe("computePayroll — Q2 settlement", () => {
  it("Q2 settlement subtracts Q1 advance from salary and transport", () => {
    const period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q1Advance: ComputedEntry[] = [
      { concept_type: "salary", is_income: true, base: 1_400_000, rate: null, amount: 1_400_000, description: null },
      { concept_type: "transport", is_income: true, base: 124_548, rate: null, amount: 124_548, description: null },
    ];
    const input = makeInput({
      period,
      monthlySalary: 2_800_000,
      q1AdvanceEntries: q1Advance,
    });
    const out = computePayroll(input);

    const salary = out.entries.find((e) => e.concept_type === "salary");
    const transport = out.entries.find((e) => e.concept_type === "transport");
    expect(salary?.amount).toBe(1_400_000);  // 2_800_000 − 1_400_000
    expect(transport?.amount).toBe(124_547);  // 249_095 − 124_548 (close)
    expect(out.warnings.some((w) => w.includes("Anticipo Q1 ya pagado"))).toBe(true);
  });

  it("Q2 settlement without Q1 (employee hired mid-Q2): no subtraction", () => {
    const period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const input = makeInput({
      period,
      monthlySalary: 3_000_000,
      hireDate: "2026-04-20",
      // no q1AdvanceEntries
    });
    const out = computePayroll(input);
    const salary = out.entries.find((e) => e.concept_type === "salary");
    // hire 2026-04-20, period_end 2026-04-30 → 11 days
    expect(salary?.amount).toBe(1_100_000);
  });

  it("Q1 advance + Q2 settlement sum to full mensual", () => {
    // Run Q1
    const q1Period = {
      start: "2026-04-01",
      end: "2026-04-15",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q1Out = computePayroll(makeInput({ period: q1Period, monthlySalary: 2_800_000 }));
    const q1Advance = q1Out.entries;

    // Run Q2 with Q1 reference
    const q2Period = {
      start: "2026-04-16",
      end: "2026-04-30",
      frequency: "quincenal" as const,
      paymentMode: "advance_settlement" as const,
    };
    const q2Out = computePayroll(makeInput({
      period: q2Period,
      monthlySalary: 2_800_000,
      q1AdvanceEntries: q1Advance,
    }));

    // Suma de Q1+Q2 salary = 2_800_000
    const totalSalary = (q1Out.entries.find((e) => e.concept_type === "salary")?.amount ?? 0)
      + (q2Out.entries.find((e) => e.concept_type === "salary")?.amount ?? 0);
    expect(totalSalary).toBe(2_800_000);

    const totalTransport = (q1Out.entries.find((e) => e.concept_type === "transport")?.amount ?? 0)
      + (q2Out.entries.find((e) => e.concept_type === "transport")?.amount ?? 0);
    expect(totalTransport).toBeCloseTo(249_095, -1);  // ±10 rounding
  });
});
