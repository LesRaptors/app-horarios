"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HealthSummary } from "@/lib/schedule-health";

interface ScheduleHealthBannerProps {
  health: HealthSummary;
  onOpenPanel?: () => void;
}

export function ScheduleHealthBanner({ health, onOpenPanel }: ScheduleHealthBannerProps) {
  if (health.totalPendingExtras === 0 && health.totalGaps === 0) return null;

  const parts: string[] = [];
  if (health.totalPendingExtras > 0)
    parts.push(`${health.totalPendingExtras} ${health.totalPendingExtras === 1 ? "turno pendiente" : "turnos pendientes"} de aprobación`);
  if (health.totalGaps > 0)
    parts.push(`${health.totalGaps} ${health.totalGaps === 1 ? "turno sin cubrir" : "turnos sin cubrir"}`);

  return (
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 text-amber-900">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{parts.join(" · ")}</span>
      </div>
      <div className="flex gap-2">
        {onOpenPanel && (
          <Button variant="ghost" size="sm" onClick={onOpenPanel}>
            Ver detalle
          </Button>
        )}
        {health.totalPendingExtras > 0 && (
          <Link href="/requests">
            <Button variant="outline" size="sm">Aprobar extras</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
