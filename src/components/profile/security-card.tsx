"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordChange } from "@/lib/profile-helpers";
import type { User } from "@supabase/supabase-js";

export function SecurityCard({ user }: { user: User }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
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

    const vErr = validatePasswordChange(current, next, confirm);
    if (vErr) {
      setError(vErr);
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Verificar la contraseña actual re-autenticando.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: current,
    });
    if (signInErr) {
      setSaving(false);
      setError("La contraseña actual es incorrecta.");
      return;
    }

    // Actualizar a la nueva contraseña.
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setSaving(false);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    setOk(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguridad</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="Contraseña actual" required>
            <Input
              id="security-current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); clearFeedback(); }}
              aria-invalid={error ? "true" : undefined}
              required
            />
          </FormField>
          <FormField label="Nueva contraseña" required>
            <Input
              id="security-new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => { setNext(e.target.value); clearFeedback(); }}
              aria-invalid={error ? "true" : undefined}
              required
            />
          </FormField>
          <FormField label="Confirmar nueva contraseña" required>
            <Input
              id="security-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clearFeedback(); }}
              aria-invalid={error ? "true" : undefined}
              required
            />
          </FormField>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {ok && (
            <p className="text-sm text-emerald-600" role="status">
              Contraseña actualizada.
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Actualizando…" : "Cambiar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
