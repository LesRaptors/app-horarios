import { describe, it, expect } from "vitest";
import { aggregateEntriesForSankey, computeNetToBank, computeYtdSummary } from "./payroll-employee-helpers";
import type { PayrollEntry, PayrollProvision } from "./types";

const mkEntry = (
  concept_type: string,
  amount: number,
  is_income: boolean
): PayrollEntry => ({
  id: concept_type,
  payroll_period_id: "p1",
  employee_id: "e1",
  concept_type: concept_type as PayrollEntry["concept_type"],
  is_income,
  base: null,
  rate: null,
  amount,
  description: null,
  is_manual_override: false,
  created_at: "2026-04-01T00:00:00Z",
});

describe("aggregateEntriesForSankey", () => {
  it("standard case: 4 incomes + 2 deductions + neto", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    const r = aggregateEntriesForSankey(entries, 2_825_095);

    // Origins: salary, transport (2 nodes)
    expect(r.nodes.filter((n) => n.category === "origin")).toHaveLength(2);
    // Hub: 1
    expect(r.nodes.filter((n) => n.category === "hub")).toHaveLength(1);
    // Destinations: tu cuenta + salud + pensión (3 nodes)
    expect(r.nodes.filter((n) => n.category === "destination")).toHaveLength(3);
    // Links: 2 origins → hub + 3 hub → destinations = 5
    expect(r.links).toHaveLength(5);
  });

  it("skips $0 entries", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 0, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("solidarity_pension", 0, false),
    ];
    const r = aggregateEntriesForSankey(entries, 2_688_000);
    const labels = r.nodes.map((n) => n.label);
    expect(labels).not.toContain("Auxilio de transporte");
    expect(labels).not.toContain("Solidaridad pensional");
  });

  it("Q1 advance: only salary + transport, no destinations except 'Tu cuenta'", () => {
    const entries = [
      mkEntry("salary", 1_400_000, true),
      mkEntry("transport", 124_548, true),
    ];
    const r = aggregateEntriesForSankey(entries, 1_524_548);
    expect(r.nodes.filter((n) => n.category === "destination"))
      .toHaveLength(1); // Just Tu cuenta
  });

  it("empty entries → empty sankey", () => {
    const r = aggregateEntriesForSankey([], 0);
    expect(r.nodes).toHaveLength(0);
    expect(r.links).toHaveLength(0);
  });
});

describe("computeNetToBank", () => {
  it("devengado − deducciones", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    expect(computeNetToBank(entries)).toBe(2_825_095);
  });

  it("with retención", () => {
    const entries = [
      mkEntry("salary", 5_000_000, true),
      mkEntry("health_employee", 200_000, false),
      mkEntry("pension_employee", 200_000, false),
      mkEntry("income_tax", 100_000, false),
    ];
    expect(computeNetToBank(entries)).toBe(4_500_000);
  });

  it("empty → 0", () => {
    expect(computeNetToBank([])).toBe(0);
  });
});

const mkProvision = (
  concept: PayrollProvision["concept"],
  amount: number,
  ytd: number
): PayrollProvision => ({
  id: concept,
  payroll_period_id: "p1",
  employee_id: "e1",
  concept,
  base: amount,
  rate: 0.0833,
  amount,
  accumulated_ytd: ytd,
  created_at: "2026-04-01T00:00:00Z",
});

describe("computeYtdSummary", () => {
  it("aggregates entries + uses last accumulated_ytd from provisions", () => {
    const entries = [
      mkEntry("salary", 2_800_000, true),
      mkEntry("transport", 249_095, true),
      mkEntry("health_employee", 112_000, false),
      mkEntry("pension_employee", 112_000, false),
    ];
    const provisions = [
      mkProvision("cesantias", 253_990, 1_080_000),
      mkProvision("cesantias_interest", 2_540, 12_500),
      mkProvision("prima", 253_990, 1_080_000),
      mkProvision("vacaciones", 116_760, 469_000),
    ];

    const r = computeYtdSummary(entries, provisions, 2026);
    expect(r.devengado).toBe(3_049_095);
    expect(r.deducciones).toBe(224_000);
    expect(r.neto).toBe(2_825_095);
    expect(r.cesantiasYtd).toBe(1_080_000);
    expect(r.primaYtd).toBe(1_080_000);
    expect(r.vacacionesYtd).toBe(469_000);
    expect(r.cesantiasInterestYtd).toBe(12_500);
  });

  it("empty → all zeros", () => {
    const r = computeYtdSummary([], [], 2026);
    expect(r.devengado).toBe(0);
    expect(r.deducciones).toBe(0);
    expect(r.neto).toBe(0);
    expect(r.cesantiasYtd).toBe(0);
  });
});
