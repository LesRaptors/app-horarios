"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, History, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyPayroll } from "@/hooks/use-my-payroll";
import { useAuth } from "@/hooks/use-auth";
import { PayrollHeader } from "@/components/mi-pago/payroll-header";
import { PayrollSankey } from "@/components/mi-pago/payroll-sankey";
import { PayrollBreakdownList } from "@/components/mi-pago/payroll-breakdown-list";
import { PayrollProvisionsSection } from "@/components/mi-pago/payroll-provisions-section";
import { PayrollDetailAccordion } from "@/components/mi-pago/payroll-detail-accordion";
import {
  aggregateEntriesForSankey,
  computeNetToBank,
  computeYtdSummary,
} from "@/lib/payroll-employee-helpers";
import { generatePayrollPdf } from "@/lib/payroll-pdf";

function MiPagoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const periodId = searchParams.get("period") ?? undefined;

  const { loading, period, entries, provisions, employerCost, availablePeriods } =
    useMyPayroll(periodId);

  const netToBank = computeNetToBank(entries);
  const devengado = entries
    .filter((e) => e.is_income)
    .reduce((s, e) => s + Number(e.amount), 0);
  const deducciones = entries
    .filter((e) => !e.is_income)
    .reduce((s, e) => s + Number(e.amount), 0);

  const year = period
    ? parseInt(period.period_start.split("-")[0], 10)
    : new Date().getFullYear();
  const ytdSummary = computeYtdSummary(entries, provisions, year);
  const sankeyData = aggregateEntriesForSankey(entries, netToBank);

  function handlePeriodChange(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    router.replace(`/mi-pago?${params.toString()}`);
  }

  function handleDownloadPdf() {
    if (!period || !profile) return;
    const blob = generatePayrollPdf({
      period,
      employee: {
        full_name: `${profile.first_name} ${profile.last_name}`,
      },
      entries,
      provisions,
      employerCost,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `colilla-${period.period_start}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Page header with sub-links */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mi pago</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comprobante de pago y detalle de conceptos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/mi-pago/historial">
              <History className="h-4 w-4 mr-1.5" />
              Ver historial
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/mi-pago/glosario">
              <BookOpen className="h-4 w-4 mr-1.5" />
              Glosario
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-40 w-full rounded-lg bg-muted" />
          <div className="h-64 w-full rounded-lg bg-muted" />
          <div className="h-32 w-full rounded-lg bg-muted" />
        </div>
      ) : !period ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center text-muted-foreground">
          <Download className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay períodos de pago disponibles</p>
          <p className="text-sm mt-1">
            Cuando tu empleador apruebe o pague un período verás tu comprobante aquí.
          </p>
        </div>
      ) : (
        <>
          <PayrollHeader
            period={period}
            availablePeriods={availablePeriods}
            netToBank={netToBank}
            devengado={devengado}
            deducciones={deducciones}
            onPeriodChange={handlePeriodChange}
            onDownloadPdf={handleDownloadPdf}
          />

          {/* Sankey diagram (desktop only — hidden on mobile) */}
          <PayrollSankey data={sankeyData} height={380} />

          {/* Breakdown list (mobile first, also togglable on desktop) */}
          <PayrollBreakdownList entries={entries} netToBank={netToBank} />

          {/* Provisions */}
          <PayrollProvisionsSection
            provisions={provisions}
            ytdSummary={ytdSummary}
          />

          {/* Detail accordion */}
          <PayrollDetailAccordion
            entries={entries}
            provisions={provisions}
            employerCost={employerCost}
          />
        </>
      )}
    </div>
  );
}

export default function MiPagoPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 rounded bg-muted" />
            <div className="h-40 w-full rounded-lg bg-muted" />
            <div className="h-64 w-full rounded-lg bg-muted" />
          </div>
        }
      >
        <MiPagoContent />
      </Suspense>
    </div>
  );
}
