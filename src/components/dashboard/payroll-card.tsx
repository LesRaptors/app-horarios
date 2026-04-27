"use client";

import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMyPayroll } from "@/hooks/use-my-payroll";
import { computeNetToBank } from "@/lib/payroll-employee-helpers";
import { formatCOP } from "@/lib/payroll-helpers";
import { MONTHS } from "@/lib/constants";
import type { PayrollPeriodStatus } from "@/lib/types";

const STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  draft: "Borrador",
  approved: "Aprobado",
  paid: "Pagado",
};

const STATUS_VARIANTS: Record<
  PayrollPeriodStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  approved: "secondary",
  paid: "default",
};

function periodLabel(periodStart: string): string {
  // periodStart is YYYY-MM-DD; extract month (1-indexed) and year.
  const [yearStr, monthStr] = periodStart.split("-");
  const month = parseInt(monthStr, 10); // 1-12
  const year = parseInt(yearStr, 10);
  return `${MONTHS[month - 1]} ${year}`;
}

export function PayrollCard() {
  const { loading, period, entries } = useMyPayroll();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Mi pago</CardTitle>
        <Wallet className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando…</span>
          </div>
        ) : !period ? (
          <p className="text-sm text-muted-foreground">
            Tu primer pago aparecerá aquí cuando esté listo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground capitalize">
                {periodLabel(period.period_start)}
              </span>
              <Badge variant={STATUS_VARIANTS[period.status]}>
                {STATUS_LABELS[period.status]}
              </Badge>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                Te depositaron
              </p>
              <div className="text-2xl font-bold">
                {formatCOP(computeNetToBank(entries))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                + Devengado{" "}
                {formatCOP(
                  entries
                    .filter((e) => e.is_income)
                    .reduce((s, e) => s + Number(e.amount), 0)
                )}
              </p>
              <p>
                − Deducciones{" "}
                {formatCOP(
                  entries
                    .filter((e) => !e.is_income)
                    .reduce((s, e) => s + Number(e.amount), 0)
                )}
              </p>
            </div>

            <Link href="/mi-pago">
              <Button size="sm" className="w-full">
                Ver detalle
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
