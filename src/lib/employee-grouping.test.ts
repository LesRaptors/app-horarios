import { describe, it, expect } from "vitest";
import { groupEmployees, type EmployeeForGrouping } from "./employee-grouping";

type E = EmployeeForGrouping & { id: string };
const mk = (id: string, loc: string | null, dept: string | null, pos: string | null): E => ({
  id,
  location: loc ? { id: `loc-${loc}`, name: loc } : null,
  position: pos ? { id: `pos-${pos}`, name: pos, department: dept ? { id: `dep-${dept}`, name: dept } : null } : null,
});

describe("groupEmployees", () => {
  const emps: E[] = [
    mk("a", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("b", "EVI Oriente", "Lab", "Bacteriólogo"),
    mk("c", "EVI Poblado", "Dirección", "Directora"),
    mk("d", null, null, null), // sin asignar
  ];

  it("agrupa por sede, orden alfabético, Sin asignar al final", () => {
    const g = groupEmployees(emps, "location");
    expect(g.map((x) => x.label)).toEqual(["EVI Oriente", "EVI Poblado", "Sin asignar"]);
    expect(g.find((x) => x.label === "EVI Poblado")!.employees.map((e) => e.id)).toEqual(["a", "c"]);
    expect(g.at(-1)!.key).toBe("__unassigned__");
  });

  it("agrupa por departamento", () => {
    const g = groupEmployees(emps, "department");
    expect(g.map((x) => x.label)).toEqual(["Dirección", "Lab", "Sin asignar"]);
  });

  it("agrupa por posición", () => {
    const g = groupEmployees(emps, "position");
    expect(g.map((x) => x.label).sort()).toEqual(["Bacteriólogo", "Directora", "Sin asignar"]);
  });

  it("none devuelve un grupo con todos", () => {
    const g = groupEmployees(emps, "none");
    expect(g).toHaveLength(1);
    expect(g[0].employees).toHaveLength(4);
  });
});
