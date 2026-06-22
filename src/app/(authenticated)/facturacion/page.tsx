"use client";

import { useEffect, useState } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { canAdmin } from "@/lib/auth/can-manage";
import { isBillingEnabled } from "@/lib/billing/feature-flag";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { PlanCard } from "@/components/billing/plan-card";
import { WompiWidgetButton } from "@/components/billing/wompi-widget-button";
import { PaymentMethodCard } from "@/components/billing/payment-method-card";
import { DianProviderConfig } from "@/components/billing/dian-provider-config";
import { InvoiceHistoryTable } from "@/components/billing/invoice-history-table";
import { createClient } from "@/lib/supabase/client";
import type { Plan } from "@/lib/billing/types";
import type { UserRole } from "@/lib/types";
import { toast } from "sonner";

/* ─── helpers ─────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active:    { label: "Activa",        className: "bg-green-100 text-green-800" },
  trialing:  { label: "Trial",         className: "bg-blue-100 text-blue-800" },
  past_due:  { label: "Pago vencido",  className: "bg-red-100 text-red-800" },
  paused:    { label: "Pausada",       className: "bg-yellow-100 text-yellow-800" },
  canceled:  { label: "Cancelada",     className: "bg-gray-100 text-gray-600" },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtCOP(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ─── types ────────────────────────────────────────────────── */

interface SubscriptionRow {
  plan_id: string | null;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean | null;
}

/* ─── page ─────────────────────────────────────────────────── */

export default function FacturacionPage() {
  const { profile, effectiveOrgId } = useAuth();

  // Gate: feature flag (soft launch)
  if (!isBillingEnabled()) {
    notFound();
  }

  // Gate: only admin / super_admin
  if (!canAdmin(profile?.role as UserRole | null)) {
    return (
      <p className="text-muted-foreground">
        No tienes permisos para ver esta página.
      </p>
    );
  }

  return <FacturacionContent orgId={effectiveOrgId} />;
}

