"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function SalariesVisibilityToggle() {
  const supabase = createClient();
  const { effectiveOrgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "app_flags")
        .maybeSingle();
      const v = data?.value as Record<string, unknown> | undefined;
      setEnabled(v?.managers_can_see_salaries === true);
      setLoading(false);
    })();
  }, [supabase]);

  async function handleChange(next: boolean) {
    setSaving(true);
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_flags")
      .maybeSingle();
    const merged = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      managers_can_see_salaries: next,
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "app_flags",
          value: merged,
          organization_id: effectiveOrgId ?? "",
        },
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    setEnabled(next);
    toast.success("Configuración actualizada");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos de salarios</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex items-center gap-2">
            <Checkbox
              id="managers-see-salaries"
              checked={enabled}
              disabled={saving}
              onCheckedChange={(c) => handleChange(c === true)}
            />
            <Label htmlFor="managers-see-salaries">
              Permitir que managers vean los salarios de empleados de su sede
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
