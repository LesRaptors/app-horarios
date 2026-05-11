"use client";

import { memo, useState } from "react";
import { Plus, Check, AlertTriangle, Clock, Pencil, X, Loader2 } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { ScheduleEntry, CapExcessKind } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ScheduleCellProps {
  entry: ScheduleEntry | null;
  canEdit: boolean;
  onClick: () => void;
  onApproveOvertime?: (entryId: string) => Promise<void> | void;
  onRejectOvertime?: (entryId: string) => Promise<void> | void;
}

const REASON_LABELS: Record<CapExcessKind, string> = {
  weekly_hours: "Horas de la semana",
  consecutive_days: "Días consecutivos",
  night_limit: "Turnos nocturnos del mes",
  sundays_quarter: "Domingos del trimestre",
  holidays_quarter: "Festivos del trimestre",
};

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function ScheduleCellInner({
  entry,
  canEdit,
  onClick,
  onApproveOvertime,
  onRejectOvertime,
}: ScheduleCellProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  if (!entry) {
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

  const isPending = entry.overtime_status === "pending";
  const isApproved = entry.overtime_status === "approved";
  const reasons = (entry.exceeds_caps ?? []).map(
    (c) => REASON_LABELS[c as CapExcessKind] ?? c,
  );
  const isCap =
    (entry.exceeds_caps ?? []).includes("sundays_quarter") ||
    (entry.exceeds_caps ?? []).includes("holidays_quarter");
  const hours = shiftHours(entry.start_time, entry.end_time);
  const tooltipBase = isPending
    ? `Pendiente de aprobación · ${hours}h${reasons.length ? ` · ${reasons.join(", ")}` : ""}`
    : isApproved
      ? "Hora extra aprobada"
      : `${hours}h`;

  const cellContent = (
    <>
      <div className="font-medium truncate">
        {formatTime(entry.start_time)}-{formatTime(entry.end_time)}
      </div>
      {entry.position && (
        <div className="truncate opacity-90">{entry.position.name}</div>
      )}
      {isPending && (
        <>
          <div
            className={`absolute inset-0 border-2 border-dashed rounded pointer-events-none ${
              isCap ? "border-red-500" : "border-amber-500"
            }`}
          />
          <div
            className={`absolute -top-1 -right-1 flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold shadow-sm ${
              isCap ? "bg-red-500 text-white" : "bg-amber-500 text-white"
            }`}
          >
            {isCap ? (
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            <span>{isCap ? "Cap" : "Extra"}</span>
          </div>
        </>
      )}
      {isApproved && (
        <Check className="absolute top-0 right-0 h-3 w-3 text-emerald-600" />
      )}
    </>
  );

  const buttonClass = "relative w-full rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80";
  const buttonStyle = {
    backgroundColor: entry.shift_template?.color || entry.position?.color || "#3b82f6",
    color: "#fff",
  };

  // When pending overtime AND we have approve/reject callbacks, wrap the cell
  // in a Popover so clicking it opens an inline approval panel.
  if (isPending && (onApproveOvertime || onRejectOvertime)) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Hora extra pendiente · ${hours}h${entry.position ? `, ${entry.position.name}` : ""}`}
            title={tooltipBase}
            className={buttonClass}
            style={buttonStyle}
          >
            {cellContent}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-3" align="start">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Hora extra · pendiente
            </div>
            <div className="mt-1 text-sm font-semibold">
              {formatTime(entry.start_time)}-{formatTime(entry.end_time)}
              <span className="ml-2 text-muted-foreground font-normal">
                ({hours}h)
              </span>
            </div>
            {entry.position && (
              <div className="text-xs text-muted-foreground">
                {entry.position.name}
              </div>
            )}
          </div>

          {reasons.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Excede:</div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r} className="flex items-start gap-1">
                    <span className="text-amber-600">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {onApproveOvertime && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("approve");
                  try {
                    await onApproveOvertime(entry.id);
                    setPopoverOpen(false);
                  } finally {
                    setBusy(null);
                  }
                }}
                className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "approve" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Aprobar
              </button>
            )}
            {onRejectOvertime && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("reject");
                  try {
                    await onRejectOvertime(entry.id);
                    setPopoverOpen(false);
                  } finally {
                    setBusy(null);
                  }
                }}
                className="flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {busy === "reject" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Rechazar
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setPopoverOpen(false);
                  onClick();
                }}
                className="flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar turno
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Turno ${formatTime(entry.start_time)}-${formatTime(entry.end_time)}${entry.position ? `, ${entry.position.name}` : ""}`}
      title={tooltipBase}
      className={buttonClass}
      style={buttonStyle}
    >
      {cellContent}
    </button>
  );
}

export const ScheduleCell = memo(ScheduleCellInner);
