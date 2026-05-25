import { describe, it, expect } from "vitest";
import { days360, suggestVacationDays } from "./liquidacion-engine";
import { computeLiquidacion } from "./liquidacion-engine";
import type { LiquidacionInput, PayrollSettings } from "./types";

describe("days360 (convención 360 días)", () => {
  it("un año completo (1-ene a 1-ene siguiente) = 360", () => {
    expect(days360("2026-01-01", "2027-01-01")).toBe(360);
  });
  it("medio año (1-ene a 1-jul) = 180", () => {
    expect(days360("2026-01-01", "2026-07-01")).toBe(180);
  });
  it("un trimestre (1-ene a 1-abr) = 90", () => {
    expect(days360("2026-01-01", "2026-04-01")).toBe(90);
  });
  it("misma fecha = 0", () => {
    expect(days360("2026-06-15", "2026-06-15")).toBe(0);
  });
});

describe("suggestVacationDays (15 días hábiles/año proporcional)", () => {
  it("1 año completo → 15 días", () => {
    expect(suggestVacationDays("2025-04-01", "2026-04-01")).toBe(15);
  });
  it("medio año → 7.5 días", () => {
    expect(suggestVacationDays("2026-01-01", "2026-07-01")).toBe(7.5);
  });
  it("cutoff = terminación → 0 días", () => {
    expect(suggestVacationDays("2026-06-15", "2026-06-15")).toBe(0);
  });
});

const settings2026: PayrollSettings = {
  id: "s1",
  period_start: "2026-01-01",
  period_end: null,
  smmlv: 1_750_905,
  aux_transport: 249_095,
  hourly_divisor: 210,
  night_start_hour: 19,
  sunday_surcharge_pct: 0.9,
  holiday_surcharge_pct: 0.9,
  uvt: 52_374,
  updated_at: "2026-01-01",
};

// Base ≤ 2×SMMLV (3.501.810) → recibe auxilio.
// baseConAux = 2.000.000 + 249.095 = 2.249.095 ; baseSinAux = 2.000.000
function baseInput(overrides: Partial<LiquidacionInput> = {}): LiquidacionInput {
  return {
    termination_date: "2026-04-01",
    hire_date: "2024-04-01",
    reason: "renuncia",
    contract_kind: "indefinido",
    contract_end_date: null,
    cesantias_cutoff: "2026-01-01",
    vacations_cutoff: "2025-04-01",
    vacation_days_pending: 15,
    base_salary: 2_000_000,
    is_integral_salary: false,
    settings: settings2026,
    ...overrides,
  };
}

function item(out: ReturnType<typeof computeLiquidacion>, concept: string) {
  return out.items.find((i) => i.concept === concept);
}

describe("computeLiquidacion — prestaciones (renuncia, sin indemnización)", () => {
  it("cesantías = baseConAux × días/360 (90 días → 1/4)", () => {
    const out = computeLiquidacion(baseInput());
    // 2.249.095 × 90/360 = 562.273,75 → 562.274
    expect(item(out, "cesantias")!.amount).toBe(562_274);
    expect(item(out, "cesantias")!.days).toBe(90);
  });

  it("intereses cesantías = cesantías × días × 0.12 / 360", () => {
    const out = computeLiquidacion(baseInput());
    // 562.274 × 90 × 0.12 / 360 = 16.868,22 → 16.868
    expect(item(out, "cesantias_interest")!.amount).toBe(16_868);
  });

  it("prima = baseConAux × díasSemestre/360 (semestre ene-jun, 90 días)", () => {
    const out = computeLiquidacion(baseInput());
    // semestre 2026-01-01..; días360(2026-01-01,2026-04-01)=90 → 562.274
    expect(item(out, "prima")!.amount).toBe(562_274);
  });

  it("vacaciones = (baseSinAux/30) × díasPendientes", () => {
    const out = computeLiquidacion(baseInput({ vacation_days_pending: 15 }));
    // (2.000.000/30) × 15 = 1.000.000
    expect(item(out, "vacaciones")!.amount).toBe(1_000_000);
  });

  it("base salarial NO unifica auxilio: vacaciones usa baseSinAux", () => {
    const out = computeLiquidacion(baseInput());
    expect(item(out, "cesantias")!.base).toBe(2_249_095); // con auxilio
    expect(item(out, "vacaciones")!.base).toBe(2_000_000); // sin auxilio
  });

  it("total = suma de items", () => {
    const out = computeLiquidacion(baseInput());
    const sum = out.items.reduce((acc, i) => acc + i.amount, 0);
    expect(out.total).toBe(sum);
  });
});

