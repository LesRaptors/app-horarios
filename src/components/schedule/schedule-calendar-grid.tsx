"use client";

import { Fragment, useMemo, useState } from "react";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import { cn, getDayAbbreviation, isWeekend, formatDateISO, entryMapKey, formatTime } from "@/lib/utils";
import { ScheduleCell } from "./schedule-cell";
import type { Profile, ScheduleEntry } from "@/lib/types";
import type { HealthGap } from "@/lib/schedule-health";

interface PositionMeta {
  name: string;
  department?: { id: string; name: string } | null;
}

interface ShiftTemplateMeta {
  name: string;
  start_time: string;
  end_time: string;
}

interface ScheduleCalendarGridProps {
  dates: Date[];
  employees: Profile[];
  entryMap: Record<string, ScheduleEntry>;
  canEdit: boolean;
  onCellClick: (employeeId: string, date: string, entry: ScheduleEntry | null) => void;
  onGapClick?: (positionId: string, date: string, shiftTemplateId: string) => void;
  gaps?: HealthGap[];
  positionsById?: Record<string, PositionMeta>;
  shiftTemplatesById?: Record<string, ShiftTemplateMeta>;
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
  onGapClick,
  gaps = [],
  positionsById = {},
  shiftTemplatesById = {},
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

  // Index gaps: position -> date -> shiftTemplateId[] (un slot puede repetirse si required_count > 1)
  const gapsByPosition = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const g of gaps) {
      const byDate = map.get(g.positionId) ?? new Map<string, string[]>();
      const list = byDate.get(g.date) ?? [];
      list.push(g.shiftTemplateId);
      byDate.set(g.date, list);
      map.set(g.positionId, byDate);
    }
    return map;
  }, [gaps]);

  // Group positions with gaps by department (so they render inside the right group)
  const gapPositionsByDepartment = useMemo(() => {
    const map = new Map<string, { departmentLabel: string; positionIds: string[] }>();
    for (const positionId of Array.from(gapsByPosition.keys())) {
      const meta = positionsById[positionId];
      const dep = meta?.department;
      const key = dep?.id ?? NO_DEPARTMENT_KEY;
      const label = dep?.name ?? NO_DEPARTMENT_LABEL;
      const existing = map.get(key);
      if (existing) existing.positionIds.push(positionId);
      else map.set(key, { departmentLabel: label, positionIds: [positionId] });
    }
    // Sort position ids alphabetically by name within each group
    for (const entry of Array.from(map.values())) {
      entry.positionIds.sort((a, b) =>
        (positionsById[a]?.name ?? "").localeCompare(positionsById[b]?.name ?? "", "es")
      );
    }
    return map;
  }, [gapsByPosition, positionsById]);

  // Department keys that already render via active employees → avoid duplicating header
  const employeeGroupKeys = useMemo(
    () => new Set(groupedActive.map((g) => g.key)),
    [groupedActive],
  );

  // Department keys that have gaps but no employees with entries (need their own header)
  const orphanGapGroupKeys = useMemo(() => {
    const keys: string[] = [];
    for (const k of Array.from(gapPositionsByDepartment.keys())) {
      if (!employeeGroupKeys.has(k)) keys.push(k);
    }
    keys.sort((a, b) => {
      if (a === NO_DEPARTMENT_KEY) return 1;
      if (b === NO_DEPARTMENT_KEY) return -1;
      const la = gapPositionsByDepartment.get(a)?.departmentLabel ?? "";
      const lb = gapPositionsByDepartment.get(b)?.departmentLabel ?? "";
      return la.localeCompare(lb, "es");
    });
    return keys;
  }, [gapPositionsByDepartment, employeeGroupKeys]);

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

          {/* Grouped active employees + gap rows for the same group */}
          {groupedActive.map((group) => {
            const gapEntry = gapPositionsByDepartment.get(group.key);
            return (
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
                {gapEntry?.positionIds.map((posId) => (
                  <GapRow
                    key={`gap-${posId}`}
                    positionId={posId}
                    positionName={positionsById[posId]?.name ?? "Posición"}
                    dates={dates}
                    gapsByDate={gapsByPosition.get(posId) ?? new Map()}
                    shiftTemplatesById={shiftTemplatesById}
                    canEdit={canEdit}
                    onGapClick={onGapClick}
                  />
                ))}
              </Fragment>
            );
          })}

          {/* Departments that ONLY have gaps (no employees with entries) */}
          {orphanGapGroupKeys.map((key) => {
            const entry = gapPositionsByDepartment.get(key);
            if (!entry) return null;
            return (
              <Fragment key={`gap-only-${key}`}>
                <DepartmentHeader label={entry.departmentLabel} totalCols={totalCols} />
                {entry.positionIds.map((posId) => (
                  <GapRow
                    key={`gap-${posId}`}
                    positionId={posId}
                    positionName={positionsById[posId]?.name ?? "Posición"}
                    dates={dates}
                    gapsByDate={gapsByPosition.get(posId) ?? new Map()}
                    shiftTemplatesById={shiftTemplatesById}
                    canEdit={canEdit}
                    onGapClick={onGapClick}
                  />
                ))}
              </Fragment>
            );
          })}

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

