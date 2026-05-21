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

interface DeptRow {
  name: string;
  location_id: string;
}

interface Location {
  id: string;
  name: string;
}

export default function DepartmentsStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<DeptRow[]>([{ name: "", location_id: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const loadLocations = useCallback(async () => {
    if (!organizationId) return;
    setDataLoading(true);
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name");
    const locs = data ?? [];
    setLocations(locs);
    if (locs.length > 0) {
      setRows([{ name: "", location_id: locs[0].id }]);
    }
    setDataLoading(false);
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  function updateRow(idx: number, field: keyof DeptRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { name: "", location_id: locations[0]?.id ?? "" },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleContinue() {
    setTouched(true);
    if (!organizationId) return;

    const validRows = rows.filter((r) => r.name.trim().length >= 2 && r.location_id);
    if (validRows.length === 0) {
      toast.error("Agregá al menos un departamento con nombre");
      return;
    }

    setSubmitting(true);
    const payload = validRows.map((r) => ({
      name: r.name.trim(),
      location_id: r.location_id,
      organization_id: organizationId,
    }));

    const { error } = await supabase.from("departments").insert(payload);
    if (error) {
      toast.error("Error creando departamentos");
      setSubmitting(false);
      return;
    }

    await supabase
      .from("organizations")
      .update({ onboarding_step: "positions" })
      .eq("id", organizationId);

    setSubmitting(false);
    router.push("/onboarding/positions");
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
      <Stepper currentStep="departments" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Departamentos</h1>
        <p className="text-slate-600 mb-6">
          Agrupá tus empleados por área o departamento. Podés agregar más después.
        </p>

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const nameInvalid = touched && row.name.trim().length < 2;
            const nameId = `dept-name-${idx}`;
            const locId = `dept-loc-${idx}`;
            const nameErrId = `dept-name-err-${idx}`;
            return (
              <div
                key={idx}
                className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 bg-slate-50"
              >
                <div className="flex-1">
                  <Label htmlFor={nameId} className="sr-only">
                    Nombre del departamento {idx + 1}
                  </Label>
                  <Input
                    id={nameId}
                    value={row.name}
                    onChange={(e) => updateRow(idx, "name", e.target.value)}
                    placeholder="Ej: Enfermería, Cocina, Seguridad"
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
                {locations.length > 1 && (
                  <div className="w-48">
                    <Label htmlFor={locId} className="sr-only">
                      Sede del departamento {idx + 1}
                    </Label>
                    <Select
                      value={row.location_id}
                      onValueChange={(v) => updateRow(idx, "location_id", v)}
                    >
                      <SelectTrigger id={locId}>
                        <SelectValue placeholder="Sede…" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(idx)}
                    aria-label={`Eliminar departamento ${idx + 1}`}
                    className="text-slate-400 hover:text-red-500 mt-0.5"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          className="mt-3"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Agregar departamento
        </Button>

        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/sede")}>
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
