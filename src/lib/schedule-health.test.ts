import { describe, it, expect } from "vitest";
import { computeHealth, type HealthSummary } from "./schedule-health";
import type {
  Profile, ScheduleEntry, StaffingRequirement, LaborConstraints, HolidayDate,
} from "./types";

const constraints: LaborConstraints = {
  maxHoursPerWeek: 40, maxHoursPerDay: 10,
  minRestHoursBetweenShifts: 12, maxConsecutiveDays: 6,
};

const E1: Profile = {
  id: "e1", first_name: "Ana", last_name: "Pérez", email: "", phone: null,
  role: "employee", position_id: null, location_id: "loc-1",
  max_hours_per_week: 40, is_active: true, is_demo: false, is_floater: false,
  organization_id: "org-1", contract_type_id: "", created_at: "", updated_at: "",
};

const E2: Profile = { ...E1, id: "e2", first_name: "Beto", last_name: "Gómez" };

const SR: StaffingRequirement[] = [
  { id: "sr-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
    day_of_week: 1, required_count: 1, created_at: "", updated_at: "" },
  { id: "sr-2", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
    day_of_week: 2, required_count: 1, created_at: "", updated_at: "" },
];

function mkEntry(opts: {
  date: string; employeeId: string; status?: "none" | "pending" | "approved" | "rejected";
  start?: string; end?: string;
}): ScheduleEntry {
  return {
    id: `${opts.employeeId}-${opts.date}`, schedule_id: "sched-1",
    employee_id: opts.employeeId, position_id: "pos-1",
    date: opts.date, start_time: opts.start ?? "09:00", end_time: opts.end ?? "17:00",
    shift_template_id: "tpl-m", is_night: null, notes: null, created_at: "", updated_at: "",
    exceeds_caps: [], overtime_status: opts.status ?? "none",
    overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    break_minutes: null,
  };
}

describe("computeHealth", () => {
  it("vacío: 0/0", () => {
    const h = computeHealth([], [], [], constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(0);
    expect(h.totalAssigned).toBe(0);
    expect(h.totalGaps).toBe(0);
  });

  it("100% sin extras", () => {
    // Abril 2026: 4 lunes (6, 13, 20, 27) + 4 martes (7, 14, 21, 28) = 8 turnos requeridos
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1" }),
      mkEntry({ date: "2026-04-13", employeeId: "e2" }),
      mkEntry({ date: "2026-04-14", employeeId: "e2" }),
      mkEntry({ date: "2026-04-20", employeeId: "e1" }),
      mkEntry({ date: "2026-04-21", employeeId: "e1" }),
      mkEntry({ date: "2026-04-27", employeeId: "e2" }),
      mkEntry({ date: "2026-04-28", employeeId: "e2" }),
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(8);
    expect(h.totalAssigned).toBe(8);
    expect(h.totalAssignedNoExtras).toBe(8);
    expect(h.totalPendingExtras).toBe(0);
    expect(h.totalGaps).toBe(0);
  });

  it("mezcla: extras + gaps", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", status: "pending" }),
      mkEntry({ date: "2026-04-13", employeeId: "e2", status: "pending" }),
      // Faltan: 14, 20, 21, 27, 28 — 5 gaps
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalRequired).toBe(8);
    expect(h.totalAssigned).toBe(3);
    expect(h.totalAssignedNoExtras).toBe(1);
    expect(h.totalPendingExtras).toBe(2);
    expect(h.totalGaps).toBe(5);
  });

  it("ignora entries con status=rejected", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", status: "rejected" }),
    ];
    const h = computeHealth(entries, [E1, E2], SR, constraints, "loc-1", 2026, 4);
    expect(h.totalAssigned).toBe(1);
    expect(h.totalGaps).toBe(7);
  });

  it("detecta empleados saturados — días consecutivos ≥ cap", () => {
    const dates = [
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10", "2026-04-11",
    ];
    const entries: ScheduleEntry[] = dates.map((date) =>
      mkEntry({ date, employeeId: "e1" })
    );
    const h = computeHealth(entries, [E1, E2], [], constraints, "loc-1", 2026, 4);
    const e1Sat = h.saturatedEmployees.find((s) => s.employeeId === "e1");
    expect(e1Sat).toBeDefined();
    expect(e1Sat?.consecutiveDays).toBe(6);
    expect(e1Sat?.flags).toContain("near_consecutive_cap");
  });

  it("flagged empleados al ≥85% de horas semana", () => {
    const entries: ScheduleEntry[] = [
      mkEntry({ date: "2026-04-06", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-07", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-08", employeeId: "e1", start: "09:00", end: "18:00" }),
      mkEntry({ date: "2026-04-09", employeeId: "e1", start: "09:00", end: "18:00" }),
      // 4 × 9h = 36h en la semana ISO del 6 abr → 36/40 = 90% (≥85%)
    ];
    const h = computeHealth(entries, [E1, E2], [], constraints, "loc-1", 2026, 4);
    const e1Sat = h.saturatedEmployees.find((s) => s.employeeId === "e1");
    expect(e1Sat?.flags).toContain("near_weekly_cap");
  });

  it("fila is_holiday (dow=0 sentinela) no cuenta en domingos normales, sí en un festivo con perfil", () => {
    // Fila de perfil de festivo: dow=0 sentinela + is_holiday=true para pos-1.
    const holidayRow: StaffingRequirement[] = [
      { id: "srh-1", location_id: "loc-1", position_id: "pos-1", shift_template_id: "tpl-m",
        day_of_week: 0, required_count: 1, is_holiday: true, created_at: "", updated_at: "" },
    ];

    // Sin festivos: la fila festiva NO debe contar en los domingos del mes (fantasma).
    const noHol = computeHealth([], [E1, E2], holidayRow, constraints, "loc-1", 2026, 4);
    expect(noHol.totalRequired).toBe(0);

    // Con un festivo dentro del mes generado (month=4 → mayo 2026): la posición con
    // perfil usa SOLO el perfil de festivo → cuenta 1 en ese día.
    const holidays: HolidayDate[] = [
      { id: "h1", date: "2026-05-07", name: "Test", location_id: null, created_at: "" },
    ];
    const withHol = computeHealth(
      [], [E1, E2], holidayRow, constraints, "loc-1", 2026, 4, [], [], [], holidays,
    );
    expect(withHol.totalRequired).toBe(1);
  });
});
