import { describe, it, expect } from "vitest";
import { groupEmployeesMulti, type EmployeeForGrouping } from "./employee-grouping";

type E = EmployeeForGrouping & { id: string };
const mk = (id: string, first: string, loc: string | null, dept: string | null, pos: string | null): E => ({
  id, first_name: first, last_name: "X",
  location: loc ? { id: `loc-${loc}`, name: loc } : null,
  position: pos ? { id: `pos-${pos}`, name: pos, department: dept ? { id: `dep-${dept}`, name: dept } : null } : null,
});

describe("groupEmployeesMulti", () => {
  const emps: E[] = [
    mk("a", "Zoe", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("b", "Ana", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("c", "Beto", "EVI Poblado", "Dirección", "Director"),
    mk("d", "Cira", "EVI Oriente", "Lab", "Bacteriólogo"),
    mk("e", "Eve", null, null, null),
  ];

  it("2 niveles (sede→departamento): grupos A→Z, Sin asignar al final, count recursivo", () => {
    const tree = groupEmployeesMulti(emps, ["location", "department"]);
    expect(tree.map((n) => n.label)).toEqual(["EVI Oriente", "EVI Poblado", "Sin asignar"]);
    const poblado = tree.find((n) => n.label === "EVI Poblado")!;
    expect(poblado.count).toBe(3);
    expect(poblado.children!.map((n) => n.label)).toEqual(["Dirección", "Lab"]); // A→Z
    expect(poblado.employees).toBeNull();
    const lab = poblado.children!.find((n) => n.label === "Lab")!;
    expect(lab.children).toBeNull();
    expect(lab.employees!.map((e) => e.id)).toEqual(["b", "a"]); // Ana antes que Zoe (A→Z por nombre)
    expect(tree.at(-1)!.key).toBe("__unassigned__");
  });

  it("1 nivel (sede): hoja con empleados A→Z", () => {
    const tree = groupEmployeesMulti(emps, ["location"]);
    const oriente = tree.find((n) => n.label === "EVI Oriente")!;
    expect(oriente.children).toBeNull();
    expect(oriente.employees!.map((e) => e.id)).toEqual(["d"]);
  });

  it("sin niveles / none: un nodo hoja con todos, A→Z", () => {
    const tree = groupEmployeesMulti(emps, ["none"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toBeNull();
    expect(tree[0].employees!.map((e) => e.first_name)).toEqual(["Ana", "Beto", "Cira", "Eve", "Zoe"]);
  });
});
