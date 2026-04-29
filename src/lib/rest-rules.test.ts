import { describe, it, expect } from "vitest";
import {
  isWorkCycleRest,
  isWeekendRotationRest,
  isPostNightRest,
  exceedsMaxConsecutiveNights,
} from "./rest-rules";
import type {
  WorkCycleParams,
  WeekendRotationParams,
  PostNightRestParams,
  MaxConsecutiveNightsParams,
  ScheduleEntry,
  ShiftTemplate,
} from "./types";

describe("isWorkCycleRest", () => {
  const params: WorkCycleParams = {
    work_days: 4,
    rest_days: 3,
    cycle_start_date: "2026-04-06",  // lunes
  };

  it("primer día del ciclo → trabajo", () => {
    expect(isWorkCycleRest(params, "2026-04-06")).toBe(false);
  });

  it("4to día (jueves) → trabajo", () => {
    expect(isWorkCycleRest(params, "2026-04-09")).toBe(false);
  });

  it("5to día (viernes) → descanso", () => {
    expect(isWorkCycleRest(params, "2026-04-10")).toBe(true);
  });

  it("7mo día (domingo) → descanso", () => {
    expect(isWorkCycleRest(params, "2026-04-12")).toBe(true);
  });

  it("8vo día (lunes) → trabajo (siguiente ciclo)", () => {
    expect(isWorkCycleRest(params, "2026-04-13")).toBe(false);
  });

  it("antes del anchor → trabajo (regla no aplica todavía)", () => {
    expect(isWorkCycleRest(params, "2026-04-01")).toBe(false);
  });
});

describe("isWeekendRotationRest", () => {
  const params: WeekendRotationParams = {
    every_n_weeks: 2,
    offset: 0,
    include_saturday: true,
    include_sunday: true,
  };

  it("sábado en semana de descanso (ISO 14, par con offset 0) → descanso", () => {
    // 2026-04-04 = sábado, ISO week 14 (par)
    expect(isWeekendRotationRest(params, "2026-04-04")).toBe(true);
  });

  it("domingo en semana de descanso → descanso", () => {
    // 2026-04-05 = domingo, ISO week 14
    expect(isWeekendRotationRest(params, "2026-04-05")).toBe(true);
  });

  it("sábado en semana de trabajo (ISO 15, impar) → trabajo", () => {
    // 2026-04-11 = sábado, ISO week 15
    expect(isWeekendRotationRest(params, "2026-04-11")).toBe(false);
  });

  it("día entre semana → trabajo (no aplica regla)", () => {
    expect(isWeekendRotationRest(params, "2026-04-08")).toBe(false);
  });

  it("offset 1 invierte el comportamiento", () => {
    const p2: WeekendRotationParams = { ...params, offset: 1 };
    expect(isWeekendRotationRest(p2, "2026-04-04")).toBe(false);
    expect(isWeekendRotationRest(p2, "2026-04-11")).toBe(true);
  });

  it("solo sábado (include_sunday=false) → domingo siempre trabajo", () => {
    const p3: WeekendRotationParams = { ...params, include_sunday: false };
    expect(isWeekendRotationRest(p3, "2026-04-04")).toBe(true);  // sáb descanso
    expect(isWeekendRotationRest(p3, "2026-04-05")).toBe(false); // dom trabajo
  });
});

function mkEntry(date: string, isNight: boolean): ScheduleEntry {
  return {
    id: `e-${date}`, schedule_id: "s1", employee_id: "u1",
    position_id: "p1", date,
    start_time: isNight ? "22:00" : "09:00",
    end_time: isNight ? "06:00" : "17:00",
    shift_template_id: isNight ? "tpl-n" : "tpl-d",
    notes: null, created_at: "", updated_at: "",
    exceeds_caps: [], overtime_status: "none",
    overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
  };
}

const nightTemplate: ShiftTemplate = {
  id: "tpl-n", name: "Noche", start_time: "22:00", end_time: "06:00",
  break_minutes: 0, color: "#000", location_id: "loc-1",
  is_night: true, created_at: "",
};

const _dayTemplate: ShiftTemplate = {
  ...nightTemplate, id: "tpl-d", name: "Día",
  start_time: "09:00", end_time: "17:00", is_night: false,
};

// Suppress unused warning — templates used in isRestDay tests (Task 6)
void nightTemplate;
void _dayTemplate;

describe("isPostNightRest", () => {
  const params: PostNightRestParams = { nights_threshold: 3, rest_days_required: 2 };

  it("sin noches recientes → no requiere descanso", () => {
    expect(isPostNightRest(params, "2026-04-10", [])).toBe(false);
  });

  it("3 noches consecutivas previas → días 4 y 5 son descanso", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-10", recent)).toBe(true);
    expect(isPostNightRest(params, "2026-04-11", recent)).toBe(true);
  });

  it("día 6 después de 3 noches → trabajo (descanso ya cumplido)", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-12", recent)).toBe(false);
  });

  it("solo 2 noches → no aplica (no llega al threshold)", () => {
    const recent = [
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(isPostNightRest(params, "2026-04-10", recent)).toBe(false);
  });
});

describe("exceedsMaxConsecutiveNights", () => {
  const params: MaxConsecutiveNightsParams = { max: 3 };

  it("0 noches previas + slot nocturno → OK", () => {
    expect(exceedsMaxConsecutiveNights(params, [], "2026-04-10", true)).toBe(false);
  });

  it("3 noches consecutivas + slot nocturno (4to día) → excede", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(exceedsMaxConsecutiveNights(params, recent, "2026-04-10", true)).toBe(true);
  });

  it("3 noches consecutivas + slot diurno → OK (no es noche)", () => {
    const recent = [
      mkEntry("2026-04-07", true),
      mkEntry("2026-04-08", true),
      mkEntry("2026-04-09", true),
    ];
    expect(exceedsMaxConsecutiveNights(params, recent, "2026-04-10", false)).toBe(false);
  });
});
