"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnboardingOrg } from "@/hooks/use-onboarding-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLOR_PRESETS = [
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#65A30D",
];

interface PosRow {
  name: string;
  department_id: string;
  color: string;
}

interface Department {
  id: string;
  name: string;
}

export default function PositionsStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<PosRow[]>([
    { name: "", department_id: "", color: COLOR_PRESETS[0] },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const loadDepartments = useCallback(async () => {
    if (!organizationId) return;
    setDataLoading(true);
    const { data } = await supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name");
    const depts = data ?? [];
    setDepartments(depts);
    if (depts.length > 0) {
      setRows([{ name: "", department_id: depts[0].id, color: COLOR_PRESETS[0] }]);
    }
    setDataLoading(false);
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  function updateRow(idx: number, field: keyof PosRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        name: "",
        department_id: departments[0]?.id ?? "",
        color: COLOR_PRESETS[prev.length % COLOR_PRESETS.length],
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleContinue() {
    setTouched(true);
    if (!organizationId) return;

    const validRows = rows.filter(
      (r) => r.name.trim().length >= 2 && r.department_id
    );
    if (validRows.length === 0) {
      toast.error("Agregá al menos una posición con nombre");
      return;
    }

    setSubmitting(true);
    const payload = validRows.map((r) => ({
      name: r.name.trim(),
      department_id: r.department_id,
      color: r.color,
      organization_id: organizationId,
    }));

    const { error } = await supabase.from("positions").insert(payload);
    if (error) {
      toast.error("Error creando posiciones");
      setSubmitting(false);
      return;
    }

    await supabase
      .from("organizations")
      .update({ onboarding_step: "shifts" })
      .eq("id", organizationId);

    setSubmitting(false);
    router.push("/onboarding/shifts");
  }

  if (orgLoading || dataLoading) {
    return (
      <div className="flex justify-center mt-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <>
      <Stepper currentStep="positions" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Posiciones o cargos</h1>
        <p className="text-slate-600 mb-6">
          Definí los cargos que existen en cada departamento. Podés agregar más después.
        </p>

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const nameInvalid = touched && row.name.trim().length < 2;
            const nameId = `pos-name-${idx}`;
            const deptId = `pos-dept-${idx}`;
            const colorId = `pos-color-${idx}`;
            const nameErrId = `pos-name-err-${idx}`;
            return (
              <div
                key={idx}
                className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 bg-slate-50"
              >
                <div className="flex-1">
                  <Label htmlFor={nameId} className="sr-only">
                    Nombre de la posición {idx + 1}
                  </Label>
                  <Input
                    id={nameId}
                    value={row.name}
                    onChange={(e) => updateRow(idx, "name", e.target.value)}
                    placeholder="Ej: Enfermero/a, Cajero/a, Vigilante"
                    aria-required="true"
                    aria-invalid={nameInvalid ? "true" : undefined}
                    aria-describedby={nameInvalid ? nameErrId : undefined}
                  />
                  {nameInvalid && (
                    <p id={nameErrId} className="text-xs text-red-600 mt-1" role="alert">
                      El nombre es obligatorio
                    </p>
                  )}
                </div>
                <div className="w-44">
                  <Label htmlFor={deptId} className="sr-only">
                    Departamento de la posición {idx + 1}
                  </Label>
                  <Select
                    value={row.department_id}
                    onValueChange={(v) => updateRow(idx, "department_id", v)}
                  >
                    <SelectTrigger id={deptId}>
                      <SelectValue placeholder="Departamento…" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1 flex-wrap w-24">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateRow(idx, "color", c)}
                        className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: row.color === c ? "#1e293b" : "transparent",
                        }}
                        aria-label={`Color ${c}`}
                        aria-pressed={row.color === c}
                      />
                    ))}
                  </div>
                  <input
                    id={colorId}
                    type="color"
                    value={row.color}
                    onChange={(e) => updateRow(idx, "color", e.target.value)}
                    className="h-6 w-24 cursor-pointer rounded border border-slate-200"
                    aria-label={`Color personalizado posición ${idx + 1}`}
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(idx)}
                    aria-label={`Eliminar posición ${idx + 1}`}
                    className="text-slate-400 hover:text-red-500 mt-0.5"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={addRow} className="mt-3">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Agregar posición
        </Button>

        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/departments")}>
            ← Atrás
          </Button>
          <Button onClick={handleContinue} disabled={submitting}>
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            )}
            Continuar →
          </Button>
        </div>
      </div>
    </>
  );
}
