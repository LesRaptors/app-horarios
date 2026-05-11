"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { Position, ShiftTemplate, ScheduleEntry, Profile } from "@/lib/types";

type DialogMode = "employee" | "gap";

interface ShiftAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: DialogMode;
  entry: ScheduleEntry | null;
  // Employee mode
  employeeName?: string;
  // Gap mode
  eligibleEmployees?: Profile[];
  initialPositionId?: string;
  initialShiftTemplateId?: string;
  // Shared
  dateLabel: string;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  saving: boolean;
  onSave: (data: {
    employee_id?: string;
    position_id: string;
    start_time: string;
    end_time: string;
    shift_template_id: string | null;
    notes: string;
  }) => void;
  onDelete: () => void;
}

export function ShiftAssignDialog({
  open,
  onOpenChange,
  mode = "employee",
  entry,
  employeeName,
  eligibleEmployees = [],
  initialPositionId,
  initialShiftTemplateId,
  dateLabel,
  positions,
  shiftTemplates,
  saving,
  onSave,
  onDelete,
}: ShiftAssignDialogProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [templateId, setTemplateId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;

    if (mode === "gap") {
      const tpl = initialShiftTemplateId
        ? shiftTemplates.find((t) => t.id === initialShiftTemplateId)
        : null;
      setEmployeeId(eligibleEmployees[0]?.id ?? "");
      setPositionId(initialPositionId ?? positions[0]?.id ?? "");
      setTemplateId(initialShiftTemplateId ?? "");
      setStartTime(tpl ? formatTime(tpl.start_time) : "06:00");
      setEndTime(tpl ? formatTime(tpl.end_time) : "14:00");
      setNotes("");
      return;
    }

    if (entry) {
      setPositionId(entry.position_id);
      setStartTime(formatTime(entry.start_time));
      setEndTime(formatTime(entry.end_time));
      setTemplateId(entry.shift_template_id || "");
      setNotes(entry.notes || "");
    } else {
      setPositionId(positions[0]?.id || "");
      setStartTime("06:00");
      setEndTime("14:00");
      setTemplateId("");
      setNotes("");
    }
  }, [open, mode, entry, positions, shiftTemplates, eligibleEmployees, initialPositionId, initialShiftTemplateId]);

  function handleTemplateChange(id: string) {
    if (id === "manual") {
      setTemplateId("");
      return;
    }
    setTemplateId(id);
    const template = shiftTemplates.find((t) => t.id === id);
    if (template) {
      setStartTime(formatTime(template.start_time));
      setEndTime(formatTime(template.end_time));
    }
  }

  function handleSubmit() {
    onSave({
      employee_id: mode === "gap" ? employeeId : undefined,
      position_id: positionId,
      start_time: startTime,
      end_time: endTime,
      shift_template_id: templateId || null,
      notes: notes.trim(),
    });
  }

  const isGap = mode === "gap";
  const headerSubject = isGap
    ? "Cubrir faltante"
    : entry
      ? "Editar turno"
      : "Asignar turno";
  const submitLabel = isGap
    ? "Asignar faltante"
    : entry
      ? "Guardar cambios"
      : "Asignar turno";
  const description = isGap
    ? dateLabel
    : `${employeeName ?? ""} — ${dateLabel}`;
  const noEligible = isGap && eligibleEmployees.length === 0;
  const submitDisabled =
    saving ||
    !positionId ||
    (isGap && (!employeeId || noEligible));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{headerSubject}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee picker (gap mode only) */}
          {isGap && (
            <div className="space-y-2">
              <Label>Empleado</Label>
              {noEligible ? (
                <p className="text-sm text-muted-foreground">
                  No hay empleados elegibles (con esta posición como primaria o secundaria) en esta sede.
                </p>
              ) : (
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}
                        {e.is_demo ? " (Demo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Shift template selector */}
          <div className="space-y-2">
            <Label>Plantilla de turno</Label>
            <Select
              value={templateId || "manual"}
              onValueChange={handleTemplateChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar plantilla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Horario manual</SelectItem>
                {shiftTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({formatTime(t.start_time)}-{formatTime(t.end_time)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label>Posición</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar posición" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Hora inicio</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hora fin</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Input
              placeholder="Notas adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {entry && !isGap && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                disabled={saving}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitDisabled}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
