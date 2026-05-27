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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import type { ContractType, RestRule, RestRuleType } from "@/lib/types";
import { RestRuleCards } from "@/components/contract-types/rest-rule-cards";
import { RestRulePreview } from "@/components/contract-types/rest-rule-preview";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ContractType | null;
  onSaved: () => void;
}

type PresetKey = "none" | "healthcare" | "cycle_4_3" | "weekend_alternating" | "custom";

type FormState = {
  name: string;
  description: string;
  weekly_hours_mode: "full" | "partial";
  weekly_hours: string;
  is_healthcare: boolean;
  available_sundays: boolean;
  available_holidays: boolean;
  available_nights: boolean;
  rest_rules: RestRule[];
  preset: PresetKey;
};

function makeRule(type: RestRuleType): RestRule {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: Record<RestRuleType, RestRule["params"]> = {
    work_cycle: { work_days: 4, rest_days: 3, cycle_start_date: today },
    weekend_rotation: { every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true },
    post_night_rest: { nights_threshold: 3, rest_days_required: 2 },
    max_consecutive_nights: { max: 3 },
    compensatory_day: { applies_to: "sundays", within_days: 7 },
  };
  return {
    id: crypto.randomUUID(),
    contract_type_id: "",
    rule_type: type,
    params: defaults[type] as RestRule["params"],
    created_at: "",
    updated_at: "",
  };
}

function detectPreset(rules: RestRule[]): PresetKey {
  if (rules.length === 0) return "none";
  if (
    rules.length === 2 &&
    rules.some((r) => r.rule_type === "max_consecutive_nights" && (r.params as { max: number }).max === 3) &&
    rules.some(
      (r) =>
        r.rule_type === "post_night_rest" &&
        (r.params as { nights_threshold: number; rest_days_required: number }).nights_threshold === 3 &&
        (r.params as { nights_threshold: number; rest_days_required: number }).rest_days_required === 2
    )
  ) {
    return "healthcare";
  }
  if (
    rules.length === 1 &&
    rules[0].rule_type === "work_cycle" &&
    (rules[0].params as { work_days: number; rest_days: number }).work_days === 4 &&
    (rules[0].params as { work_days: number; rest_days: number }).rest_days === 3
  ) {
    return "cycle_4_3";
  }
  if (
    rules.length === 1 &&
    rules[0].rule_type === "weekend_rotation" &&
    (rules[0].params as { every_n_weeks: number; offset: number; include_saturday: boolean; include_sunday: boolean })
      .every_n_weeks === 2 &&
    (rules[0].params as { every_n_weeks: number; offset: number; include_saturday: boolean; include_sunday: boolean })
      .offset === 0 &&
    (rules[0].params as { every_n_weeks: number; offset: number; include_saturday: boolean; include_sunday: boolean })
      .include_saturday &&
    (rules[0].params as { every_n_weeks: number; offset: number; include_saturday: boolean; include_sunday: boolean })
      .include_sunday
  ) {
    return "weekend_alternating";
  }
  return "custom";
}

const PRESET_OPTIONS: { value: PresetKey; label: string; description: string }[] = [
  { value: "none", label: "Sin reglas", description: "Sin restricciones de descanso adicionales." },
  {
    value: "healthcare",
    label: "Asistencial",
    description: "Máx. 3 noches seguidas; 2 días de descanso tras 3 noches.",
  },
  {
    value: "cycle_4_3",
    label: "Ciclo 4×3",
    description: "Trabaja 4 días, descansa 3 días, ciclo continuo.",
  },
  {
    value: "weekend_alternating",
    label: "Fines de semana alternos",
    description: "Descansa un fin de semana completo cada 2 semanas.",
  },
  { value: "custom", label: "Personalizado", description: "Configura tus propias reglas." },
];

const RULE_TYPE_LABELS: Record<RestRuleType, string> = {
  work_cycle: "Ciclo trabajo/descanso",
  weekend_rotation: "Rotación de fines de semana",
  post_night_rest: "Descanso post-noches",
  max_consecutive_nights: "Máx. noches consecutivas",
  compensatory_day: "Día compensatorio",
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
    rest_rules: [],
    preset: "none",
  };
}