function FacturacionContent({ orgId }: { orgId: string | null }) {
  const { subscription: billingStatusSub, isPastDue } = useBillingStatus(!!orgId);

  // Plans list
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Full subscription row (includes plan_id which useBillingStatus omits)
  const [subRow, setSubRow] = useState<SubscriptionRow | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  // Plan picker dialog
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);

  // Cancel confirm dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();

    const fetchPlans = async () => {
      setPlansLoading(true);
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      setPlans(data ?? []);
      setPlansLoading(false);
    };

    const fetchSub = async () => {
      setSubLoading(true);
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_id, status, current_period_end, cancel_at_period_end")
        .eq("organization_id", orgId)
        .maybeSingle();
      setSubRow(data as SubscriptionRow | null);
      setSubLoading(false);
    };

    void fetchPlans();
    void fetchSub();
  }, [orgId]);

  const currentPlan = plans.find((p) => p.id === subRow?.plan_id) ?? null;
  const currentPlanId = subRow?.plan_id ?? "";

  const statusInfo =
    subRow?.status ? (STATUS_LABEL[subRow.status] ?? { label: subRow.status, className: "bg-gray-100 text-gray-600" }) : null;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/billing/subscriptions/cancel", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? "Error al cancelar la suscripción.");
        return;
      }
      const body = (await res.json()) as { effective?: string };
      toast.success(
        `Suscripción cancelada. Finaliza el ${fmtDate(body.effective ?? null)}.`
      );
      // Refresh sub row
      setCancelDialogOpen(false);
      const supabase = createClient();
      const { data } = await supabase
        .from("subscriptions")
        .select("plan_id, status, current_period_end, cancel_at_period_end")
        .eq("organization_id", orgId!)
        .maybeSingle();
      setSubRow(data as SubscriptionRow | null);
    } catch {
      toast.error("Error inesperado al cancelar la suscripción.");
    } finally {
      setCancelling(false);
    }
  };

  const isLoading = plansLoading || subLoading;

  // super_admin en modo panel (sin tenant activo) → effectiveOrgId null. Sin esto
  // los flags de loading nunca pasan a false y la pestaña Plan gira para siempre.
  if (!orgId) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Facturación</h1>
          <p className="text-muted-foreground">
            Gestiona tu plan, método de pago y facturas.
          </p>
        </header>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Selecciona un tenant activo para ver la facturación.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header>
        <h1 className="text-3xl font-bold">Facturación</h1>
        <p className="text-muted-foreground">
          Gestiona tu plan, método de pago y facturas.
        </p>
      </header>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="payment">Método de pago</TabsTrigger>
          <TabsTrigger value="dian">DIAN</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        {/* ── Plan tab ───────────────────────────────────────── */}
        <TabsContent value="plan" className="mt-4 space-y-4">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle>
                      {currentPlan?.name ?? "Sin plan activo"}
                    </CardTitle>
                    {statusInfo && (
                      <Badge className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {currentPlan && (
                    <p className="text-2xl font-bold">
                      {fmtCOP(currentPlan.price_cop)}
                      <span className="text-base font-normal text-muted-foreground">
                        /mes
                      </span>
                    </p>
                  )}
                  {subRow?.current_period_end && (
                    <p className="text-sm text-muted-foreground">
                      Próximo cobro:{" "}
                      <span className="font-medium text-foreground">
                        {fmtDate(subRow.current_period_end)}
                      </span>
                      {currentPlan?.price_cop != null && (
                        <> — {fmtCOP(currentPlan.price_cop)}</>
                      )}
                    </p>
                  )}

                  {subRow?.cancel_at_period_end ? (
                    <p className="text-sm font-medium text-destructive">
                      Cancelarás el {fmtDate(subRow.current_period_end)}. Tu acceso se mantiene hasta esa fecha.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setPlanDialogOpen(true)}
                    >
                      Cambiar plan
                    </Button>

                    {!subRow?.cancel_at_period_end && subRow?.status !== "canceled" && (
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancelDialogOpen(true)}
                      >
                        Cancelar suscripción
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {isPastDue && (
                <Card className="border-red-300 bg-red-50">
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-red-700">
                      Tu pago está vencido. Actualiza tu método de pago para evitar la suspensión del servicio.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Payment tab ────────────────────────────────────── */}
        <TabsContent value="payment" className="mt-4">
          {/*
            Pass currentPlanId to PaymentMethodCard so WompiWidgetButton
            receives the real plan_id for both "Cambiar tarjeta" and
            "Agregar tarjeta". Falls back to first active plan if org
            is trialing without a plan_id yet.
          */}
          <PaymentMethodCard
            planId={currentPlanId || (plans[0]?.id ?? "")}
          />
        </TabsContent>

        {/* ── DIAN tab ───────────────────────────────────────── */}
        <TabsContent value="dian" className="mt-4">
          <DianProviderConfig />
        </TabsContent>

        {/* ── History tab ────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <InvoiceHistoryTable />
        </TabsContent>
      </Tabs>

      {/* ── Plan picker dialog ─────────────────────────────────
          Uses shadcn Dialog (wraps native <dialog>, calls showModal(),
          provides focus trap + Esc dismiss + aria-labelledby).
          DOs applied:
          - DialogTitle gives the dialog its accessible name.
          - DialogClose (cancel button) dismisses without custom JS.
          - WompiWidgetButton rendered inline once a plan is chosen,
            resolving the T22 planId="" placeholder.
      ────────────────────────────────────────────────────────── */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Elige un plan</DialogTitle>
            <DialogDescription>
              Selecciona el plan que mejor se ajuste a tu equipo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={plan.id === subRow?.plan_id}
                onChoose={() => setChosenPlanId(plan.id)}
              />
            ))}
          </div>

          {/* Once a plan is chosen, show the Wompi button with the real planId */}
          {chosenPlanId && (
            <div className="flex flex-col items-center gap-2 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Serás redirigido al widget de pago seguro de Wompi.
              </p>
              <WompiWidgetButton
                planId={chosenPlanId}
                label={`Pagar — ${plans.find((p) => p.id === chosenPlanId)?.name ?? ""}`}
              />
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={() => setChosenPlanId(null)}>
                Cancelar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel subscription confirm dialog ─────────────────
          Modal dialog with two clear actions (shadcn Dialog).
          Uses Button with onClick (not form method=dialog) because
          cancel requires an async API call.
      ────────────────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar suscripción</DialogTitle>
            <DialogDescription>
              Tu acceso se mantiene hasta el final del período actual (
              {fmtDate(subRow?.current_period_end)}). No se realizarán cargos
              adicionales.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={cancelling}>
                Mantener suscripción
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? "Cancelando..." : "Sí, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
