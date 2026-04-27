"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { PeriodGenerateModal } from "@/components/nomina/period-generate-modal";
import type { PayrollPeriod, PaymentFrequency } from "@/lib/types";

// Aggregated data per period computed client-side from payroll_entries
interface PeriodRow {
  period: PayrollPeriod;
  employeeCount: number;
  totalDevengado: number;
  totalDeducciones: number;
  totalNeto: number;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950" },
  approved: { label: "Aprobado", className: "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950" },
  paid: { label: "Pagado", className: "border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950" },
};

const FREQUENCY_LABELS: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function getYearFromPeriod(period: PayrollPeriod): number {
  return parseInt(period.period_start.split("-")[0], 10);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

export default function PeriodosNominaPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  // entries needed for aggregates: {period_id, employee_id, is_income, amount}
  const [entriesByPeriod, setEntriesByPeriod] = useState<
    Record<string, { employee_id: string; is_income: boolean; amount: number }[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [appFrequency, setAppFrequency] = useState<PaymentFrequency>("mensual");

  // Filters
  const [yearFilter, setYearFilter] = useState<string>(String(CURRENT_YEAR));
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: periodsData }, { data: flagsData }] = await Promise.all([
      supabase
        .from("payroll_periods")
        .select("*")
        .order("period_start", { ascending: false }),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "app_flags")
        .maybeSingle(),
    ]);

    const fetchedPeriods: PayrollPeriod[] = periodsData ?? [];
    setPeriods(fetchedPeriods);

    if (flagsData?.value?.payment_frequency) {
      setAppFrequency(flagsData.value.payment_frequency as PaymentFrequency);
    }

    if (fetchedPeriods.length > 0) {
      const periodIds = fetchedPeriods.map((p) => p.id);
      const { data: entriesData } = await supabase
        .from("payroll_entries")
        .select("payroll_period_id, employee_id, is_income, amount")
        .in("payroll_period_id", periodIds);

      const grouped: Record<string, { employee_id: string; is_income: boolean; amount: number }[]> = {};
      for (const e of entriesData ?? []) {
        if (!grouped[e.payroll_period_id]) grouped[e.payroll_period_id] = [];
        grouped[e.payroll_period_id].push({
          employee_id: e.employee_id,
          is_income: e.is_income,
          amount: e.amount,
        });
      }
      setEntriesByPeriod(grouped);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== "admin") router.replace("/dashboard");
  }, [profile, authLoading, router]);

  const rows: PeriodRow[] = useMemo(() => {
    return periods.map((p) => {
      const entries = entriesByPeriod[p.id] ?? [];
      const totalDevengado = entries
        .filter((e) => e.is_income)
        .reduce((s, e) => s + e.amount, 0);
      const totalDeducciones = entries
        .filter((e) => !e.is_income)
        .reduce((s, e) => s + e.amount, 0);
      const employeeCount = new Set(entries.map((e) => e.employee_id)).size;
      return {
        period: p,
        employeeCount,
        totalDevengado,
        totalDeducciones,
        totalNeto: totalDevengado - totalDeducciones,
      };
    });
  }, [periods, entriesByPeriod]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const yearMatch =
        yearFilter === "all" || getYearFromPeriod(r.period) === parseInt(yearFilter, 10);
      const statusMatch =
        statusFilter === "all" || r.period.status === statusFilter;
      return yearMatch && statusMatch;
    });
  }, [rows, yearFilter, statusFilter]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.role !== "admin") return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Períodos de nómina</h1>
          <p className="text-muted-foreground">
            Genera, revisa y aprueba los períodos de liquidación salarial.
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generar nuevo período
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los años</SelectItem>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="approved">Aprobado</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Empleados</TableHead>
                  <TableHead className="text-right">Devengado</TableHead>
                  <TableHead className="text-right">Deducciones</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead>Fecha aprobación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No hay períodos para los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map(({ period, employeeCount, totalDevengado, totalDeducciones, totalNeto }) => {
                  const statusCfg = STATUS_CONFIG[period.status] ?? STATUS_CONFIG.draft;
                  return (
                    <TableRow
                      key={period.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/nomina/periodos/${period.id}`)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(period.period_start)} — {formatDate(period.period_end)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {FREQUENCY_LABELS[period.frequency] ?? period.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusCfg.className}
                        >
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{employeeCount}</TableCell>
                      <TableCell className="text-right">{formatCOP(totalDevengado)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        {formatCOP(totalDeducciones)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCOP(totalNeto)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {period.approved_at
                          ? new Date(period.approved_at).toLocaleDateString("es-CO")
                          : "—"}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/nomina/periodos/${period.id}`)}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <PeriodGenerateModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        frequency={appFrequency}
      />
    </div>
  );
}
