"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AbsenceType, AbsencePayer } from "@/lib/types";

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface AbsenceDefaults {
  paid_pct: number;
  payer: AbsencePayer;
  helper?: string;
}

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  sick_eps: "Incapacidad EPS",
  sick_arl: "Incapacidad ARL",
  maternity: "Maternidad",
  paternity: "Paternidad",
  vacation: "Vacaciones",
  paid_leave: "Permiso remunerado",
  unpaid_leave: "Permiso no remunerado",
  suspension: "Suspensión",
};

const PAYER_LABELS: Record<AbsencePayer, string> = {
  employer: "Empleador",
  eps: "EPS",
  arl: "ARL",
  none: "Ninguno",
};

const ABSENCE_DEFAULTS: Record<AbsenceType, AbsenceDefaults> = {
  sick_eps: {
    paid_pct: 0.6667,
    payer: "eps",
    helper:
      "Para los primeros 2 días el empleador paga; ajustá si querés precisión.",
  },
  sick_arl: { paid_pct: 1.0, payer: "arl" },
  maternity: { paid_pct: 1.0, payer: "eps" },
  paternity: { paid_pct: 1.0, payer: "eps" },
  vacation: { paid_pct: 1.0, payer: "employer" },
  paid_leave: { paid_pct: 1.0, payer: "employer" },
  unpaid_leave: { paid_pct: 0, payer: "none" },
  suspension: { paid_pct: 0, payer: "none" },
};

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function AbsenceForm({ employeeId, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const supabase = createClient();

  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [type, setType] = useState<AbsenceType>("sick_eps");
  const [paidPct, setPaidPct] = useState<string>("0.6667");
  const [payer, setPayer] = useState<AbsencePayer>("eps");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setStartDate(todayISO());
    setEndDate(todayISO());
    setType("sick_eps");
    const def = ABSENCE_DEFAULTS.sick_eps;
    setPaidPct(String(def.paid_pct));
    setPayer(def.payer);
    setNotes("");
  }

  function handleTypeChange(newType: AbsenceType) {
    setType(newType);
    const def = ABSENCE_DEFAULTS[newType];
    setPaidPct(String(def.paid_pct));
    setPayer(def.payer);
  }

  async function handleSave() {
    if (!startDate || !endDate) {
      toast.error("Las fechas son obligatorias");
      return;
    }
    if (endDate < startDate) {
      toast.error("La fecha de fin no puede ser anterior a la de inicio");
      return;
    }
    const parsedPct = parseFloat(paidPct);
    if (isNaN(parsedPct) || parsedPct < 0 || parsedPct > 1) {
      toast.error("El porcentaje pagado debe estar entre 0 y 1");
      return;
    }

    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("absence_records").insert({
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      type,
      paid_pct: parsedPct,
      payer,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Ausencia registrada");
    reset();
    onSaved();
    onOpenChange(false);
  }

  const helper = ABSENCE_DEFAULTS[type]?.helper;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ausencia</DialogTitle>
          <DialogDescription>
            Registra una ausencia o incapacidad para el empleado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="abs-start">Fecha inicio</Label>
              <Input
                id="abs-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abs-end">Fecha fin</Label>
              <Input
                id="abs-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abs-type">Tipo</Label>
            <Select
              value={type}
              onValueChange={(v) => handleTypeChange(v as AbsenceType)}
            >
              <SelectTrigger id="abs-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ABSENCE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="abs-pct">% pagado (0–1)</Label>
              <Input
                id="abs-pct"
                type="number"
                step="0.0001"
                min={0}
                max={1}
                value={paidPct}
                onChange={(e) => setPaidPct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abs-payer">Pagador</Label>
              <Select
                value={payer}
                onValueChange={(v) => setPayer(v as AbsencePayer)}
              >
                <SelectTrigger id="abs-payer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYER_LABELS) as AbsencePayer[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PAYER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {helper && (
            <p className="text-xs text-muted-foreground">{helper}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="abs-notes">Notas (opcional)</Label>
            <Textarea
              id="abs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Diagnóstico, referencia médica, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
