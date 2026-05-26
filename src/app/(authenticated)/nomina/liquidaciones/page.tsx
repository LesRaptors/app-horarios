"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/shared/page-header";
import { LiquidacionForm } from "@/components/nomina/liquidacion-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Row {
  id: string;
  termination_date: string;
  reason: string;
  status: string;
  employee: { first_name: string; last_name: string } | null;
}

const REASON_LABELS: Record<string, string> = {
  renuncia: "Renuncia",
  mutuo_acuerdo: "Mutuo acuerdo",
  justa_causa: "Justa causa",
  sin_justa_causa: "Sin justa causa",
  fin_contrato: "Fin de contrato",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  approved: "Aprobada",
  paid: "Pagada",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function LiquidacionesPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (profile && profile.role !== "admin" && profile.role !== "super_admin") {
      router.replace("/dashboard");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("liquidations")
      .select("id, termination_date, reason, status, employee:profiles(first_name, last_name)")
      .order("termination_date", { ascending: false });
    const list = (data ?? []) as Row[];
    setRows(list);

    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("liquidation_items")
        .select("liquidation_id, amount")
        .in("liquidation_id", ids);
      const t: Record<string, number> = {};
      for (const it of (items ?? []) as { liquidation_id: string; amount: number }[]) {
        t[it.liquidation_id] = (t[it.liquidation_id] ?? 0) + Number(it.amount);
      }
      setTotals(t);
    }
    setLoading(false);
  }

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }

  if (profile.role !== "admin" && profile.role !== "super_admin") return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquidaciones"
        description="Liquidación final de prestaciones por terminación de contrato"
        action={{ label: "Nueva liquidación", onClick: () => setModalOpen(true) }}
      />

      <Table>
        {/* Caption aids screen-reader users navigating via table landmarks */}
        <caption className="sr-only">
          Listado de liquidaciones de prestaciones sociales por terminación de contrato
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Empleado</TableHead>
            <TableHead scope="col">Fecha terminación</TableHead>
            <TableHead scope="col">Motivo</TableHead>
            <TableHead scope="col" className="text-right">Total</TableHead>
            <TableHead scope="col">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                <Loader2 aria-hidden="true" className="inline-block h-4 w-4 animate-spin mr-2" />
                Cargando…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No hay liquidaciones.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`Ver liquidación de ${[r.employee?.first_name, r.employee?.last_name].filter(Boolean).join(" ") || "empleado"}, ${r.termination_date}`}
                onClick={() => router.push(`/nomina/liquidaciones/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/nomina/liquidaciones/${r.id}`);
                  }
                }}
              >
                <TableCell>{[r.employee?.first_name, r.employee?.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell>{r.termination_date}</TableCell>
                <TableCell>{REASON_LABELS[r.reason] ?? r.reason}</TableCell>
                <TableCell className="text-right">{fmt(totals[r.id] ?? 0)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "paid" ? "default" : "secondary"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <LiquidacionForm
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) void load();
        }}
      />
    </div>
  );
}
