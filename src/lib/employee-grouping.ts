export type GroupBy = "location" | "department" | "position" | "none";

export interface EmployeeForGrouping {
  first_name: string;
  last_name: string;
  location: { id: string; name: string } | null;
  position: { id: string; name: string; department: { id: string; name: string } | null } | null;
}

export interface GroupNode<T> {
  key: string;
  label: string;
  count: number;
  children: GroupNode<T>[] | null; // nodo interno
  employees: T[] | null;           // nodo hoja
}

const UNASSIGNED = "__unassigned__";

function keyLabel(emp: EmployeeForGrouping, level: Exclude<GroupBy, "none">): { key: string; label: string } {
  switch (level) {
    case "location":
      return emp.location ? { key: emp.location.id, label: emp.location.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "department": {
      const d = emp.position?.department;
      return d ? { key: d.id, label: d.name } : { key: UNASSIGNED, label: "Sin asignar" };
    }
    case "position":
      return emp.position ? { key: emp.position.id, label: emp.position.name } : { key: UNASSIGNED, label: "Sin asignar" };
  }
}

function sortEmployees<T extends EmployeeForGrouping>(emps: T[]): T[] {
  return [...emps].sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "es"),
  );
}

function sortNodes<T>(nodes: GroupNode<T>[]): GroupNode<T>[] {
  return nodes.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.label.localeCompare(b.label, "es");
  });
}

function buildLevel<T extends EmployeeForGrouping>(employees: T[], levels: Exclude<GroupBy, "none">[]): GroupNode<T>[] {
  const [level, ...rest] = levels;
  const map = new Map<string, { label: string; emps: T[] }>();
  for (const emp of employees) {
    const { key, label } = keyLabel(emp, level);
    let g = map.get(key);
    if (!g) { g = { label, emps: [] }; map.set(key, g); }
    g.emps.push(emp);
  }
  const nodes: GroupNode<T>[] = [];
  for (const [key, { label, emps }] of map) {
    nodes.push(
      rest.length > 0
        ? { key, label, count: emps.length, children: buildLevel(emps, rest), employees: null }
        : { key, label, count: emps.length, children: null, employees: sortEmployees(emps) },
    );
  }
  return sortNodes(nodes);
}

export function groupEmployeesMulti<T extends EmployeeForGrouping>(
  employees: T[],
  levels: GroupBy[],
): GroupNode<T>[] {
  const real = levels.filter((l): l is Exclude<GroupBy, "none"> => l !== "none");
  if (real.length === 0) {
    return [{ key: "all", label: "", count: employees.length, children: null, employees: sortEmployees(employees) }];
  }
  return buildLevel(employees, real);
}
