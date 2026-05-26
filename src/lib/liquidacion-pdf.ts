import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Liquidation, LiquidationItem } from "@/lib/types";

const CONCEPT_LABELS: Record<string, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses sobre cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
  indemnizacion: "Indemnización",
  otro: "Otro",
};

const REASON_LABELS: Record<string, string> = {
  renuncia: "Renuncia voluntaria",
  mutuo_acuerdo: "Mutuo acuerdo",
  justa_causa: "Terminación con justa causa",
  sin_justa_causa: "Despido sin justa causa",
  fin_contrato: "Terminación del contrato",
};

function formatCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export interface LiquidacionPdfData {
  liquidation: Liquidation;
  items: LiquidationItem[];
  employee: { full_name: string; document_id?: string };
  companyName?: string;
}

export function generateLiquidacionPdf(data: LiquidacionPdfData): Blob {
  const { liquidation, items, employee } = data;
  const companyName = data.companyName ?? "Liquidación de prestaciones sociales";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;

  // ── Membrete ──
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, marginLeft, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Liquidación final de contrato", marginLeft, 17);

  // ── Datos del empleado / contrato ──
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  let y = 32;
  doc.text(`Empleado: ${employee.full_name}`, marginLeft, y);
  if (employee.document_id) {
    doc.text(`Documento: ${employee.document_id}`, marginLeft, (y += 6));
  }
  doc.text(
    `Período laborado: ${liquidation.hire_date} a ${liquidation.termination_date}`,
    marginLeft,
    (y += 6)
  );
  doc.text(
    `Motivo: ${REASON_LABELS[liquidation.reason] ?? liquidation.reason}`,
    marginLeft,
    (y += 6)
  );
  y += 6;

  // ── Tabla de conceptos ──
  const total = items.reduce((acc, it) => acc + Number(it.amount), 0);
  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Base", "Días", "Valor"]],
    body: items.map((it) => [
      CONCEPT_LABELS[it.concept] ?? it.concept,
      it.base != null ? formatCOP(Number(it.base)) : "—",
      it.days != null ? String(it.days) : "—",
      formatCOP(Number(it.amount)),
    ]),
    foot: [["Total a pagar", "", "", formatCOP(total)]],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
    footStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 11,
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    theme: "striped",
    margin: { left: marginLeft, right: 14 },
  });

  // ── Espacio de firma ──
  y = (doc as any).lastAutoTable.finalY + 30;
  doc.setDrawColor(0, 0, 0);
  doc.line(marginLeft, y, marginLeft + 70, y);
  doc.setFontSize(9);
  doc.text("Firma del empleado", marginLeft, y + 5);
  doc.line(pageWidth - marginLeft - 70, y, pageWidth - marginLeft, y);
  doc.text("Firma del empleador", pageWidth - marginLeft - 70, y + 5);

  return doc.output("blob");
}
