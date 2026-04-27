"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { PaymentFrequency } from "@/lib/types";

export function PaymentFrequencySelector() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState<PaymentFrequency>("mensual");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "app_flags")
        .maybeSingle();
      const v = data?.value as Record<string, unknown> | undefined;
      const f = v?.payment_frequency;
      if (f === "mensual" || f === "quincenal") setFrequency(f);
      setLoading(false);
    })();
  }, [supabase]);

  async function handleChange(next: PaymentFrequency) {
    setSaving(true);
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_flags")
      .maybeSingle();
    const merged = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      payment_frequency: next,
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "app_flags", value: merged }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    setFrequency(next);
    toast.success("Frecuencia de pago actualizada");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frecuencia de pago</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="payment-frequency">Periodicidad</Label>
            <Select
              value={frequency}
              disabled={saving}
              onValueChange={(v) => handleChange(v as PaymentFrequency)}
            >
              <SelectTrigger id="payment-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">
                  Mensual (un período por mes)
                </SelectItem>
                <SelectItem value="quincenal">
                  Quincenal (dos períodos por mes)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Aplica a todos los empleados. Al cambiar, los próximos períodos
              generados usarán esta frecuencia.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
