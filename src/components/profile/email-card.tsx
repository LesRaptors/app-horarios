"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { createClient } from "@/lib/supabase/client";
import { validateEmail } from "@/lib/profile-helpers";
import type { User } from "@supabase/supabase-js";

export function EmailCard({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const vErr = validateEmail(email);
    if (vErr) {
      setError(vErr);
      return;
    }
    if (email.trim().toLowerCase() === (user.email ?? "").toLowerCase()) {
      setError("Ese ya es tu correo actual.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updErr } = await supabase.auth.updateUser({ email: email.trim() });
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setSent(true);
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Correo actual</p>
          <p className="text-sm font-medium">{user.email}</p>
        </div>

        {sent && (
          <p
            className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5"
            role="status"
          >
            Te enviamos un enlace de confirmación al nuevo correo. El cambio se aplica cuando lo
            abras. Si no llega, revisa spam o la cuarentena de tu proveedor.
          </p>
        )}

        {!editing && !sent && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Cambiar correo
          </Button>
        )}

        {editing && (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <FormField label="Nuevo correo" required>
              <Input
                id="email-new"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "email-new-error" : undefined}
                required
              />
            </FormField>

            {error && (
              <p id="email-new-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Enviando…" : "Enviar confirmación"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setEditing(false); setError(null); setEmail(""); }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
