"use client";
import { useEffect, useState } from "react";
import { CreditCard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WompiWidgetButton } from "@/components/billing/wompi-widget-button";
import { toast } from "sonner";
import type { PaymentMethod } from "@/lib/billing/types";

interface PaymentMethodsResponse {
  data: PaymentMethod[];
}

export function PaymentMethodCard({ planId = "" }: { planId?: string }) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMethods = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/payment-methods");
      if (!res.ok) return;
      const body = (await res.json()) as PaymentMethodsResponse;
      setMethods(body.data ?? []);
    } catch {
      // silently fail; empty state shown
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMethods();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/billing/payment-methods?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? "Error al eliminar la tarjeta.");
        return;
      }
      toast.success("Tarjeta eliminada.");
      await fetchMethods();
    } catch {
      toast.error("Error inesperado al eliminar la tarjeta.");
    } finally {
      setDeleting(null);
    }
  };

  const defaultMethod = methods.find((m) => m.is_default) ?? methods[0] ?? null;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Método de pago</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!defaultMethod) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Método de pago</CardTitle>
          <CardDescription>No tienes ninguna tarjeta registrada.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Agrega una tarjeta para activar o renovar tu suscripción.
          </p>
          {/* planId viene de la página de facturación (plan actual de la org) */}
          <WompiWidgetButton planId={planId} label="Agregar tarjeta" />
        </CardContent>
      </Card>
    );
  }

  const brand = defaultMethod.card_brand ?? "Tarjeta";
  const last4 = defaultMethod.card_last4 ?? "••••";
  const expMonth = String(defaultMethod.card_exp_month ?? "").padStart(2, "0");
  const expYear = String(defaultMethod.card_exp_year ?? "").slice(-2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Método de pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">
              {brand} &bull;&bull;&bull;&bull; {last4}
            </p>
            {defaultMethod.card_exp_month && defaultMethod.card_exp_year && (
              <p className="text-sm text-muted-foreground">
                Vence {expMonth}/{expYear}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <WompiWidgetButton planId={planId} label="Cambiar tarjeta" />
          <Button
            variant="outline"
            size="icon"
            aria-label="Eliminar tarjeta"
            disabled={deleting === defaultMethod.id}
            onClick={() => handleDelete(defaultMethod.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
