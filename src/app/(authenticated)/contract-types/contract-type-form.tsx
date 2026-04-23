"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ContractType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ContractType | null;
  onSaved: () => void;
}

export function ContractTypeForm({ open, onOpenChange, initial, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [maxSun, setMaxSun] = useState<number | string>(
    initial?.max_sundays_per_quarter ?? 6
  );
  const [maxHol, setMaxHol] = useState<number | string>(
    initial?.max_holidays_per_quarter ?? 3
  );
  const [targetSat, setTargetSat] = useState<string>(
    initial?.target_saturdays_per_month?.toString() ?? ""
  );
  const [targetNight, setTargetNight] = useState<string>(
    initial?.target_nights_per_month?.toString() ?? ""
  );
  const [targetHours, setTargetHours] = useState<string>(
    initial?.target_hours_per_week?.toString() ?? ""
  );

  // Reset form state when dialog opens or the edited record changes.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setMaxSun(initial?.max_sundays_per_quarter ?? 6);
      setMaxHol(initial?.max_holidays_per_quarter ?? 3);
      setTargetSat(initial?.target_saturdays_per_month?.toString() ?? "");
      setTargetNight(initial?.target_nights_per_month?.toString() ?? "");
      setTargetHours(initial?.target_hours_per_week?.toString() ?? "");
    }
  }, [open, initial]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description?.trim() ? description.trim() : null,
      max_sundays_per_quarter: Number(maxSun),
      max_holidays_per_quarter: Number(maxHol),
      target_saturdays_per_month: targetSat === "" ? null : Number(targetSat),
      target_nights_per_month: targetNight === "" ? null : Number(targetNight),
      target_hours_per_week: targetHours === "" ? null : Number(targetHours),
    };

    const { error } = initial
      ? await supabase
          .from("contract_types")
          .update(payload)
          .eq("id", initial.id)
      : await supabase.from("contract_types").insert(payload);

    if (error) {
      toast.error(translateDbError(error.message, "Error al guardar tipo"));
    } else {
      toast.success(initial ? "Tipo actualizado" : "Tipo creado");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar tipo de contrato" : "Nuevo tipo de contrato"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <FormField label="Nombre" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Tiempo completo, Medio tiempo..."
            />
          </FormField>
          <FormField label="Descripción">
            <Input
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField label="Máximo domingos por trimestre" required>
            <Input
              type="number"
              min={0}
              value={maxSun}
              onChange={(e) => setMaxSun(e.target.value)}
            />
          </FormField>
          <FormField label="Máximo festivos por trimestre" required>
            <Input
              type="number"
              min={0}
              value={maxHol}
              onChange={(e) => setMaxHol(e.target.value)}
            />
          </FormField>
          <FormField label="Target sábados/mes (opcional)">
            <Input
              type="number"
              min={0}
              value={targetSat}
              onChange={(e) => setTargetSat(e.target.value)}
            />
          </FormField>
          <FormField label="Target noches/mes (opcional)">
            <Input
              type="number"
              min={0}
              value={targetNight}
              onChange={(e) => setTargetNight(e.target.value)}
            />
          </FormField>
          <FormField label="Horas/semana (opcional, override)">
            <Input
              type="number"
              min={0}
              value={targetHours}
              onChange={(e) => setTargetHours(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
