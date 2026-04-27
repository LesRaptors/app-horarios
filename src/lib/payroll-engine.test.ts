import { describe, it, expect } from "vitest";
import {
  computeWorkedDays,
  computeBaseSalary,
  computeTransportAux,
  computeSurcharges,
  computeOvertime,
  computePayroll,
} from "./payroll-engine";
import type {
  PayrollComputeInput,
  WorkedDaysResult,
} from "./payroll-engine";
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

  it("output has provisions=[], employer_cost=zero, warnings=[]", () => {
    const result = computePayroll(mkInput());
    expect(result.provisions).toEqual([]);
    expect(result.employer_cost.total).toBe(0);
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
    exceeds_caps: [],
    overtime_status: overrides.overtime_status ?? "none",
    overtime_reviewed_by: null,
    overtime_reviewed_at: null,
    overtime_note: null,
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
