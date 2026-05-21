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
import { Loader2, Plus, Trash2, Moon } from "lucide-react";
import { toast } from "sonner";
import { suggestIsNight } from "@/lib/equity-helpers";

interface ShiftRow {
  name: string;
  start_time: string;
  end_time: string;
  location_id: string;
  is_night: boolean;
}

interface Location {
  id: string;
  name: string;
}

function makeDefaultRow(defaultLocationId: string): ShiftRow {
  return {
    name: "",
    start_time: "06:00",
    end_time: "14:00",
    location_id: defaultLocationId,
    is_night: false,
  };
}

export default function ShiftsStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<ShiftRow[]>([makeDefaultRow("")]);
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
      setRows([makeDefaultRow(locs[0].id)]);
    }
    setDataLoading(false);
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  function updateRow(idx: number, updates: Partial<ShiftRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...updates };
        if ("start_time" in updates || "end_time" in updates) {
          next.is_night = suggestIsNight(next.start_time, next.end_time);
        }
        return next;
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeDefaultRow(locations[0]?.id ?? "")]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleContinue() {
    setTouched(true);
    if (!organizationId) return;

    const validRows = rows.filter(
      (r) => r.name.trim().length >= 2 && r.location_id && r.start_time && r.end_time
    );
    if (validRows.length === 0) {
      toast.error("Agregá al menos un turno con nombre");
      return;
    }

    setSubmitting(true);
    const payload = validRows.map((r) => ({
      name: r.name.trim(),
      start_time: r.start_time,
      end_time: r.end_time,
      location_id: r.location_id,
      is_night: r.is_night,
      organization_id: organizationId,
    }));

    const { error } = await supabase.from("shift_templates").insert(payload);
    if (error) {
      toast.error("Error creando turnos");
      setSubmitting(false);
      return;
    }

    await supabase
      .from("organizations")
      .update({ onboarding_step: "team" })
      .eq("id", organizationId);

    setSubmitting(false);
    router.push("/onboarding/team");
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
      <Stepper currentStep="shifts" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Plantillas de turno</h1>
        <p className="text-slate-600 mb-6">
          Definí los horarios de trabajo habituales. El ícono de luna se activa
          automáticamente si el turno cruza el horario nocturno (21:00–06:00).
        </p>

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const nameInvalid = touched && row.name.trim().length < 2;
            const nameId = `shift-name-${idx}`;
            const startId = `shift-start-${idx}`;
            const endId = `shift-end-${idx}`;
            const locId = `shift-loc-${idx}`;
            const nameErrId = `shift-name-err-${idx}`;
            return (
              <div
                key={idx}
                className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 bg-slate-50 flex-wrap"
              >
                <div className="flex-1 min-w-[150px]">
                  <Label htmlFor={nameId} className="sr-only">
                    Nombre del turno {idx + 1}
                  </Label>
                  <Input
                    id={nameId}
                    value={row.name}
                    onChange={(e) => updateRow(idx, { name: e.target.value })}
                    placeholder="Ej: Turno Mañana"
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
                <div>
                  <Label htmlFor={startId} className="sr-only">
                    Hora inicio turno {idx + 1}
                  </Label>
                  <Input
                    id={startId}
                    type="time"
                    value={row.start_time}
                    onChange={(e) => updateRow(idx, { start_time: e.target.value })}
                    className="w-32"
                  />
                </div>
                <div>
                  <Label htmlFor={endId} className="sr-only">
                    Hora fin turno {idx + 1}
                  </Label>
                  <Input
                    id={endId}
                    type="time"
                    value={row.end_time}
                    onChange={(e) => updateRow(idx, { end_time: e.target.value })}
                    className="w-32"
                  />
                </div>
                {locations.length > 1 && (
                  <div className="w-44">
                    <Label htmlFor={locId} className="sr-only">
                      Sede del turno {idx + 1}
                    </Label>
                    <Select
                      value={row.location_id}
                      onValueChange={(v) => updateRow(idx, { location_id: v })}
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
                <div className="flex items-center h-10">
                  <Moon
                    className={`h-4 w-4 ${row.is_night ? "text-indigo-500" : "text-slate-200"}`}
                    aria-label={row.is_night ? "Turno nocturno" : "Turno diurno"}
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(idx)}
                    aria-label={`Eliminar turno ${idx + 1}`}
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
          Agregar turno
        </Button>

        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/positions")}>
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