describe("computeLiquidacion — indemnización (Art. 64)", () => {
  it("indefinido <10 SMMLV, 2 años, sin justa causa → 30 + 20 días", () => {
    const out = computeLiquidacion(
      baseInput({ reason: "sin_justa_causa", base_salary: 2_000_000 })
    );
    // años = días360(2024-04-01,2026-04-01)/360 = 720/360 = 2 → 30 + 20×1 = 50 días
    // valor día = 2.000.000/30 = 66.666,67 ; 50 × = 3.333.333,33 → 3.333.333
    expect(item(out, "indemnizacion")!.days).toBe(50);
    expect(item(out, "indemnizacion")!.amount).toBe(3_333_333);
  });

  it("indefinido ≥10 SMMLV (20M), 2 años → 20 + 15 días", () => {
    const out = computeLiquidacion(
      baseInput({ reason: "sin_justa_causa", base_salary: 20_000_000 })
    );
    // 20 + 15×1 = 35 días ; valor día = 20.000.000/30 ; 35 × = 23.333.333,33 → 23.333.333
    expect(item(out, "indemnizacion")!.days).toBe(35);
    expect(item(out, "indemnizacion")!.amount).toBe(23_333_333);
  });

  it("fijo → salarios del tiempo restante hasta contract_end_date", () => {
    const out = computeLiquidacion(
      baseInput({
        reason: "sin_justa_causa",
        contract_kind: "fijo",
        contract_end_date: "2026-10-01",
      })
    );
    // díasRestantes = días360(2026-04-01,2026-10-01)=180 ; 2.000.000 × 180/30 = 12.000.000
    expect(item(out, "indemnizacion")!.amount).toBe(12_000_000);
  });

  it("obra/labor → mínimo 15 días + warning", () => {
    const out = computeLiquidacion(
      baseInput({
        reason: "sin_justa_causa",
        contract_kind: "obra_labor",
        contract_end_date: "2026-12-01",
      })
    );
    // 2.000.000/30 × 15 = 1.000.000
    expect(item(out, "indemnizacion")!.amount).toBe(1_000_000);
    expect(out.warnings.some((w) => w.includes("obra"))).toBe(true);
  });

  it("renuncia → sin item de indemnización + warning", () => {
    const out = computeLiquidacion(baseInput({ reason: "renuncia" }));
    expect(item(out, "indemnizacion")).toBeUndefined();
    expect(out.warnings.some((w) => w.includes("indemnización"))).toBe(true);
  });
});

describe("computeLiquidacion — errors y warnings", () => {
  it("base_salary <= 0 → error", () => {
    const out = computeLiquidacion(baseInput({ base_salary: 0 }));
    expect(out.errors.some((e) => e.includes("salario"))).toBe(true);
  });

  it("fijo sin contract_end_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ contract_kind: "fijo", contract_end_date: null })
    );
    expect(out.errors.some((e) => e.includes("fecha de finalización"))).toBe(true);
  });

  it("termination_date < hire_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ hire_date: "2026-05-01", termination_date: "2026-04-01" })
    );
    expect(out.errors.some((e) => e.includes("anterior a la fecha de ingreso"))).toBe(
      true
    );
  });

  it("cesantias_cutoff > termination_date → error", () => {
    const out = computeLiquidacion(
      baseInput({ cesantias_cutoff: "2026-05-01", termination_date: "2026-04-01" })
    );
    expect(out.errors.some((e) => e.includes("corte de cesantías"))).toBe(true);
  });

  it("vacation_days_pending < 0 → error", () => {
    const out = computeLiquidacion(baseInput({ vacation_days_pending: -1 }));
    expect(out.errors.some((e) => e.includes("días de vacaciones"))).toBe(true);
  });

  it("siempre emite recordatorio de cesantías consignadas a fondo", () => {
    const out = computeLiquidacion(baseInput());
    expect(out.warnings.some((w) => w.includes("consignad"))).toBe(true);
  });

  it("salario integral (25M ≥13 SMMLV): sin cesantías ni prima, sí vacaciones", () => {
    const out = computeLiquidacion(
      baseInput({ base_salary: 25_000_000, is_integral_salary: true, vacation_days_pending: 15 })
    );
    expect(item(out, "cesantias")).toBeUndefined();
    expect(item(out, "prima")).toBeUndefined();
    expect(item(out, "vacaciones")).toBeDefined();
    expect(out.warnings.some((w) => w.includes("integral"))).toBe(true);
  });
});
