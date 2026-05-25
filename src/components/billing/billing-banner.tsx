"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { useAuth } from "@/hooks/use-auth";
import { canAdmin } from "@/lib/auth/can-manage";
import { isBillingEnabled } from "@/lib/billing/feature-flag";

export function BillingBanner() {
  const { profile } = useAuth();
  // Gatear el query por el feature flag además del rol: con billing OFF no se
  // consulta subscriptions (consistente con el badge del sidebar).
  const enabled = canAdmin(profile?.role) && isBillingEnabled();
  const { isTrialingNearEnd, isPastDue, trialDaysLeft } = useBillingStatus(enabled);

  if (!enabled) return null;
  if (!isTrialingNearEnd && !isPastDue) return null;

  const color = isPastDue
    ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
    : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200";

  const message = isPastDue
    ? "No pudimos cobrar tu última factura. Actualiza tu tarjeta para evitar la pausa de tu cuenta."
    : `Tu trial vence en ${trialDaysLeft} día${trialDaysLeft === 1 ? "" : "s"}. Agrega un método de pago.`;

  return (
    <div role="alert" className={`flex items-center gap-3 border-l-4 px-4 py-3 ${color}`}>
      <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden />
      <p className="flex-1 text-sm">{message}</p>
      <Link href="/facturacion" className="text-sm font-semibold underline">
        {isPastDue ? "Actualizar tarjeta" : "Agregar tarjeta"}
      </Link>
    </div>
  );
}
