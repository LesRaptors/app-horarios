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
import { useAuth } from "@/hooks/use-auth";
import type { PaymentFrequency, PaymentMode } from "@/lib/types";

export function PaymentFrequencySelector() {
  const supabase = createClient();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState<PaymentFrequency>("mensual");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("independent");
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
      const m = v?.payment_mode;
      if (m === "independent" || m === "advance_settlement") setPaymentMode(m);
      setLoading(false);
    })();
  }, [supabase]);

  async function persistFlags(patch: Record<string, unknown>) {
    setSaving(true);
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_flags")
      .maybeSingle();
    const merged = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      ...patch,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "app_flags",
          value: merged as any,
          organization_id: profile?.organization_id ?? "",
        },
        { onConflict: "key" },
      );
    setSaving(false);
    return error;
  }

  async function handleFrequencyChange(next: PaymentFrequency) {
    const error = await persistFlags({ payment_frequency: next });
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    setFrequency(next);
    toast.success("Frecuencia de pago actualizada");
  }

  async function handleModeChange(next: PaymentMode) {
    const error = await persistFlags({ payment_mode: next });
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    setPaymentMode(next);
    toast.success("Modalidad de pago actualizada");
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
          <div className="space-y-4 max-w-xs">
            <div className="space-y-2">
              <Label htmlFor="payment-frequency">Periodicidad</Label>
              <Select
                value={frequency}
                disabled={saving}
                onValueChange={(v) => handleFrequencyChange(v as PaymentFrequency)}
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

            {frequency === "quincenal" ? (
              <div className="space-y-2">
                <Label htmlFor="payment-mode">Modalidad de pago quincenal</Label>
                <Select
                  value={paymentMode}
                  disabled={saving}
                  onValueChange={(v) => handleModeChange(v as PaymentMode)}
                >
                  <SelectTrigger id="payment-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="independent">
                      Cada quincena se calcula independiente
                    </SelectItem>
                    <SelectItem value="advance_settlement">
                      Anticipo + Liquidación
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {paymentMode === "independent"
                    ? "Cada período de 15 días se liquida completo: salario, recargos, deducciones."
                    : "Quincena 1 paga solo salario+transporte como anticipo. Quincena 2 paga la liquidación completa del mes restando lo del anticipo. Recomendado para empresas con esquema de quincena 50/50."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Modalidad: mensual (un solo pago al fin de mes).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
