import { describe, it, expect } from "vitest";
import { groupEmployeesMulti, type EmployeeForGrouping } from "./employee-grouping";

type E = EmployeeForGrouping & { id: string };
const mk = (
  id: string,
  first: string,
  last: string,
  loc: string | null,
  dept: string | null,
  pos: string | null,
): E => ({
  id, first_name: first, last_name: last,
  location: loc ? { id: `loc-${loc}`, name: loc } : null,
  position: pos ? { id: `pos-${pos}`, name: pos, department: dept ? { id: `dep-${dept}`, name: dept } : null } : null,
});

describe("groupEmployeesMulti", () => {
  // Apellidos distintos a propósito: el orden es por apellido → nombre.
  const emps: E[] = [
    mk("a", "Zoe", "Álvarez", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("b", "Ana", "Núñez", "EVI Poblado", "Lab", "Bacteriólogo"),
    mk("c", "Beto", "Díaz", "EVI Poblado", "Dirección", "Director"),
    mk("d", "Cira", "Mejía", "EVI Oriente", "Lab", "Bacteriólogo"),
    mk("e", "Eve", "Zúñiga", null, null, null),
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
    expect(lab.employees!.map((e) => e.id)).toEqual(["a", "b"]); // Álvarez antes que Núñez (A→Z por apellido)
    expect(tree.at(-1)!.key).toBe("__unassigned__");
  });

  it("1 nivel (sede): hoja con empleados A→Z", () => {
    const tree = groupEmployeesMulti(emps, ["location"]);
    const oriente = tree.find((n) => n.label === "EVI Oriente")!;
    expect(oriente.children).toBeNull();
    expect(oriente.employees!.map((e) => e.id)).toEqual(["d"]);
  });

  it("1 nivel (posición): key/label desde la posición, Sin asignar para los sin posición", () => {
    const tree = groupEmployeesMulti(emps, ["position"]);
    expect(tree.map((n) => n.label)).toEqual(["Bacteriólogo", "Director", "Sin asignar"]);
    const bacteriologo = tree.find((n) => n.label === "Bacteriólogo")!;
    expect(bacteriologo.key).toBe("pos-Bacteriólogo");
    expect(bacteriologo.count).toBe(3); // a, b, d
    const sinAsignar = tree.at(-1)!;
    expect(sinAsignar.key).toBe("__unassigned__");
    expect(sinAsignar.label).toBe("Sin asignar");
    expect(sinAsignar.employees!.map((e) => e.id)).toEqual(["e"]);
  });

  it("sin niveles / none: un nodo hoja con todos, ordenados por apellido", () => {
    const tree = groupEmployeesMulti(emps, ["none"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toBeNull();
    // Álvarez, Díaz, Mejía, Núñez, Zúñiga.
    expect(tree[0].employees!.map((e) => e.last_name)).toEqual([
      "Álvarez", "Díaz", "Mejía", "Núñez", "Zúñiga",
    ]);
  });
});
