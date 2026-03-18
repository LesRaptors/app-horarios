"use client";

import { Plus } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { ScheduleEntry } from "@/lib/types";

interface ScheduleCellProps {
  entry: ScheduleEntry | null;
  canEdit: boolean;
  onClick: () => void;
}

export function ScheduleCell({ entry, canEdit, onClick }: ScheduleCellProps) {
  if (entry) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
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
      </button>
    );
  }

  if (canEdit) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-full w-full items-center justify-center rounded text-muted-foreground/0 transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        <Plus className="h-3 w-3" />
      </button>
    );
  }

  return null;
}
