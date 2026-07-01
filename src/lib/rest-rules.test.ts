import { describe, it, expect } from "vitest";
import {
  isWorkCycleRest,
  isWeekendRotationRest,
  isPostNightRest,
  exceedsMaxConsecutiveNights,
  needsCompensatory,
  isRestDay,
  pickEffectiveRules,
} from "./rest-rules";
import type {
  WorkCycleParams,
  WeekendRotationParams,
  PostNightRestParams,
  MaxConsecutiveNightsParams,
  CompensatoryDayParams,
  RestRule,
  EmployeeRestRule,
  ScheduleEntry,
} from "./types";
import { makeTemplate } from "./test-utils/make-template";

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
    is_night: isNight,
    notes: null, created_at: "", updated_at: "",
    exceeds_caps: [], overtime_status: "none",
    overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
    break_minutes: null,
  };
}

const nightTemplate = makeTemplate({
  id: "tpl-n", name: "Noche", start_time: "22:00", end_time: "06:00", is_night: true,
});

const _dayTemplate = makeTemplate({
  id: "tpl-d", name: "Día", start_time: "09:00", end_time: "17:00", is_night: false,
});

// Suppress unused warning — nightTemplate used in isRestDay tests (Task 6)
void nightTemplate;

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

  it("cuenta un entry pasado como noche por is_night efectivo, no por el heurístico de start_time", () => {
    const max1: MaxConsecutiveNightsParams = { max: 1 };
    // Entry vespertino que cruza medianoche (19:00-02:00) con horario de festivo:
    // is_night EFECTIVO = true, aunque el heurístico de start_time (>=21:00 || <06:00) diría false.
    const eveningCrossing = (isNight: boolean | null): ScheduleEntry => ({
      id: "e-x", schedule_id: "s1", employee_id: "u1", position_id: "p1",
      date: "2026-04-09", start_time: "19:00", end_time: "02:00",
      shift_template_id: "tpl-d", is_night: isNight,
      notes: null, created_at: "", updated_at: "",
      exceeds_caps: [], overtime_status: "none",
      overtime_reviewed_by: null, overtime_reviewed_at: null, overtime_note: null,
      break_minutes: null,
    });
    // is_night efectivo = true → cuenta como noche previa → con slot nocturno excede max=1.
    expect(exceedsMaxConsecutiveNights(max1, [eveningCrossing(true)], "2026-04-10", true)).toBe(true);
    // is_night = null (histórico) → cae al heurístico de start_time (19:00 → no es noche) → no cuenta.
    expect(exceedsMaxConsecutiveNights(max1, [eveningCrossing(null)], "2026-04-10", true)).toBe(false);
  });
});

describe("needsCompensatory", () => {
  const params: CompensatoryDayParams = {
    applies_to: "sundays",
    within_days: 7,
  };

  it("sin domingo trabajado → no necesita compensatorio", () => {
    expect(needsCompensatory(params, "2026-04-08", [])).toBe(false);
  });

  it("trabajó dom 5 abr, ya descansó algún día (sin entry para 6 abr) → cumplido", () => {
    const recent = [mkEntry("2026-04-05", false)];  // domingo trabajado
    // Si no hay entry para el 6 abr, ese día está libre → ya cumplió.
    expect(needsCompensatory(params, "2026-04-08", recent)).toBe(false);
  });

  it("trabajó dom 5 + lun a vie (sin libre) → necesita compensatorio el sáb 11", () => {
    const recent = [
      mkEntry("2026-04-05", false), // domingo
      mkEntry("2026-04-06", false), // lun
      mkEntry("2026-04-07", false),
      mkEntry("2026-04-08", false),
      mkEntry("2026-04-09", false),
      mkEntry("2026-04-10", false), // viernes (5 días seguidos sin descanso)
    ];
    expect(needsCompensatory(params, "2026-04-11", recent)).toBe(true);
  });

  it("dom trabajado hace > within_days → ya no aplica", () => {
    const recent = [mkEntry("2026-03-22", false)]; // domingo hace 17+ días
    expect(needsCompensatory(params, "2026-04-08", recent)).toBe(false);
  });
});

describe("isRestDay (despachador)", () => {
  const workCycleRule: RestRule = {
    id: "r1", contract_type_id: "ct1", rule_type: "work_cycle",
    params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-04-06" },
    created_at: "", updated_at: "",
  };

  it("delega correctamente a isWorkCycleRest", () => {
    expect(isRestDay(workCycleRule, "2026-04-10", _dayTemplate, [])).toBe(true);
    expect(isRestDay(workCycleRule, "2026-04-09", _dayTemplate, [])).toBe(false);
  });
});

describe("pickEffectiveRules", () => {
  it("usa reglas del empleado si tiene 1+ y descarta las del contract", () => {
    const empRules: EmployeeRestRule[] = [{
      id: "er1", employee_id: "e1",
      rule_type: "weekend_rotation",
      params: { every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true } as WeekendRotationParams,
      created_at: "", updated_at: "",
    }];
    const contractRules: RestRule[] = [{
      id: "cr1", contract_type_id: "ct1",
      rule_type: "work_cycle",
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-01-01" } as WorkCycleParams,
      created_at: "", updated_at: "",
    }];
    const result = pickEffectiveRules(empRules, contractRules);
    expect(result).toHaveLength(1);
    expect(result[0].rule_type).toBe("weekend_rotation");
  });

  it("fallback a reglas del contract si empleado no tiene", () => {
    const contractRules: RestRule[] = [{
      id: "cr1", contract_type_id: "ct1",
      rule_type: "work_cycle",
      params: { work_days: 4, rest_days: 3, cycle_start_date: "2026-01-01" } as WorkCycleParams,
      created_at: "", updated_at: "",
    }];
    const result = pickEffectiveRules([], contractRules);
    expect(result).toHaveLength(1);
    expect(result[0].rule_type).toBe("work_cycle");
  });

  it("array vacío si nadie tiene reglas", () => {
    expect(pickEffectiveRules([], [])).toEqual([]);
  });
});
