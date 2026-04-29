import { describe, it, expect } from "vitest";
import {
  isWorkCycleRest,
  isWeekendRotationRest,
} from "./rest-rules";
import type {
  WorkCycleParams,
  WeekendRotationParams,
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
