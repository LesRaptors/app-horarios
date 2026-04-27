"use client";

import { Download, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCOP } from "@/lib/payroll-helpers";
import { formatDate } from "@/lib/utils";
import type { PayrollPeriod } from "@/lib/types";

interface Props {
  period: PayrollPeriod | null;
  availablePeriods: PayrollPeriod[];
  netToBank: number;
  devengado: number;
  deducciones: number;
  onPeriodChange: (id: string) => void;
  onDownloadPdf: () => void;
}

function statusLabel(status: PayrollPeriod["status"]): string {
  if (status === "paid") return "Pagado";
  if (status === "approved") return "Aprobado";
  return "Borrador";
}

function statusVariant(
  status: PayrollPeriod["status"]
): "default" | "secondary" | "outline" {
  if (status === "paid") return "default";
  if (status === "approved") return "secondary";
  return "outline";
}

function periodLabel(p: PayrollPeriod): string {
  const start = formatDate(p.period_start);
  const end = formatDate(p.period_end);
  const freq = p.frequency === "quincenal" ? "Quincenal" : "Mensual";
  return `${start} – ${end} (${freq})`;
}

function modeLabel(p: PayrollPeriod): string {
  if (p.is_advance) return "Anticipo Q1";
  return "Liquidacion";
}

export function PayrollHeader({
  period,
  availablePeriods,
  netToBank,
  devengado,
  deducciones,
  onPeriodChange,
  onDownloadPdf,
}: Props) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Top bar: selector + status badges + download */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <Select
              value={period?.id ?? ""}
              onValueChange={onPeriodChange}
              disabled={!period}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un periodo" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {periodLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {period && (
            <>
              <Badge variant={statusVariant(period.status)}>
                {statusLabel(period.status)}
              </Badge>
              <Badge variant="outline">{modeLabel(period)}</Badge>
            </>
          )}

          <Button
            onClick={onDownloadPdf}
            disabled={!period}
            className="ml-auto"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>

        {/* Q1 advance banner */}
        {period?.is_advance && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Este es un anticipo de la primera quincena. La liquidacion completa
            llega a fin de mes.
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Te depositamos — highlighted */}
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 flex items-start gap-3">
            <Wallet className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Te depositamos
              </p>
              <p className="text-2xl font-bold text-primary">
                {formatCOP(netToBank)}
              </p>
            </div>
          </div>

          {/* Devengado */}
          <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Devengado
              </p>
              <p className="text-xl font-semibold text-green-700">
                {formatCOP(devengado)}
              </p>
            </div>
          </div>

          {/* Deducciones */}
          <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
            <TrendingDown className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Deducciones
              </p>
              <p className="text-xl font-semibold text-red-600">
                -{formatCOP(deducciones)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
