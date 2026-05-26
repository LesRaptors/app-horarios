"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { assembleLiquidacion } from "@/lib/liquidacion-builder";
import { generateLiquidacionPdf } from "@/lib/liquidacion-pdf";
import type { Liquidation, LiquidationItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CONCEPT_LABELS: Record<string, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses sobre cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
  indemnizacion: "Indemnización",
  otro: "Otro",
};

export default function LiquidacionDetailPage() {
  const params = useParams<{ id: string }>();
  const liqId = params.id;
  const router = useRouter();
  const { profile } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [liq, setLiq] = useState<Liquidation | null>(null);
  const [items, setItems] = useState<LiquidationItem[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liqId]);

  async function load() {
    setLoading(true);
    const [{ data: liqData }, { data: itemsData }] = await Promise.all([
      supabase
        .from("liquidations")
        .select("*, employee:profiles(full_name)")
        .eq("id", liqId)
        .maybeSingle(),
      supabase
        .from("liquidation_items")
        .select("*")
        .eq("liquidation_id", liqId)
        .order("concept"),
    ]);
    if (liqData) {
      setLiq(liqData as Liquidation);
      setEmployeeName((liqData as any).employee?.full_name ?? ""); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    setItems((itemsData ?? []) as LiquidationItem[]);
    setLoading(false);
  }

  const errors: string[] = Array.isArray(liq?.compute_errors)
    ? (liq!.compute_errors as string[])
    : [];
  const warnings: string[] = Array.isArray(liq?.compute_warnings)
    ? (liq!.compute_warnings as string[])
    : [];
  const total = items.reduce((acc, it) => acc + Number(it.amount), 0);
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);

  async function handleRecalc() {
    setBusy(true);
    await assembleLiquidacion(liqId);
    await load();
    setBusy(false);
    toast.success("Liquidación recalculada.");
  }

  async function handleApprove() {
    if (errors.length > 0) {
      toast.error("Corrige los errores antes de aprobar.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: profile?.id ?? null,
      })
      .eq("id", liqId);
    setBusy(false);
    if (error) {
      toast.error(`No se pudo aprobar: ${error.message}`);
      return;
    }
    await load();
    toast.success("Liquidación aprobada.");
  }

  async function handleReopen() {
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({ status: "draft", approved_at: null, approved_by: null })
      .eq("id", liqId);
    setBusy(false);
    if (error) {
      toast.error(`No se pudo reabrir: ${error.message}`);
      return;
    }
    await load();
    toast.success("Liquidación reabierta.");
  }

  async function handleMarkPaid() {
    setBusy(true);
    const { error } = await supabase
      .from("liquidations")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: profile?.id ?? null,
      })
      .eq("id", liqId);
    setBusy(false);
    if (error) {
      toast.error(`No se pudo marcar como pagada: ${error.message}`);
      return;
    }
    await load();
    toast.success("Liquidación marcada como pagada.");
  }

  function handlePdf() {
    if (!liq) return;
    const blob = generateLiquidacionPdf({
      liquidation: liq,
      items,
      employee: { full_name: employeeName },
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liquidacion-${employeeName.replace(/\s+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading)
    return <p className="text-muted-foreground">Cargando…</p>;
  if (!liq)
    return <p className="text-muted-foreground">No se encontró la liquidación.</p>;

  // Approve is blocked by errors: use aria-disabled so the button stays
  // focusable and screen readers can land on it and learn it's blocked.
  const approveBlocked = busy || errors.length > 0;

  return (
    <div className="space-y-6">
      {/* Live region — announces busy state to screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {busy ? "Procesando…" : ""}
      </div>

      <PageHeader
        title={`Liquidación — ${employeeName}`}
        description={`Terminación ${liq.termination_date}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={liq.status === "paid" ? "default" : "secondary"}>
          {liq.status === "draft"
            ? "Borrador"
            : liq.status === "approved"
              ? "Aprobada"
              : "Pagada"}
        </Badge>

        <div className="ml-auto flex flex-wrap gap-2">
          {liq.status === "draft" && (
            <>
              <Button
                variant="outline"
                onClick={handleRecalc}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? (
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 h-4 w-4 animate-spin"
                  />
                ) : (
                  <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
                )}
                Recalcular
              </Button>

              {/*
               * aria-disabled instead of disabled so the button stays focusable
               * when errors block approval — screen readers can announce why.
               * onClick guard prevents action when logically disabled.
               */}
              <Button
                onClick={approveBlocked ? undefined : handleApprove}
                aria-disabled={approveBlocked}
                disabled={busy}
                className={
                  errors.length > 0
                    ? "opacity-50 cursor-not-allowed"
                    : undefined
                }
              >
                Aprobar
              </Button>
            </>
          )}

          {liq.status === "approved" && (
            <>
              <Button
                variant="outline"
                onClick={handleReopen}
                disabled={busy}
                aria-busy={busy}
              >
                Reabrir
              </Button>
              <Button
                onClick={handleMarkPaid}
                disabled={busy}
                aria-busy={busy}
              >
                Marcar pagada
              </Button>
            </>
          )}

          <Button variant="outline" onClick={handlePdf}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            Descargar PDF
          </Button>
        </div>
      </div>

      {/* Errors panel — role="alert" interrupts immediately (critical: blocks approval) */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
        >
          <p className="mb-2 flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Errores ({errors.length}) — bloquean la aprobación
          </p>
          <ul className="list-disc pl-6 text-sm text-red-700 dark:text-red-300">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings panel — role="status" announces at next polite break (non-blocking) */}
      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
        >
          <p className="mb-2 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Advertencias ({warnings.length})
          </p>
          <ul className="list-disc pl-6 text-sm text-amber-700 dark:text-amber-300">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Días</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell>
                {CONCEPT_LABELS[it.concept] ?? it.concept}
                {it.is_manual_override && (
                  <Badge variant="outline" className="ml-2">
                    Manual
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {it.base != null ? fmt(Number(it.base)) : "—"}
              </TableCell>
              <TableCell className="text-right">{it.days ?? "—"}</TableCell>
              <TableCell className="text-right">{fmt(Number(it.amount))}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold">
            <TableCell colSpan={3}>Total a pagar</TableCell>
            <TableCell className="text-right">{fmt(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
