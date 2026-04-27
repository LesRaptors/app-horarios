"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  computeNetToBank,
  computeYtdSummary,
} from "@/lib/payroll-employee-helpers";
import { formatCOP } from "@/lib/payroll-helpers";
import { MONTHS } from "@/lib/constants";
import type { PayrollPeriod, PayrollEntry, PayrollProvision } from "@/lib/types";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

interface PeriodRow {
  period: PayrollPeriod;
  netToBank: number;
  devengado: number;
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

function monthFromPeriod(period: PayrollPeriod): string {
  const [, monthStr] = period.period_start.split("-");
  const month = parseInt(monthStr, 10);
  return MONTHS[month - 1] ?? monthStr;
}

/** Minimal bar chart using divs */
function MonthlyBarChart({ rows }: { rows: PeriodRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.netToBank), 1);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin datos para mostrar
      </p>
    );
  }

  return (
    <div className="flex items-end gap-2 h-32 pt-4">
      {rows.map((r) => {
        const pct = (r.netToBank / max) * 100;
        return (
          <div
            key={r.period.id}
            className="flex flex-col items-center flex-1 gap-1"
          >
            <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
              {formatCOP(r.netToBank)}
            </span>
            <div className="w-full flex items-end h-20">
              <div
                className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                style={{ height: `${Math.max(4, pct)}%` }}
                title={`${monthFromPeriod(r.period)}: ${formatCOP(r.netToBank)}`}
              />
            </div>
            <span className="text-xs text-muted-foreground text-center truncate w-full">
              {monthFromPeriod(r.period)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function HistorialPage() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [entriesByPeriod, setEntriesByPeriod] = useState<
    Record<string, PayrollEntry[]>
  >({});
  const [provisionsByPeriod, setProvisionsByPeriod] = useState<
    Record<string, PayrollProvision[]>
  >({});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = useMemo(() => createClient() as any, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const yearNum = parseInt(selectedYear, 10);
      const startDate = `${yearNum}-01-01`;
      const endDate = `${yearNum}-12-31`;

      // Fetch periods that overlap the year and have the employee's entries
      const { data: periodsData } = await supabase
        .from("payroll_periods")
        .select("*, payroll_entries!inner(employee_id)")
        .in("status", ["approved", "paid"])
        .gte("period_start", startDate)
        .lte("period_end", endDate)
        .eq("payroll_entries.employee_id", user.id)
        .order("period_start", { ascending: true });

      if (cancelled) return;

      const myPeriods = (
        (periodsData ?? []) as Array<
          PayrollPeriod & { payroll_entries: unknown }
        >
      ).map(({ payroll_entries: _ignore, ...rest }) => rest as PayrollPeriod);

      // Dedupe
      const seen = new Set<string>();
      const uniquePeriods = myPeriods.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      setPeriods(uniquePeriods);

      if (uniquePeriods.length === 0) {
        setEntriesByPeriod({});
        setProvisionsByPeriod({});
        setLoading(false);
        return;
      }

      const periodIds = uniquePeriods.map((p) => p.id);

      const [entriesRes, provRes] = await Promise.all([
        supabase
          .from("payroll_entries")
          .select("*")
          .in("payroll_period_id", periodIds)
          .eq("employee_id", user.id),
        supabase
          .from("payroll_provisions")
          .select("*")
          .in("payroll_period_id", periodIds)
          .eq("employee_id", user.id),
      ]);

      if (cancelled) return;

      const allEntries = (entriesRes.data ?? []) as PayrollEntry[];
      const allProvisions = (provRes.data ?? []) as PayrollProvision[];

      const eMap: Record<string, PayrollEntry[]> = {};
      for (const e of allEntries) {
        if (!eMap[e.payroll_period_id]) eMap[e.payroll_period_id] = [];
        eMap[e.payroll_period_id].push(e);
      }

      const pMap: Record<string, PayrollProvision[]> = {};
      for (const p of allProvisions) {
        if (!pMap[p.payroll_period_id]) pMap[p.payroll_period_id] = [];
        pMap[p.payroll_period_id].push(p);
      }

      setEntriesByPeriod(eMap);
      setProvisionsByPeriod(pMap);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user, selectedYear]);

  const periodRows: PeriodRow[] = periods.map((p) => {
    const entries = entriesByPeriod[p.id] ?? [];
    return {
      period: p,
      netToBank: computeNetToBank(entries),
      devengado: entries
        .filter((e) => e.is_income)
        .reduce((s, e) => s + Number(e.amount), 0),
    };
  });

  // YTD summary across all periods in the year
  const allEntries = Object.values(entriesByPeriod).flat();
  const allProvisions = Object.values(provisionsByPeriod).flat();
  const ytdSummary = computeYtdSummary(
    allEntries,
    allProvisions,
    parseInt(selectedYear, 10)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/mi-pago">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Historial de pagos</h1>
          <p className="text-sm text-muted-foreground">
            Resumen anual de tus comprobantes
          </p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-36 w-full rounded-lg bg-muted" />
          <div className="h-48 w-full rounded-lg bg-muted" />
          <div className="h-64 w-full rounded-lg bg-muted" />
        </div>
      ) : periods.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center text-muted-foreground">
          <p className="font-medium">Sin períodos en {selectedYear}</p>
          <p className="text-sm mt-1">
            No se encontraron comprobantes aprobados o pagados para este año.
          </p>
        </div>
      ) : (
        <>
          {/* YTD summary card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Resumen acumulado {selectedYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 flex items-start gap-3">
                  <Wallet className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Neto recibido
                    </p>
                    <p className="text-xl font-bold text-primary">
                      {formatCOP(ytdSummary.neto)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Total devengado
                    </p>
                    <p className="text-xl font-semibold text-green-700">
                      {formatCOP(ytdSummary.devengado)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Total deducciones
                    </p>
                    <p className="text-xl font-semibold text-red-600">
                      {formatCOP(ytdSummary.deducciones)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Provisions summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Cesantías acumuladas", value: ytdSummary.cesantiasYtd },
                  { label: "Prima acumulada", value: ytdSummary.primaYtd },
                  { label: "Vacaciones acumuladas", value: ytdSummary.vacacionesYtd },
                  {
                    label: "Intereses cesantías",
                    value: ytdSummary.cesantiasInterestYtd,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-md border bg-amber-50 border-amber-200 p-3"
                  >
                    <p className="text-xs text-amber-700 font-medium">
                      {item.label}
                    </p>
                    <p className="text-sm font-semibold text-amber-900 mt-0.5">
                      {formatCOP(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Neto mensual — {selectedYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyBarChart rows={periodRows} />
            </CardContent>
          </Card>

          {/* Periods table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Comprobantes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Devengado</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodRows.map(({ period, netToBank, devengado }) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {monthFromPeriod(period)}{" "}
                        {period.period_start.split("-")[0]}
                        {period.is_advance && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (anticipo)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatCOP(devengado)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-sm">
                        {formatCOP(netToBank)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(period.status)}>
                          {statusLabel(period.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/mi-pago?period=${period.id}`}>
                            Ver
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
