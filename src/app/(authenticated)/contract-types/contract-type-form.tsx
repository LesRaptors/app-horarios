"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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

type FormState = {
  name: string;
  description: string;
  weekly_hours_mode: "full" | "partial";
  weekly_hours: string;
  is_healthcare: boolean;
  available_sundays: boolean;
  available_holidays: boolean;
  available_nights: boolean;
};

function defaultForm(initial: ContractType | null): FormState {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    weekly_hours_mode: initial?.weekly_hours_mode ?? "full",
    weekly_hours: initial?.weekly_hours?.toString() ?? "",
    is_healthcare: initial?.is_healthcare ?? false,
    available_sundays: initial?.available_sundays ?? true,
    available_holidays: initial?.available_holidays ?? true,
    available_nights: initial?.available_nights ?? true,
  };
}

export function ContractTypeForm({ open, onOpenChange, initial, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => defaultForm(initial));

  useEffect(() => {
    if (open) {
      setForm(defaultForm(initial));
    }
  }, [open, initial]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      weekly_hours_mode: form.weekly_hours_mode,
      weekly_hours:
        form.weekly_hours_mode === "partial" && form.weekly_hours
          ? Number(form.weekly_hours)
          : null,
      is_healthcare: form.is_healthcare,
      available_sundays: form.available_sundays,
      available_holidays: form.available_holidays,
      available_nights: form.available_nights,
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

        <div className="space-y-4 py-2">
          {/* Nombre */}
          <FormField label="Nombre" required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej: Tiempo completo, Medio tiempo..."
            />
          </FormField>

          {/* Descripción */}
          <FormField label="Descripción">
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Opcional"
            />
          </FormField>

          {/* Tipo de jornada */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de jornada</Label>
            <RadioGroup
              value={form.weekly_hours_mode}
              onValueChange={(v) =>
                set("weekly_hours_mode", v as "full" | "partial")
              }
              className="space-y-1"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="mode-full" />
                <Label htmlFor="mode-full" className="font-normal cursor-pointer">
                  Completa (44 h/semana)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="partial" id="mode-partial" />
                <Label htmlFor="mode-partial" className="font-normal cursor-pointer">
                  Parcial
                </Label>
              </div>
            </RadioGroup>

            {form.weekly_hours_mode === "partial" && (
              <div className="ml-6">
                <FormField label="Horas/semana">
                  <Input
                    type="number"
                    min={1}
                    max={43}
                    value={form.weekly_hours}
                    onChange={(e) => set("weekly_hours", e.target.value)}
                    placeholder="Ej: 20, 30..."
                    className="w-32"
                  />
                </FormField>
              </div>
            )}
          </div>

          {/* Personal asistencial */}
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch
              id="is-healthcare"
              checked={form.is_healthcare}
              onCheckedChange={(v) => set("is_healthcare", v)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="is-healthcare" className="cursor-pointer font-medium">
                Personal asistencial sanitario
              </Label>
              <p className="text-xs text-muted-foreground">
                Permite turnos de hasta 12 h/día (administrativo: 10 h/día).
              </p>
            </div>
          </div>

          {/* Días disponibles */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Días disponibles</Label>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="avail-sundays"
                  checked={form.available_sundays}
                  onCheckedChange={(v) => set("available_sundays", v)}
                />
                <Label htmlFor="avail-sundays" className="cursor-pointer font-normal">
                  Domingos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="avail-holidays"
                  checked={form.available_holidays}
                  onCheckedChange={(v) => set("available_holidays", v)}
                />
                <Label htmlFor="avail-holidays" className="cursor-pointer font-normal">
                  Festivos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="avail-nights"
                  checked={form.available_nights}
                  onCheckedChange={(v) => set("available_nights", v)}
                />
                <Label htmlFor="avail-nights" className="cursor-pointer font-normal">
                  Noches
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
