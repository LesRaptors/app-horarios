"use client";

import { Fragment, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn, getDayAbbreviation, isWeekend, formatDateISO, entryMapKey } from "@/lib/utils";
import { ScheduleCell } from "./schedule-cell";
import type { Profile, ScheduleEntry } from "@/lib/types";

interface ScheduleCalendarGridProps {
  dates: Date[];
  employees: Profile[];
  entryMap: Record<string, ScheduleEntry>;
  canEdit: boolean;
  onCellClick: (employeeId: string, date: string, entry: ScheduleEntry | null) => void;
}

interface ProfileWithDepartment extends Profile {
  position?: (Profile["position"] & { department?: { id: string; name: string } | null }) | null;
}

const NO_DEPARTMENT_KEY = "__sin_departamento__";
const NO_DEPARTMENT_LABEL = "Sin departamento";

export function ScheduleCalendarGrid({
  dates,
  employees,
  entryMap,
  canEdit,
  onCellClick,
}: ScheduleCalendarGridProps) {
  const [showInactive, setShowInactive] = useState(false);

  const { groupedActive, inactive } = useMemo(() => {
    const empWithEntries = new Set<string>();
    for (const entry of Object.values(entryMap)) {
      empWithEntries.add(entry.employee_id);
    }

    const active: ProfileWithDepartment[] = [];
    const noEntries: ProfileWithDepartment[] = [];
    for (const e of employees as ProfileWithDepartment[]) {
      if (empWithEntries.has(e.id)) active.push(e);
      else noEntries.push(e);
    }

    type Group = { key: string; label: string; employees: ProfileWithDepartment[] };
    const groupMap = new Map<string, Group>();
    for (const emp of active) {
      const dep = emp.position?.department;
      const key = dep?.id ?? NO_DEPARTMENT_KEY;
      const label = dep?.name ?? NO_DEPARTMENT_LABEL;
      const existing = groupMap.get(key);
      if (existing) {
        existing.employees.push(emp);
      } else {
        groupMap.set(key, { key, label, employees: [emp] });
      }
    }

    const groups = Array.from(groupMap.values()).map((g) => ({
      ...g,
      employees: [...g.employees].sort((a, b) => {
        const ln = (a.last_name ?? "").localeCompare(b.last_name ?? "", "es");
        if (ln !== 0) return ln;
        return (a.first_name ?? "").localeCompare(b.first_name ?? "", "es");
      }),
    }));
    groups.sort((a, b) => {
      if (a.key === NO_DEPARTMENT_KEY) return 1;
      if (b.key === NO_DEPARTMENT_KEY) return -1;
      return a.label.localeCompare(b.label, "es");
    });

    const inactiveSorted = [...noEntries].sort((a, b) => {
      const ln = (a.last_name ?? "").localeCompare(b.last_name ?? "", "es");
      if (ln !== 0) return ln;
      return (a.first_name ?? "").localeCompare(b.first_name ?? "", "es");
    });

    return { groupedActive: groups, inactive: inactiveSorted };
  }, [employees, entryMap]);

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No hay empleados asignados a esta sede.
      </div>
    );
  }

  const totalCols = dates.length;
  const inactiveCount = inactive.length;

  return (
    <div className="space-y-2">
      {inactiveCount > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {inactiveCount === 1
              ? "1 empleado sin turnos asignados"
              : `${inactiveCount} empleados sin turnos asignados`}
          </span>
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showInactive ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <div
          className="min-w-max"
          style={{
            display: "grid",
            gridTemplateColumns: `220px repeat(${totalCols}, minmax(72px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="sticky left-0 z-10 border-b border-r bg-card p-2 text-sm font-medium">
            Empleado
          </div>
          {dates.map((date) => {
            const weekend = isWeekend(date);
            return (
              <div
                key={date.toISOString()}
                className={cn(
                  "border-b p-1 text-center text-xs",
                  weekend ? "bg-muted/50" : "bg-card"
                )}
              >
                <div className="font-medium">{getDayAbbreviation(date)}</div>
                <div className="text-muted-foreground">{date.getDate()}</div>
              </div>
            );
          })}

          {/* Grouped active employees */}
          {groupedActive.map((group) => (
            <Fragment key={`group-${group.key}`}>
              <DepartmentHeader label={group.label} totalCols={totalCols} />
              {group.employees.map((employee) => (
                <EmployeeRow
                  key={employee.id}
                  employee={employee}
                  dates={dates}
                  entryMap={entryMap}
                  canEdit={canEdit}
                  onCellClick={onCellClick}
                />
              ))}
            </Fragment>
          ))}

          {/* Inactive (sin turnos) */}
          {showInactive && inactive.length > 0 && (
            <Fragment>
              <DepartmentHeader
                label="Sin turnos asignados"
                totalCols={totalCols}
                muted
              />
              {inactive.map((employee) => (
                <EmployeeRow
                  key={employee.id}
                  employee={employee}
                  dates={dates}
                  entryMap={entryMap}
                  canEdit={canEdit}
                  onCellClick={onCellClick}
                  inactive
                />
              ))}
            </Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function DepartmentHeader({
  label,
  totalCols,
  muted = false,
}: {
  label: string;
  totalCols: number;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky left-0 z-10 col-span-full border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
        muted ? "bg-muted/30 text-muted-foreground" : "bg-muted/60 text-foreground"
      )}
      style={{ gridColumn: `1 / span ${totalCols + 1}` }}
    >
      {label}
    </div>
  );
}

function EmployeeRow({
  employee,
  dates,
  entryMap,
  canEdit,
  onCellClick,
  inactive = false,
}: {
  employee: ProfileWithDepartment;
  dates: Date[];
  entryMap: Record<string, ScheduleEntry>;
  canEdit: boolean;
  onCellClick: (employeeId: string, date: string, entry: ScheduleEntry | null) => void;
  inactive?: boolean;
}) {
  return (
    <Fragment>
      <div
        className={cn(
          "sticky left-0 z-10 flex items-center border-b border-r bg-card px-2 py-1",
          inactive && "opacity-60"
        )}
      >
        <div className="truncate text-sm">
          <div
            className={cn(
              "font-medium",
              employee.is_demo && "italic text-muted-foreground/70"
            )}
          >
            {employee.first_name} {employee.last_name}
            {employee.is_demo && (
              <span className="ml-1 text-[10px] font-normal text-yellow-600">
                (Demo)
              </span>
            )}
          </div>
          {employee.position && (
            <div className="truncate text-xs text-muted-foreground">
              {employee.position.name}
            </div>
          )}
        </div>
      </div>

      {dates.map((date) => {
        const dateStr = formatDateISO(date);
        const key = entryMapKey(employee.id, dateStr);
        const entry = entryMap[key] || null;
        const weekend = isWeekend(date);

        return (
          <div
            key={`${employee.id}-${dateStr}`}
            className={cn(
              "min-h-12 border-b p-0.5",
              weekend ? "bg-muted/30" : ""
            )}
          >
            <ScheduleCell
              entry={entry}
              canEdit={canEdit}
              onClick={() => onCellClick(employee.id, dateStr, entry)}
            />
          </div>
        );
      })}
    </Fragment>
  );
}