function GapRow({
  positionId,
  positionName,
  dates,
  gapsByDate,
  shiftTemplatesById,
  canEdit = false,
  onGapClick,
}: {
  positionId: string;
  positionName: string;
  dates: Date[];
  gapsByDate: Map<string, string[]>;
  shiftTemplatesById: Record<string, ShiftTemplateMeta>;
  canEdit?: boolean;
  onGapClick?: (positionId: string, date: string, shiftTemplateId: string) => void;
}) {
  const totalGaps = Array.from(gapsByDate.values()).reduce((sum, arr) => sum + arr.length, 0);
  return (
    <Fragment>
      <div className="sticky left-0 z-10 flex items-center gap-1.5 border-b border-r bg-red-50 dark:bg-red-950/30 px-2 py-1">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="truncate text-sm">
          <div className="font-medium text-red-700 dark:text-red-300">Sin cubrir</div>
          <div className="truncate text-xs text-red-600/80 dark:text-red-400/80">
            {positionName} · {totalGaps}
          </div>
        </div>
      </div>

      {dates.map((date) => {
        const dateStr = formatDateISO(date);
        const dayGaps = gapsByDate.get(dateStr) ?? [];
        const weekend = isWeekend(date);

        return (
          <div
            key={`gap-${positionId}-${dateStr}`}
            className={cn(
              "min-h-12 border-b p-0.5",
              weekend ? "bg-muted/30" : ""
            )}
          >
            {dayGaps.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {dayGaps.map((tplId, idx) => {
                  const tpl = shiftTemplatesById[tplId];
                  const clickable = canEdit && !!onGapClick;
                  const content = (
                    <>
                      <div className="font-medium">
                        {tpl ? `${formatTime(tpl.start_time)}-${formatTime(tpl.end_time)}` : "Faltante"}
                      </div>
                      <div className="truncate opacity-80">
                        {clickable ? "Asignar" : "Faltante"}
                      </div>
                    </>
                  );
                  const className = cn(
                    "rounded border-2 border-dashed border-red-500 bg-red-50 px-1 py-0.5 text-[11px] leading-tight text-red-700 dark:bg-red-950/40 dark:text-red-300",
                    clickable && "cursor-pointer hover:bg-red-100 hover:border-red-600 dark:hover:bg-red-900/40 text-left w-full",
                  );
                  const titleText = clickable
                    ? `Asignar ${tpl?.name ?? "turno"} de ${positionName}`
                    : `Falta cubrir ${tpl?.name ?? "turno"} de ${positionName}`;
                  return clickable ? (
                    <button
                      key={`${tplId}-${idx}`}
                      type="button"
                      onClick={() => onGapClick!(positionId, dateStr, tplId)}
                      className={className}
                      title={titleText}
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={`${tplId}-${idx}`}
                      className={className}
                      title={titleText}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Fragment>
  );
}
