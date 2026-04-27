"use client";

import { Input } from "@/components/ui/input";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

interface StaffingCellProps {
  value: number;
  capacity: number;
  recentCoverage: number[];
  onChange: (value: number) => void;
  ariaLabel?: string;
}

export function StaffingCell({
  value,
  capacity,
  recentCoverage,
  onChange,
  ariaLabel,
}: StaffingCellProps) {
  const exceeds = capacity > 0 && value > capacity;
  const noCapacity = capacity === 0 && value > 0;
  const bandClass = exceeds || noCapacity
    ? "bg-amber-50 border-amber-300"
    : "border-input";

  return (
    <div className={cn("rounded border px-1 py-0.5 flex flex-col items-stretch gap-0.5", bandClass)}>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={99}
          value={value === 0 ? "" : value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="h-6 w-10 px-1 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={ariaLabel}
        />
        <span
          className={cn(
            "text-[10px] tabular-nums",
            capacity === 0 ? "text-red-500" : "text-muted-foreground"
          )}
          title={`Capacidad teórica: ${capacity} empleados con esta posición en la sede`}
        >
          ·{capacity}
        </span>
      </div>
      <Sparkline values={recentCoverage} className="self-end" />
    </div>
  );
}
