"use client";
import { useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

declare global {
  interface Window {
    WidgetCheckout?: new (config: WompiWidgetConfig) => WompiWidgetInstance;
  }
}

interface WompiWidgetConfig {
  currency: string;
  amountInCents: number;
  reference: string;
  publicKey: string;
  signature: { integrity: string };
  redirectUrl?: string;
  customerData?: { email?: string };
}

interface WompiWidgetInstance {
  open: (callback: (result: { transaction: { status: string } }) => void) => void;
}

interface PrepareCheckoutResponse {
  publicKey: string;
  reference: string;
  amountInCents: number;
  currency: string;
  signature: string;
  customerEmail: string;
  redirectUrl: string;
}

interface WompiWidgetButtonProps {
  planId: string;
  label?: string;
  disabled?: boolean;
}

export function WompiWidgetButton({
  planId,
  label = "Pagar",
  disabled = false,
}: WompiWidgetButtonProps) {
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  const handleClick = async () => {
    if (!scriptReady || !window.WidgetCheckout) {
      toast.error("El widget de pago no está listo. Intenta de nuevo en un momento.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/billing/wompi/prepare-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? "Error al preparar el pago.");
        return;
      }

      const cfg = (await res.json()) as PrepareCheckoutResponse;

      const widget = new window.WidgetCheckout({
        currency: cfg.currency,
        amountInCents: cfg.amountInCents,
        reference: cfg.reference,
        publicKey: cfg.publicKey,
        signature: { integrity: cfg.signature },
        redirectUrl: cfg.redirectUrl,
        customerData: { email: cfg.customerEmail },
      });

      widget.open((result) => {
        const status = result?.transaction?.status;
        if (status === "APPROVED") {
          toast.success("Pago aprobado. Tu suscripción se ha activado.");
        } else if (status === "PENDING") {
          toast.info("Pago en proceso. Te notificaremos cuando se confirme.");
        } else if (status) {
          toast.error(`Estado de pago: ${status}. Intenta de nuevo.`);
        }
      });
    } catch {
      toast.error("Error inesperado al iniciar el pago.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Script
        src="https://checkout.wompi.co/widget.js"
        strategy="lazyOnload"
        onReady={() => setScriptReady(true)}
        onError={() => toast.error("No se pudo cargar el widget de pago.")}
      />
      <Button
        onClick={handleClick}
        disabled={disabled || loading || !scriptReady}
      >
        {loading ? "Procesando..." : label}
      </Button>
    </>
  );
}
