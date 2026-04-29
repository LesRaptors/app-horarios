import { describe, it, expect } from "vitest";
import {
  isWorkCycleRest,
} from "./rest-rules";
import type {
  WorkCycleParams,
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
