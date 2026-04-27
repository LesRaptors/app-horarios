import { describe, it, expect } from "vitest";
import {
  diffStaffing,
  replicateAcrossDays,
  replicateShiftToShift,
  makeCellKey,
} from "./staffing-helpers";

const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";
const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";

describe("makeCellKey", () => {
  it("usa pipe como separador", () => {
    expect(makeCellKey(P1, S1, 1)).toBe(`${P1}|${S1}|1`);
  });
});

describe("diffStaffing", () => {
  it("sin cambios — todo vacío", () => {
    expect(diffStaffing({}, {})).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  it("solo inserts: persisted vacío, desired con valores > 0", () => {
    const desired = { [makeCellKey(P1, S1, 1)]: 3 };
    const r = diffStaffing({}, desired);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0]).toEqual({ position_id: P1, shift_template_id: S1, day_of_week: 1, required_count: 3 });
    expect(r.updates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo updates: misma key con distinto valor", () => {
    const persisted = { [makeCellKey(P1, S1, 1)]: 2 };
    const desired = { [makeCellKey(P1, S1, 1)]: 5 };
    const r = diffStaffing(persisted, desired);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].required_count).toBe(5);
    expect(r.deletes).toHaveLength(0);
  });

  it("solo deletes: persisted con valor, desired = 0 o ausente", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1)]: 2,
      [makeCellKey(P2, S1, 2)]: 4,
    };
    const desired = { [makeCellKey(P1, S1, 1)]: 0 };  // 0 = delete
    const r = diffStaffing(persisted, desired);
    expect(r.deletes).toHaveLength(2);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(0);
  });

  it("mezcla insert + update + delete + sin cambio", () => {
    const persisted = {
      [makeCellKey(P1, S1, 1)]: 3,  // sin cambio
      [makeCellKey(P1, S1, 2)]: 4,  // se borra
      [makeCellKey(P2, S1, 1)]: 1,  // se actualiza
    };
    const desired = {
      [makeCellKey(P1, S1, 1)]: 3,  // sin cambio
      [makeCellKey(P2, S1, 1)]: 5,  // update
      [makeCellKey(P1, S2, 3)]: 2,  // insert
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
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P2, S1, 1)]: 3,
    };
    const out = replicateAcrossDays(draft, 1, [2, 3, 4, 5], scope);
    expect(out[makeCellKey(P1, S1, 2)]).toBe(4);
    expect(out[makeCellKey(P1, S1, 5)]).toBe(4);
    expect(out[makeCellKey(P2, S1, 3)]).toBe(3);
    // No tocar el original
    expect(out[makeCellKey(P1, S1, 1)]).toBe(4);
  });

  it("override de valores existentes en target days", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S1, 2)]: 99,  // este se sobrescribe
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P1, S1, 2)]).toBe(4);
  });

  it("scope filtra: ignora posiciones fuera del scope", () => {
    const P3 = "00000000-0000-0000-0000-000000000003";
    const draft = {
      [makeCellKey(P3, S1, 1)]: 7,  // fuera del scope
    };
    const out = replicateAcrossDays(draft, 1, [2], scope);
    expect(out[makeCellKey(P3, S1, 2)]).toBeUndefined();
  });
});

describe("replicateShiftToShift", () => {
  const scope = { positionIds: [P1, P2] };

  it("copia todas las celdas de S1 a S2 manteniendo position+day", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S1, 2)]: 5,
      [makeCellKey(P2, S1, 3)]: 1,
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1)]).toBe(4);
    expect(out[makeCellKey(P1, S2, 2)]).toBe(5);
    expect(out[makeCellKey(P2, S2, 3)]).toBe(1);
    // Original sin tocar
    expect(out[makeCellKey(P1, S1, 1)]).toBe(4);
  });

  it("override de celdas existentes en S2", () => {
    const draft = {
      [makeCellKey(P1, S1, 1)]: 4,
      [makeCellKey(P1, S2, 1)]: 99,  // se sobrescribe
    };
    const out = replicateShiftToShift(draft, S1, S2, scope);
    expect(out[makeCellKey(P1, S2, 1)]).toBe(4);
  });
});
