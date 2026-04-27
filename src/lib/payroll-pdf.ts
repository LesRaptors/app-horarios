import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCOP } from "@/lib/payroll-helpers";
import { computeNetToBank } from "@/lib/payroll-employee-helpers";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollProvision,
  PayrollEmployerCost,
  PayrollConceptType,
  ProvisionConcept,
} from "@/lib/types";
import { MONTHS } from "@/lib/constants";

const CONCEPT_LABELS: Record<PayrollConceptType, string> = {
  salary: "Salario base",
  transport: "Auxilio de transporte",
  surcharge_night: "Recargo nocturno",
  surcharge_sunday: "Recargo dominical",
  surcharge_holiday: "Recargo festivo",
  overtime_day: "Hora extra diurna",
  overtime_night: "Hora extra nocturna",
  bonus_salary: "Bonificación salarial",
  bonus_non_salary: "Bonificación no salarial",
  vacation_pay: "Pago de vacaciones",
  prima: "Prima",
  cesantias_interest: "Intereses cesantías",
  health_employee: "EPS Salud 4%",
  pension_employee: "Pensión 4%",
  solidarity_pension: "Solidaridad pensional",
  income_tax: "Retención en la fuente",
  embargo: "Embargo",
  libranza: "Libranza",
  voluntary_pension: "Pensión voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deducción",
};

const PROVISION_LABELS: Record<ProvisionConcept, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
};

function periodLabel(period: PayrollPeriod): string {
  const [yearStr, monthStr] = period.period_start.split("-");
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  return `${MONTHS[month - 1]} ${year}`;
}

function fmtRate(rate: number | null): string {
  if (rate === null) return "—";
  // Rates are typically between 0 and 10 (e.g. 0.04 for 4%).
  if (rate < 10) return `${(rate * 100).toFixed(2)}%`;
  return rate.toLocaleString("es-CO");
}

function fmtBase(base: number | null): string {
  if (base === null) return "—";
  return formatCOP(base);
}

export interface PayrollPdfData {
  period: PayrollPeriod;
  employee: {
    full_name: string;
    document_id?: string;
    location_name?: string;
  };
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
  companyName?: string;
}

export function generatePayrollPdf(data: PayrollPdfData): Blob {
  const {
    period,
    employee,
    entries,
    provisions,
    employerCost,
    companyName = "App Horarios",
  } = data;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = pageWidth - 14;

  const incomeEntries = entries.filter((e) => e.is_income && e.amount > 0);
  const deductionEntries = entries.filter((e) => !e.is_income && e.amount > 0);
  const netToBank = computeNetToBank(entries);
  const totalDevengado = incomeEntries.reduce(
    (s, e) => s + Number(e.amount),
    0
  );
  const totalDeducciones = deductionEntries.reduce(
    (s, e) => s + Number(e.amount),
    0
  );

  // ── 1. Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageWidth, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, marginLeft, 10);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Comprobante de pago", marginLeft, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(periodLabel(period), marginRight, 10, { align: "right" });

  const statusLabel =
    period.status === "paid"
      ? "Pagado"
      : period.status === "approved"
      ? "Aprobado"
      : "Borrador";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(statusLabel, marginRight, 16, { align: "right" });

  // ── 2. Employee info ────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  let y = 30;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(employee.full_name, marginLeft, y);
  y += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  if (employee.document_id) {
    doc.text(`Documento: ${employee.document_id}`, marginLeft, y);
    y += 4;
  }
  if (employee.location_name) {
    doc.text(`Sede: ${employee.location_name}`, marginLeft, y);
    y += 4;
  }

  doc.text(
    `Período: ${period.period_start} — ${period.period_end}`,
    marginLeft,
    y
  );
  y += 7;

  doc.setTextColor(0, 0, 0);

  // ── 3. Devengado table ──────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Devengado", marginLeft, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Base", "Tasa", "Valor"]],
    body: incomeEntries.map((e) => [
      CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
      fmtBase(e.base),
      fmtRate(e.rate),
      formatCOP(Number(e.amount)),
    ]),
    foot: [["Total devengado", "", "", formatCOP(totalDevengado)]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [239, 246, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    theme: "striped",
    margin: { left: marginLeft, right: 14 },
  });

  // ── 4. Deducciones table ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Deducciones", marginLeft, y);
  y += 2;

  if (deductionEntries.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Concepto", "Base", "Tasa", "Valor"]],
      body: deductionEntries.map((e) => [
        CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
        fmtBase(e.base),
        fmtRate(e.rate),
        formatCOP(Number(e.amount)),
      ]),
      foot: [["Total deducciones", "", "", formatCOP(totalDeducciones)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
      footStyles: { fillColor: [254, 242, 242], fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      theme: "striped",
      margin: { left: marginLeft, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("Sin deducciones este período.", marginLeft, y + 4);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // ── 5. Net to bank highlight ────────────────────────────────────────────────
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.roundedRect(marginLeft, y, pageWidth - 28, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Te depositamos", marginLeft + 3, y + 6.5);
  doc.text(formatCOP(netToBank), marginRight - 3, y + 6.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 16;

  // ── 6. Provisiones table ────────────────────────────────────────────────────
  if (provisions.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Provisiones", marginLeft, y);
    y += 2;

    // Deduplicate: keep latest accumulated_ytd per concept.
    const ytdByConcept: Record<string, number> = {};
    for (const p of provisions) {
      const ytd = Number(p.accumulated_ytd);
      if (ytd >= (ytdByConcept[p.concept] ?? 0)) {
        ytdByConcept[p.concept] = ytd;
      }
    }

    autoTable(doc, {
      startY: y,
      head: [["Concepto", "Este mes", "Acumulado año"]],
      body: provisions.map((p) => [
        PROVISION_LABELS[p.concept] ?? p.concept,
        formatCOP(Number(p.amount)),
        formatCOP(ytdByConcept[p.concept] ?? 0),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
      },
      theme: "striped",
      margin: { left: marginLeft, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 7. Costo empleador summary ──────────────────────────────────────────────
  if (employerCost && employerCost.total > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Costo total empleador: ${formatCOP(employerCost.total)}`,
      marginLeft,
      y
    );
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  // ── 8. Footer ───────────────────────────────────────────────────────────────
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.line(marginLeft, pageHeight - 12, marginRight, pageHeight - 12);
  doc.text(
    `Generado por App Horarios — ${today}`,
    pageWidth / 2,
    pageHeight - 7,
    { align: "center" }
  );

  return doc.output("blob");
}
