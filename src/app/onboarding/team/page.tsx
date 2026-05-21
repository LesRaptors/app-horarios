"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnboardingOrg } from "@/hooks/use-onboarding-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/onboarding/stepper";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function TeamStepPage() {
  const router = useRouter();
  const { organizationId, loading: orgLoading } = useOnboardingOrg();
  const supabase = createClient();
  const [emails, setEmails] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  function updateEmail(idx: number, value: string) {
    setEmails((prev) => prev.map((e, i) => (i === idx ? value : e)));
  }

  function addEmail() {
    setEmails((prev) => [...prev, ""]);
  }

  function removeEmail(idx: number) {
    setEmails((prev) => prev.filter((_, i) => i !== idx));
  }

  async function completeOnboarding(): Promise<boolean> {
    if (!organizationId) return false;
    const { error } = await supabase
      .from("organizations")
      .update({
        onboarding_step: "done",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    if (error) {
      toast.error("Error completando el onboarding");
      return false;
    }
    return true;
  }

  async function handleSkip() {
    setSubmitting(true);
    const ok = await completeOnboarding();
    setSubmitting(false);
    if (ok) router.push("/dashboard");
  }

  async function handleInvite() {
    const validEmails = emails.filter((e) => isValidEmail(e));
    if (validEmails.length === 0) {
      toast.error("Ingresá al menos un correo válido para invitar");
      return;
    }

    setSubmitting(true);

    const results = await Promise.allSettled(
      validEmails.map((email) =>
        fetch("/api/employees/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error ?? `Error invitando ${email}`);
          }
          return email;
        })
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected");

    if (failed.length > 0) {
      failed.forEach((r) => {
        if (r.status === "rejected") {
          toast.warning(r.reason?.message ?? "Error al invitar un empleado");
        }
      });
    }

    if (succeeded > 0) {
      toast.success(
        succeeded === 1 ? "Invitación enviada" : `${succeeded} invitaciones enviadas`
      );
    }

    const ok = await completeOnboarding();
    setSubmitting(false);
    if (ok) router.push("/dashboard");
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
      <Stepper currentStep="team" />
      <div className="bg-white rounded-xl border border-slate-200 p-8 mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold">Invitá a tu equipo</h1>
        </div>
        <p className="text-slate-600 mb-6">
          Enviá invitaciones por correo para que tus empleados puedan acceder a la app. Este paso
          es opcional, podés invitar más personas desde la sección Empleados.
        </p>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-3">
            Correos electrónicos
          </legend>
          <div className="space-y-2">
            {emails.map((email, idx) => {
              const emailId = `invite-email-${idx}`;
              const isInvalid = email.trim().length > 0 && !isValidEmail(email);
              const errId = `invite-email-err-${idx}`;
              return (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Label htmlFor={emailId} className="sr-only">
                      Correo del empleado {idx + 1}
                    </Label>
                    <Input
                      id={emailId}
                      type="email"
                      value={email}
                      onChange={(e) => updateEmail(idx, e.target.value)}
                      placeholder="empleado@empresa.com"
                      aria-invalid={isInvalid ? "true" : undefined}
                      aria-describedby={isInvalid ? errId : undefined}
                    />
                    {isInvalid && (
                      <p id={errId} className="text-xs text-red-600 mt-1" role="alert">
                        Correo no válido
                      </p>
                    )}
                  </div>
                  {emails.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEmail(idx)}
                      aria-label={`Eliminar correo ${idx + 1}`}
                      className="text-slate-400 hover:text-red-500 mt-0.5"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <Button variant="outline" size="sm" onClick={addEmail} className="mt-3">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Agregar correo
        </Button>

        <div className="flex justify-between gap-2 pt-6 mt-6 border-t">
          <Button variant="outline" onClick={() => router.push("/onboarding/shifts")}>
            ← Atrás
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSkip} disabled={submitting}>
              {submitting && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              )}
              Saltar y terminar
            </Button>
            <Button onClick={handleInvite} disabled={submitting}>
              {submitting && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              )}
              Invitar y terminar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
