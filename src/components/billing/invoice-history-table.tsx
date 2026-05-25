"use client";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { useBillingInvoices } from "@/hooks/use-billing-invoices";
import { useAuth } from "@/hooks/use-auth";
import { canAdmin } from "@/lib/auth/can-manage";
import type { Invoice, InvoiceStatus } from "@/lib/billing/types";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  open: "Pendiente",
  paid: "Pagada",
  failed: "Fallida",
  void: "Anulada",
};

const STATUS_VARIANT: Record<
  InvoiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  open: "outline",
  paid: "default",
  failed: "destructive",
  void: "secondary",
};

function InvoiceStatusBadge({ status }: { status: string }) {
  const s = status as InvoiceStatus;
  const label = STATUS_LABELS[s] ?? status;
  const variant = STATUS_VARIANT[s] ?? "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

const COLUMNS = [
  {
    header: "Fecha",
    cell: (inv: Invoice) =>
      inv.created_at
        ? new Date(inv.created_at).toLocaleDateString("es-CO", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "—",
  },
  {
    header: "Plan",
    cell: (inv: Invoice) => inv.plan_id,
  },
  {
    header: "Monto",
    className: "text-right",
    cell: (inv: Invoice) => cop.format(inv.total_cop),
  },
  {
    header: "Estado",
    cell: (inv: Invoice) => <InvoiceStatusBadge status={inv.status} />,
  },
  {
    header: "DIAN",
    cell: (inv: Invoice) => inv.dian_status ?? "—",
  },
  {
    header: "Acción",
    cell: (inv: Invoice) =>
      inv.dian_pdf_url ? (
        <a
          href={inv.dian_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Descargar factura DIAN"
          className="inline-flex items-center gap-1 text-sm underline hover:no-underline"
        >
          <Download className="h-4 w-4" aria-hidden />
          PDF
        </a>
      ) : (
        "—"
      ),
  },
];

export function InvoiceHistoryTable() {
  const { profile } = useAuth();
  const enabled = canAdmin(profile?.role);
  const { invoices, loading } = useBillingInvoices(enabled);

  return (
    <DataTable<Invoice>
      columns={COLUMNS}
      data={invoices}
      loading={loading}
      emptyMessage="No hay facturas todavía"
      keyAccessor={(inv) => inv.id}
    />
  );
}
