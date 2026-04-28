"use client";

import { useAuth } from "@/hooks/use-auth";
import { LaborConstraintsForm } from "@/components/settings/labor-constraints-form";
import { SalariesVisibilityToggle } from "@/components/settings/salaries-visibility-toggle";
import { PaymentFrequencySelector } from "@/components/settings/payment-frequency-selector";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">
          Solo los administradores pueden acceder a la configuración.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Ajustes del sistema y restricciones laborales
        </p>
      </div>

      <LaborConstraintsForm />
      <p className="text-xs text-muted-foreground">
        Estos valores se aplican como default. Cada tipo de contrato puede sobrescribirlos en{" "}
        <Link href="/contract-types" className="underline">/contract-types</Link>.
      </p>
      <SalariesVisibilityToggle />
      <PaymentFrequencySelector />
    </div>
  );
}
