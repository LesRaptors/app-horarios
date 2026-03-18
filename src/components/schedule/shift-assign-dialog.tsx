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
import type { Position, ShiftTemplate, ScheduleEntry } from "@/lib/types";

interface ShiftAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ScheduleEntry | null;
  employeeName: string;
  dateLabel: string;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  saving: boolean;
  onSave: (data: {
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
  entry,
  employeeName,
  dateLabel,
  positions,
  shiftTemplates,
  saving,
  onSave,
  onDelete,
}: ShiftAssignDialogProps) {
  const [positionId, setPositionId] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [templateId, setTemplateId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
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
    }
  }, [open, entry, positions]);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (id === "manual") {
      setTemplateId("");
      return;
    }
    const template = shiftTemplates.find((t) => t.id === id);
    if (template) {
      setStartTime(formatTime(template.start_time));
      setEndTime(formatTime(template.end_time));
    }
  }

  function handleSubmit() {
    onSave({
      position_id: positionId,
      start_time: startTime,
      end_time: endTime,
      shift_template_id: templateId || null,
      notes: notes.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry ? "Editar turno" : "Asignar turno"}
          </DialogTitle>
          <DialogDescription>
            {employeeName} — {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
            {entry && (
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
            <Button onClick={handleSubmit} disabled={saving || !positionId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {entry ? "Guardar cambios" : "Asignar turno"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
