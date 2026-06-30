import { describe, it, expect } from "vitest";
import {
  diffStaffing,
  replicateAcrossDays,
  replicateShiftToShift,
  makeCellKey,
  parseCellKey,
} from "./staffing-helpers";

const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";

describe("makeCellKey", () => {
  it("usa pipe como separador con is_holiday=false", () => {
    expect(makeCellKey(P1, S1, 1, false)).toBe(`${P1}|${S1}|1|0`);
  });
});

describe("staffing CellKey con is_holiday", () => {
  it("makeCellKey/parseCellKey round-trip no-festivo", () => {
    const k = makeCellKey("p1", "s1", 3, false);
    expect(k).toBe("p1|s1|3|0");
    expect(parseCellKey(k)).toEqual({
      position_id: "p1", shift_template_id: "s1", day_of_week: 3, is_holiday: false,
    });
  });
  it("makeCellKey/parseCellKey round-trip festivo (sentinela dow=0)", () => {
    const k = makeCellKey("p1", "s1", 0, true);
    expect(k).toBe("p1|s1|0|1");
    expect(parseCellKey(k)).toEqual({
      position_id: "p1", shift_template_id: "s1", day_of_week: 0, is_holiday: true,
    });
  });
});

describe("diffStaffing", () => {
  it("sin cambios — todo vacío", () => {
    expect(diffStaffing({}, {})).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  it("solo inserts: persisted vacío, desired con valores > 0", () => {
    const desired = { [makeCellKey(P1, S1, 1, false)]: 3 };
    const r = diffStaffing({}, desired);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0]).toEqual({ position_id: P1, shift_template_id: S1, day_of_week: 1, is_holiday: false, required_count: 3 });
    expect(r.updates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo updates: misma key con distinto valor", () => {
    const persisted = { [makeCellKey(P1, S1, 1, false)]: 2 };
    const desired = { [makeCellKey(P1, S1, 1, false)]: 5 };
    const r = diffStaffing(persisted, desired);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].required_count).toBe(5);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo deletes: persisted con valor, desired = 0 o ausente", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1, false)]: 2,
      [makeCellKey(P2, S1, 2, false)]: 4,
    };
    const desired = { [makeCellKey(P1, S1, 1, false)]: 0 };  // 0 = delete
    const r = diffStaffing(persisted, desired);
    expect(r.deletes).toHaveLength(2);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(0);
  });

  it("mezcla insert + update + delete + sin cambio", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1, false)]: 3,  // sin cambio
      [makeCellKey(P1, S1, 2, false)]: 4,  // se borra
      [makeCellKey(P2, S1, 1, false)]: 1,  // se actualiza
    };
    const desired = {
      [makeCellKey(P1, S1, 1, false)]: 3,  // sin cambio
      [makeCellKey(P2, S1, 1, false)]: 5,  // update
      [makeCellKey(P1, S2, 3, false)]: 2,  // insert
    };
    const r = diffStaffing(persisted, desired);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].required_count).toBe(2);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].required_count).toBe(5);
    expect(r.deletes).toHaveLength(1);
    expect(r.deletes[0].day_of_week).toBe(2);
  });
});

describe("replicateAcrossDays", () => {
  const scope = { positionIds: [P1, P2], shiftTemplateIds: [S1] };

  it("copia day=1 (lunes) a [2,3,4,5] (martes-viernes)", () => {
    const draft = {
      [makeCellKey(P1, S1, 1, false)]: 4,
      [makeCellKey(P2, S1, 1, false)]: 3,
    };
    const out = replicateAcrossDays(draft, 1, [2, 3, 4, 5], scope);
    expect(out[makeCellKey(P1, S1, 2, false)]).toBe(4);
    expect(out[makeCellKey(P1, S1, 5, false)]).toBe(4);
    expect(out[makeCellKey(P2, S1, 3, false)]).toBe(3);
    // No tocar el original
    expect(out[makeCellKey(P1, S1, 1, false)]).toBe(4);
  });

  it("override de valores existentes en target days", () => {
    const draft = {
      [makeCellKey(P1, S1, 1, false)]: 4,
      [makeCellKey(P1, S1, 2, false)]: 99,  // este se sobrescribe
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P1, S1, 2, false)]).toBe(4);
  });

  it("scope filtra: ignora posiciones fuera del scope", () => {
    const P3 = "00000000-0000-0000-0000-000000000003";
    const draft = {
      [makeCellKey(P3, S1, 1, false)]: 7,  // fuera del scope
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P3, S1, 2, false)]).toBeUndefined();
  });
});

describe("replicateShiftToShift", () => {
  const scope = { positionIds: [P1, P2] };

  it("copia todas las celdas de S1 a S2 manteniendo position+day", () => {
    const draft = {
      [makeCellKey(P1, S1, 1, false)]: 4,
      [makeCellKey(P1, S1, 2, false)]: 5,
      [makeCellKey(P2, S1, 3, false)]: 1,
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1, false)]).toBe(4);
    expect(out[makeCellKey(P1, S2, 2, false)]).toBe(5);
    expect(out[makeCellKey(P2, S2, 3, false)]).toBe(1);
    // Original sin tocar
    expect(out[makeCellKey(P1, S1, 1, false)]).toBe(4);
  });

  it("override de celdas existentes en S2", () => {
    const draft = {
      [makeCellKey(P1, S1, 1, false)]: 4,
      [makeCellKey(P1, S2, 1, false)]: 99,  // se sobrescribe
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1, false)]).toBe(4);
  });

  it("preserva is_holiday del origen al replicar shift", () => {
    const draft = {
      [makeCellKey(P1, S1, 0, true)]: 2,  // festivo
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 0, true)]).toBe(2);
  });
});
