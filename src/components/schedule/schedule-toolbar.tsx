"use client";

import { ChevronLeft, ChevronRight, Send, Archive, Wand2, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTHS, SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Location, ScheduleStatus } from "@/lib/types";

interface ScheduleToolbarProps {
  locations: Location[];
  selectedLocationId: string;
  onLocationChange: (id: string) => void;
  month: number;
  year: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  scheduleStatus: ScheduleStatus | null;
  onCreateDraft: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onAutoGenerate?: () => void;
  onClearDraft?: () => void;
  isAdmin: boolean;
  isManager: boolean;
  saving: boolean;
}

export function ScheduleToolbar({
  locations,
  selectedLocationId,
  onLocationChange,
  month,
  year,
  onPrevMonth,
  onNextMonth,
  scheduleStatus,
  onCreateDraft,
  onPublish,
  onArchive,
  onAutoGenerate,
  onClearDraft,
  isAdmin,
  isManager,
  saving,
}: ScheduleToolbarProps) {
  const canManage = isAdmin || isManager;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {/* Location select */}
        <Select value={selectedLocationId} onValueChange={onLocationChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Seleccionar sede" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPrevMonth} aria-label="Mes anterior">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-[140px] text-center font-medium">
            {MONTHS[month]} {year}
          </div>
          <Button variant="outline" size="icon" onClick={onNextMonth} aria-label="Mes siguiente">
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Status badge */}
        {scheduleStatus && (
          <Badge
            className={cn(
              "text-xs",
              SCHEDULE_STATUS_COLORS[scheduleStatus]
            )}
          >
            {SCHEDULE_STATUS_LABELS[scheduleStatus]}
          </Badge>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-2">
          {!scheduleStatus && (
            <Button onClick={onCreateDraft} disabled={saving || !selectedLocationId}>
              Crear borrador
            </Button>
          )}
          {scheduleStatus === "draft" && onAutoGenerate && (
            <Button variant="outline" onClick={onAutoGenerate} disabled={saving}>
              <Wand2 className="mr-2 h-4 w-4" />
              Auto-generar
            </Button>
          )}
          {scheduleStatus === "draft" && onClearDraft && (
            <Button variant="outline" onClick={onClearDraft} disabled={saving}>
              <Eraser className="mr-2 h-4 w-4" />
              Limpiar borrador
            </Button>
          )}
          {scheduleStatus === "draft" && (
            <Button onClick={onPublish} disabled={saving}>
              <Send className="mr-2 h-4 w-4" />
              Publicar
            </Button>
          )}
          {scheduleStatus === "published" && (
            <Button variant="outline" onClick={onArchive} disabled={saving}>
              <Archive className="mr-2 h-4 w-4" />
              Archivar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
