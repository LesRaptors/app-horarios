"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptTooltip } from "./concept-tooltip";
import { formatCOP } from "@/lib/payroll-helpers";
import type { PayrollEntry } from "@/lib/types";

interface Props {
  entries: PayrollEntry[];
  netToBank: number;
}

interface Row {
  concept: string;
  label: string;
  amount: number;
  pct: number;
}

const CONCEPT_LABELS: Record<string, string> = {
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

function Section({
  title,
  rows,
  total,
  barColor,
}: {
  title: string;
  rows: Row[];
  total: number;
  barColor: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.concept} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <ConceptTooltip concept={row.concept}>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-left hover:underline focus:outline-none"
                >
                  {row.label}
                  <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              </ConceptTooltip>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {row.pct.toFixed(1)}%
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatCOP(row.amount)}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${Math.min(100, row.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span>{formatCOP(total)}</span>
      </div>
    </div>
  );
}

export function PayrollBreakdownList({ entries, netToBank }: Props) {
  const [showOnDesktop, setShowOnDesktop] = useState(false);

  const incomes = entries.filter((e) => e.is_income && e.amount > 0);
  const deductions = entries.filter((e) => !e.is_income && e.amount > 0);

  const totalDevengado = incomes.reduce((s, e) => s + Number(e.amount), 0);
  const totalDeducciones = deductions.reduce((s, e) => s + Number(e.amount), 0);

  const incomeRows: Row[] = incomes.map((e) => ({
    concept: e.concept_type,
    label: CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
    amount: Number(e.amount),
    pct: totalDevengado > 0 ? (Number(e.amount) / totalDevengado) * 100 : 0,
  }));

  const deductionRows: Row[] = deductions.map((e) => ({
    concept: e.concept_type,
    label: CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
    amount: Number(e.amount),
    pct: totalDevengado > 0 ? (Number(e.amount) / totalDevengado) * 100 : 0,
  }));

  const bankRow: Row = {
    concept: "bank",
    label: "Tu cuenta",
    amount: netToBank,
    pct: totalDevengado > 0 ? (netToBank / totalDevengado) * 100 : 0,
  };

  const destinationRows: Row[] = [...deductionRows, bankRow];

  const content = (
    <div className="space-y-6">
      <Section
        title="Lo que ganaste"
        rows={incomeRows}
        total={totalDevengado}
        barColor="bg-blue-500"
      />
      <Section
        title="A donde se fue"
        rows={destinationRows}
        total={totalDeducciones + netToBank}
        barColor="bg-red-400"
      />

      {/* Net to bank highlighted row */}
      <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-3 flex justify-between items-center">
        <span className="font-semibold text-primary">Te depositamos</span>
        <span className="text-xl font-bold text-primary">
          {formatCOP(netToBank)}
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: always shown */}
      <div className="md:hidden">{content}</div>

      {/* Desktop: hidden by default, toggle available for accessibility */}
      <div className="hidden md:block">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowOnDesktop((v) => !v)}
          className="mb-3"
        >
          {showOnDesktop ? "Ocultar tabla" : "Ver tabla de conceptos"}
        </Button>
        {showOnDesktop && content}
      </div>
    </>
  );
}
