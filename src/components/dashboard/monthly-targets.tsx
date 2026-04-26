"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { softTargetColor } from "@/lib/equity-helpers";

interface Props {
  saturdays: number;
  saturdaysTarget: number | null;
  nights: number;
  nightsTarget: number | null;
  monthLabel: string;
}

const barBg: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function TargetBar({ label, value, target }: { label: string; value: number; target: number }) {
  const color = softTargetColor(value, target);
  const pct = target > 0 ? Math.min(150, (value / target) * 100) : 0;
  return (
    <div className="text-sm">
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{value} / target {target}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", barBg[color])}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function MonthlyTargets({
  saturdays,
  saturdaysTarget,
  nights,
  nightsTarget,
  monthLabel,
}: Props) {
  const hasSat = saturdaysTarget !== null && saturdaysTarget > 0;
  const hasNight = nightsTarget !== null && nightsTarget > 0;

  if (!hasSat && !hasNight) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets del mes ({monthLabel})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSat && (
          <TargetBar label="Sábados" value={saturdays} target={saturdaysTarget} />
        )}
        {hasNight && (
          <TargetBar label="Noches" value={nights} target={nightsTarget} />
        )}
      </CardContent>
    </Card>
  );
}