export function ContractTypeForm({ open, onOpenChange, initial, onSaved }: Props) {
  const supabase = createClient();
  const { effectiveOrgId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => defaultForm(initial));

  useEffect(() => {
    if (!open) return;

    const base = defaultForm(initial);
    setForm(base);

    if (!initial?.id) return;

    // Load existing rules when editing
    supabase
      .from("contract_rest_rules")
      .select("*")
      .eq("contract_type_id", initial.id)
      .then(({ data }) => {
        const rules = (data ?? []) as unknown as RestRule[];
        const preset = detectPreset(rules);
        setForm((prev) => ({ ...prev, rest_rules: rules, preset }));
      });
  }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: PresetKey) {
    let rules: RestRule[] = [];
    if (preset === "healthcare") {
      rules = [makeRule("max_consecutive_nights"), makeRule("post_night_rest")];
    } else if (preset === "cycle_4_3") {
      rules = [makeRule("work_cycle")];
    } else if (preset === "weekend_alternating") {
      rules = [makeRule("weekend_rotation")];
    } else if (preset === "custom") {
      // preserve existing rules
      setForm((prev) => ({ ...prev, preset }));
      return;
    }
    setForm((prev) => ({ ...prev, preset, rest_rules: rules }));
  }

  function addRule(type: RestRuleType) {
    setForm((prev) => ({
      ...prev,
      rest_rules: [...prev.rest_rules, makeRule(type)],
      preset: "custom",
    }));
  }

  function updateRule(idx: number, params: RestRule["params"]) {
    setForm((prev) => {
      const next = [...prev.rest_rules];
      next[idx] = { ...next[idx], params };
      return { ...prev, rest_rules: next, preset: "custom" };
    });
  }

  function removeRule(idx: number) {
    setForm((prev) => ({
      ...prev,
      rest_rules: prev.rest_rules.filter((_, i) => i !== idx),
      preset: "custom",
    }));
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
      organization_id: effectiveOrgId ?? "",
    };

    let contractTypeId: string | null = initial?.id ?? null;

    if (initial) {
      const { error } = await supabase
        .from("contract_types")
        .update(payload)
        .eq("id", initial.id);
      if (error) {
        toast.error(translateDbError(error.message, "Error al guardar tipo"));
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("contract_types")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        toast.error(translateDbError(error?.message ?? "", "Error al guardar tipo"));
        setSaving(false);
        return;
      }
      contractTypeId = data.id;
    }

    // Persist rest rules: delete old, insert new
    if (contractTypeId) {
      await supabase
        .from("contract_rest_rules")
        .delete()
        .eq("contract_type_id", contractTypeId);

      if (form.rest_rules.length > 0) {
        const rows = form.rest_rules.map((r) => ({
          contract_type_id: contractTypeId as string,
          rule_type: r.rule_type,
          params: r.params,
          organization_id: effectiveOrgId ?? "",
        }));
        const { error: ruleError } = await supabase
          .from("contract_rest_rules")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(rows as any);
        if (ruleError) {
          toast.error(translateDbError(ruleError.message, "Error al guardar reglas de descanso"));
          setSaving(false);
          return;
        }
      }
    }

    toast.success(initial ? "Tipo actualizado" : "Tipo creado");
    onSaved();
    onOpenChange(false);
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* Reglas de descanso */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-medium">Reglas de descanso</Label>
            <RadioGroup
              value={form.preset}
              onValueChange={(v) => applyPreset(v as PresetKey)}
              className="space-y-1"
            >
              {PRESET_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-start gap-2">
                  <RadioGroupItem value={opt.value} id={`preset-${opt.value}`} className="mt-0.5" />
                  <div>
                    <Label htmlFor={`preset-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>

            {form.rest_rules.length > 0 && (
              <RestRuleCards
                rules={form.rest_rules}
                onUpdate={updateRule}
                onRemove={removeRule}
              />
            )}

            {form.preset === "custom" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" type="button">
                    <Plus className="mr-1 h-4 w-4" />
                    Agregar regla
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(Object.keys(RULE_TYPE_LABELS) as RestRuleType[]).map((type) => (
                    <DropdownMenuItem key={type} onSelect={() => addRule(type)}>
                      {RULE_TYPE_LABELS[type]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {form.rest_rules.length > 0 && (
              <RestRulePreview rules={form.rest_rules} />
            )}
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
