export type GroupBy = "location" | "department" | "position" | "none";

export interface EmployeeForGrouping {
  location: { id: string; name: string } | null;
  position: {
    id: string;
    name: string;
    department: { id: string; name: string } | null;
  } | null;
}

export interface EmployeeGroup<T> {
  key: string;
  label: string;
  employees: T[];
}

const UNASSIGNED = "__unassigned__";

function keyLabel(emp: EmployeeForGrouping, groupBy: GroupBy): { key: string; label: string } {
  switch (groupBy) {
    case "location":
      return emp.location ? { key: emp.location.id, label: emp.location.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "department": {
      const d = emp.position?.department;
      return d ? { key: d.id, label: d.name } : { key: UNASSIGNED, label: "Sin asignar" };
    }
    case "position":
      return emp.position ? { key: emp.position.id, label: emp.position.name } : { key: UNASSIGNED, label: "Sin asignar" };
    case "none":
      return { key: "all", label: "" };
  }
}

export function groupEmployees<T extends EmployeeForGrouping>(
  employees: T[],
  groupBy: GroupBy,
): EmployeeGroup<T>[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", employees: [...employees] }];
  }
  const map = new Map<string, EmployeeGroup<T>>();
  for (const emp of employees) {
    const { key, label } = keyLabel(emp, groupBy);
    let g = map.get(key);
    if (!g) {
      g = { key, label, employees: [] };
      map.set(key, g);
    }
    g.employees.push(emp);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.label.localeCompare(b.label, "es");
  });
  return groups;
}
