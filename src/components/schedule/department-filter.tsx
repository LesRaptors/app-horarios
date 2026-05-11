"use client";

import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DepartmentOption {
  key: string;
  label: string;
}

interface DepartmentFilterProps {
  departments: DepartmentOption[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function DepartmentFilter({
  departments,
  selectedIds,
  onChange,
}: DepartmentFilterProps) {
  if (departments.length <= 1) return null;

  const allSelected =
    departments.length > 0 &&
    departments.every((d) => selectedIds.has(d.key));

  function toggle(key: string) {
    const next = new Set(selectedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(departments.map((d) => d.key)));
  }

  function selectNone() {
    // Always leave at least one selected to avoid an empty grid;
    // clicking "Ninguno" actually means "solo este uno", so we toggle to a
    // single-department view starting with the first.
    onChange(new Set([departments[0].key]));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card px-3 py-2">
      <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        Departamentos:
      </span>
      {departments.map((d) => {
        const selected = selectedIds.has(d.key);
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={selected}
          >
            {d.label}
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={selectAll}
          disabled={allSelected}
          className="text-xs text-primary hover:underline disabled:cursor-default disabled:opacity-40 disabled:no-underline"
        >
          Todos
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <button
          type="button"
          onClick={selectNone}
          className="text-xs text-primary hover:underline"
        >
          Solo uno
        </button>
      </div>
    </div>
  );
}
