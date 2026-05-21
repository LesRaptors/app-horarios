"use client";

import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const INDUSTRIES = [
  { value: "salud", label: "Salud" },
  { value: "retail", label: "Retail" },
  { value: "hoteleria", label: "Hotelería" },
  { value: "vigilancia", label: "Vigilancia" },
  { value: "otro", label: "Otro" },
];

export default function EmpresaStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [legalName, setLegalName] = useState("");
  const [nit, setNit] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setDataLoading(true);
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("legal_name, nit, industry")
        .eq("id", organizationId)
        .single();
      if (data) {
        setLegalName(data.legal_name ?? "");
        setNit(data.nit ?? "");
        setIndustry(data.industry ?? "");
      }
      setDataLoading(false);
    })();
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleContinue() {
    if (!organizationId) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        legal_name: legalName || null,
        nit: nit || null,
        industry: industry || null,
        onboarding_step: "sede",
      })
      .eq("id", organizationId);
    setSubmitting(false);
    if (error) {
      toast.error("Error guardando datos");
      return;
    }
    router.push("/onboarding/sede");
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
      <Stepper currentStep="empresa" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <h1 className="text-2xl font-bold mb-2">Datos de tu empresa</h1>
        <p className="text-slate-600 mb-6">
          Esta información es opcional ahora, podés completarla después en Ajustes.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="legal-name">Razón social</Label>
            <Input
              id="legal-name"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Mi Empresa S.A.S."
            />
          </div>
          <div>
            <Label htmlFor="nit">NIT</Label>
            <Input
              id="nit"
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              placeholder="900123456-7"
            />
          </div>
          <div>
            <Label htmlFor="industry">Sector</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger id="industry">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
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
