"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  initial?: PayrollSettings | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PayrollSettingForm({ initial, open, onOpenChange, onSaved }: Props) {
  const supabase = createClient();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [smmlv, setSmmlv] = useState("");
  const [auxTransport, setAuxTransport] = useState("");
  const [hourlyDivisor, setHourlyDivisor] = useState("");
  const [nightStart, setNightStart] = useState("");
  const [sunPct, setSunPct] = useState("");
  const [holPct, setHolPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPeriodStart(initial?.period_start ?? "");
      setPeriodEnd(initial?.period_end ?? "");
      setSmmlv(initial ? String(initial.smmlv) : "");
      setAuxTransport(initial ? String(initial.aux_transport) : "");
      setHourlyDivisor(initial ? String(initial.hourly_divisor) : "");
      setNightStart(initial ? String(initial.night_start_hour) : "");
      setSunPct(initial ? String(initial.sunday_surcharge_pct) : "");
      setHolPct(initial ? String(initial.holiday_surcharge_pct) : "");
    }
  }, [open, initial]);

  async function handleSave() {
    const payload = {
      period_start: periodStart,
      period_end: periodEnd || null,
      smmlv: parseFloat(smmlv),
      aux_transport: parseFloat(auxTransport),
      hourly_divisor: parseInt(hourlyDivisor, 10),
      night_start_hour: parseInt(nightStart, 10),
      sunday_surcharge_pct: parseFloat(sunPct),
      holiday_surcharge_pct: parseFloat(holPct),
    };
    if (
      !payload.period_start ||
      Number.isNaN(payload.smmlv) ||
      Number.isNaN(payload.aux_transport) ||
      Number.isNaN(payload.hourly_divisor) ||
      Number.isNaN(payload.night_start_hour) ||
      Number.isNaN(payload.sunday_surcharge_pct) ||
      Number.isNaN(payload.holiday_surcharge_pct)
    ) {
      toast.error("Todos los campos numéricos son obligatorios");
      return;
    }
    setSaving(true);
    const { error } = initial
      ? await supabase.from("payroll_settings").update(payload).eq("id", initial.id)
      : await supabase.from("payroll_settings").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success(initial ? "Período actualizado" : "Período creado");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar período" : "Nuevo período"} de configuración de nómina
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ps">Inicio</Label>
            <Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pe">Fin (opcional)</Label>
            <Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sm">SMMLV</Label>
            <Input id="sm" type="number" value={smmlv} onChange={(e) => setSmmlv(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ax">Auxilio transporte</Label>
            <Input id="ax" type="number" value={auxTransport} onChange={(e) => setAuxTransport(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd">Divisor horas</Label>
            <Input id="hd" type="number" value={hourlyDivisor} onChange={(e) => setHourlyDivisor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ns">Inicio nocturno (hora)</Label>
            <Input id="ns" type="number" value={nightStart} onChange={(e) => setNightStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp">% recargo dominical (0.9 = 90%)</Label>
            <Input id="sp" type="number" step="0.001" value={sunPct} onChange={(e) => setSunPct(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hp">% recargo festivo</Label>
            <Input id="hp" type="number" step="0.001" value={holPct} onChange={(e) => setHolPct(e.target.value)} />
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
