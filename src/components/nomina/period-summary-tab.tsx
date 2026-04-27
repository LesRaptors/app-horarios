"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { assemblePayrollPeriod } from "@/lib/payroll-period-builder";
import type { PayrollPeriod, PayrollEntry, PayrollEmployerCost } from "@/lib/types";

interface Props {
  period: PayrollPeriod;
  entries: PayrollEntry[];
  employerCosts: PayrollEmployerCost[];
  /** Hard errors per employee — block approve */
  errors: string[];
  /** Soft warnings per employee */
  warnings: string[];
  /** Total distinct employees in the period */
  employeeCount: number;
  /** Called after any status change so parent can re-fetch */
  onChanged: () => void;
  /** Current user's auth id */
  userId: string;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PeriodSummaryTab({
  period,
  entries,
  employerCosts,
  errors,
  warnings,
  employeeCount,
  onChanged,
  userId,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Compute KPIs from entries
  const totalDevengado = entries
    .filter((e) => e.is_income && !e.is_manual_override)
    .reduce((s, e) => s + e.amount, 0);
  const totalManualIncome = entries
    .filter((e) => e.is_income && e.is_manual_override)
    .reduce((s, e) => s + e.amount, 0);
  const totalDeducciones = entries
    .filter((e) => !e.is_income)
    .reduce((s, e) => s + e.amount, 0);
  const totalNeto = totalDevengado + totalManualIncome - totalDeducciones;
  const totalCostoEmpleador = employerCosts.reduce((s, c) => s + c.total, 0);

  async function handleRecalcular() {
    setActionLoading("recalcular");
    try {
      const result = await assemblePayrollPeriod(
        period.id,
        period.period_start,
        period.period_end,
        period.frequency,
        null,
        true // replace existing non-manual rows
      );
      toast.success(`Recálculo completado (${result.employeesProcessed} empleados).`);
      onChanged();
    } catch (err) {
      toast.error("Error al recalcular.");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAprobar() {
    if (errors.length > 0) {
      toast.error("No se puede aprobar: hay errores que deben resolverse primero.");
      return;
    }
    setActionLoading("aprobar");
    const { error } = await supabase
      .from("payroll_periods")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq("id", period.id);
    setActionLoading(null);
    if (error) {
      toast.error(`No se pudo aprobar: ${error.message}`);
      return;
    }
    toast.success("Período aprobado.");
    onChanged();
  }

  async function handleReabrir() {
    setActionLoading("reabrir");
    const { error } = await supabase
      .from("payroll_periods")
      .update({ status: "draft", approved_at: null, approved_by: null })
      .eq("id", period.id);
    setActionLoading(null);
    if (error) {
      toast.error(`No se pudo reabrir: ${error.message}`);
      return;
    }
    toast.success("Período reabierto como borrador.");
    onChanged();
  }

  async function handleMarcarPagado() {
    setActionLoading("pagar");
    const { error } = await supabase
      .from("payroll_periods")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: userId,
      })
      .eq("id", period.id);
    setActionLoading(null);
    if (error) {
      toast.error(`No se pudo marcar como pagado: ${error.message}`);
      return;
    }
    toast.success("Período marcado como pagado.");
    onChanged();
  }

  const isLoading = actionLoading !== null;
  const status = period.status;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total devengado" value={formatCOP(totalDevengado + totalManualIncome)} />
        <KpiCard label="Total deducciones" value={formatCOP(totalDeducciones)} />
        <KpiCard label="Total neto" value={formatCOP(totalNeto)} />
        <KpiCard label="Costo empleador" value={formatCOP(totalCostoEmpleador)} />
        <KpiCard label="Empleados" value={String(employeeCount)} />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              Errores ({errors.length}) — bloquean aprobación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-destructive">
              {errors.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-yellow-400">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              Advertencias ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* No issues */}
      {errors.length === 0 && warnings.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          Sin errores ni advertencias en este período.
        </div>
      )}

      {/* Status badge + metadata */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <StatusBadge status={status} />
        {status === "approved" && period.approved_at && (
          <span>Aprobado el {new Date(period.approved_at).toLocaleString("es-CO")}</span>
        )}
        {status === "paid" && period.paid_at && (
          <span>Pagado el {new Date(period.paid_at).toLocaleString("es-CO")}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {status === "draft" && (
          <>
            <Button
              variant="outline"
              onClick={handleRecalcular}
              disabled={isLoading}
            >
              {actionLoading === "recalcular" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Recalcular todos
            </Button>
            <Button
              onClick={handleAprobar}
              disabled={isLoading || errors.length > 0}
            >
              {actionLoading === "aprobar" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Aprobar
            </Button>
          </>
        )}

        {status === "approved" && (
          <>
            <Button
              variant="outline"
              onClick={handleReabrir}
              disabled={isLoading}
            >
              {actionLoading === "reabrir" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reabrir
            </Button>
            <Button
              onClick={handleMarcarPagado}
              disabled={isLoading}
            >
              {actionLoading === "pagar" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Marcar como pagado
            </Button>
          </>
        )}

        {status === "paid" && (
          <p className="text-sm text-muted-foreground">
            Este período está pagado y es de solo lectura.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    draft: { label: "Borrador", variant: "outline" },
    approved: { label: "Aprobado", variant: "default" },
    paid: { label: "Pagado", variant: "secondary" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
