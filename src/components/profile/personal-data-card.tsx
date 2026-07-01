"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validatePhone } from "@/lib/profile-helpers";
import { translateDbError } from "@/lib/utils";
import type { ProfileCardProps } from "@/lib/types";

export function PersonalDataCard({ profile, onUpdated }: ProfileCardProps) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);

  function clearFeedback() {
    setError(null);
    setOk(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);

    if (dbErr) {
      setError(translateDbError(dbErr.message));
      return;
    }
    setOk(true);
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos personales</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="Nombre" required>
            <Input
              id="personal-first-name"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); clearFeedback(); }}
              autoComplete="given-name"
              aria-invalid={error ? "true" : undefined}
            />
          </FormField>
          <FormField label="Apellido" required>
            <Input
              id="personal-last-name"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); clearFeedback(); }}
              autoComplete="family-name"
              aria-invalid={error ? "true" : undefined}
            />
          </FormField>
          <FormField label="Teléfono">
            <Input
              id="personal-phone"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); clearFeedback(); }}
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={
                error && error.includes("teléfono") ? "true" : undefined
              }
            />
          </FormField>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {ok && (
            <p className="text-sm text-emerald-600" role="status">
              Datos guardados.
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
