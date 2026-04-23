"use client";

import { memo } from "react";
import { Plus, Check } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { ScheduleEntry } from "@/lib/types";

interface ScheduleCellProps {
  entry: ScheduleEntry | null;
  canEdit: boolean;
  onClick: () => void;
}

function ScheduleCellInner({ entry, canEdit, onClick }: ScheduleCellProps) {
  if (entry) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Turno ${formatTime(entry.start_time)}-${formatTime(entry.end_time)}${entry.position ? `, ${entry.position.name}` : ""}`}
        className="relative w-full rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
        style={{
          backgroundColor: entry.shift_template?.color || entry.position?.color || "#3b82f6",
          color: "#fff",
        }}
      >
        <div className="font-medium truncate">
          {formatTime(entry.start_time)}-{formatTime(entry.end_time)}
        </div>
        {entry.position && (
          <div className="truncate opacity-90">{entry.position.name}</div>
        )}
        {entry && entry.overtime_status === "pending" && (
          <>
            <div
              className={`absolute inset-0 border-2 border-dashed rounded pointer-events-none ${
                entry.exceeds_caps.includes("sundays_quarter") ||
                entry.exceeds_caps.includes("holidays_quarter")
                  ? "border-red-400"
                  : "border-amber-400"
              }`}
            />
            <div className="absolute top-0 right-0 text-[9px] px-1 bg-white/80 rounded-bl font-medium">
              {entry.exceeds_caps.includes("sundays_quarter") ||
               entry.exceeds_caps.includes("holidays_quarter")
                ? "⚠ cap"
                : "⏱ extra"}
            </div>
          </>
        )}
        {entry && entry.overtime_status === "approved" && (
          <Check className="absolute top-0 right-0 h-3 w-3 text-emerald-600" />
        )}
      </button>
    );
  }

  if (canEdit) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Agregar turno"
        className="flex h-full w-full items-center justify-center rounded text-muted-foreground/0 transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        <Plus className="size-3" aria-hidden="true" />
      </button>
    );
  }

  return null;
}

export const ScheduleCell = memo(ScheduleCellInner);
