"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnboardingOrg } from "@/hooks/use-onboarding-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SedeStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameInvalid = touched && name.trim().length < 2;

  async function handleContinue() {
    setTouched(true);
    if (!organizationId || name.trim().length < 2) return;
    setSubmitting(true);
    const { error } = await supabase.from("locations").insert({
      name: name.trim(),
      address: address.trim() || undefined,
      organization_id: organizationId,
    });
    if (error) {
      toast.error("Error creando sede");
      setSubmitting(false);
      return;
    }
    await supabase
      .from("organizations")
      .update({ onboarding_step: "departments" })
      .eq("id", organizationId);
    setSubmitting(false);
    router.push("/onboarding/departments");
  }

  if (orgLoading) {
    return (
      <div className="flex justify-center mt-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <>
      <Stepper currentStep="sede" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Tu primera sede</h1>
        <p className="text-slate-600 mb-6">
          Una sede es un lugar físico donde trabajan tus empleados. Podés agregar más después.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">
              Nombre de la sede <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Ej: Sede Principal, Sucursal Norte"
              required
              aria-required="true"
              aria-invalid={nameInvalid ? "true" : undefined}
              aria-describedby={nameInvalid ? "name-error" : undefined}
            />
            {nameInvalid && (
              <p id="name-error" className="text-sm text-red-600 mt-1" role="alert">
                El nombre de la sede es obligatorio
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="address">Dirección (opcional)</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle 123 # 45-67, Bogotá"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/empresa")}>
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
