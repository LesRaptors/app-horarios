"use client";

import { Check } from "lucide-react";

interface Props {
  label: string;
  value: number;
  max: number;
}

export function CapBar({ label, value, max }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const overCap = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className={overCap ? "text-red-600 font-medium" : ""}>
          {value}/{max} {overCap && "⚠"}
          {!overCap && value === max && (
            <Check className="inline h-3 w-3 text-emerald-600 ml-1" />
          )}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${
            overCap ? "bg-red-500" : value === max ? "bg-emerald-500" : "bg-blue-500"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
