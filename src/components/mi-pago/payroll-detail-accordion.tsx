"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConceptTooltip } from "./concept-tooltip";
import { formatCOP } from "@/lib/payroll-helpers";
import type { PayrollEntry, PayrollProvision, PayrollEmployerCost } from "@/lib/types";

interface Props {
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
}

const CONCEPT_LABELS: Record<string, string> = {
  salary: "Salario base",
  transport: "Auxilio de transporte",
  surcharge_night: "Recargo nocturno",
  surcharge_sunday: "Recargo dominical",
  surcharge_holiday: "Recargo festivo",
  overtime_day: "Hora extra diurna",
  overtime_night: "Hora extra nocturna",
  bonus_salary: "Bonificacion salarial",
  bonus_non_salary: "Bonificacion no salarial",
  vacation_pay: "Pago de vacaciones",
  prima: "Prima",
  cesantias_interest: "Intereses cesantias",
  health_employee: "EPS Salud 4%",
  pension_employee: "Pension 4%",
  solidarity_pension: "Solidaridad pensional",
  income_tax: "Retencion en la fuente",
  embargo: "Embargo",
  libranza: "Libranza",
  voluntary_pension: "Pension voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deduccion",
};

const PROVISION_LABELS: Record<string, string> = {
  cesantias: "Cesantias",
  cesantias_interest: "Intereses cesantias",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
};

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  if (rate > 1) return `${rate.toFixed(2)}%`;
  return `${(rate * 100).toFixed(2)}%`;
}

function EntriesTable({ entries }: { entries: PayrollEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">Sin conceptos.</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Concepto</TableHead>
          <TableHead className="text-right">Base</TableHead>
          <TableHead className="text-right">Tasa</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              <ConceptTooltip concept={e.concept_type}>
                <button
                  type="button"
                  className="text-sm text-left hover:underline focus:outline-none"
                >
                  {CONCEPT_LABELS[e.concept_type] ?? e.concept_type}
                </button>
              </ConceptTooltip>
            </TableCell>
            <TableCell className="text-right text-sm">
              {e.base !== null ? formatCOP(Number(e.base)) : "—"}
            </TableCell>
            <TableCell className="text-right text-sm">
              {formatRate(e.rate)}
            </TableCell>
            <TableCell className="text-right text-sm font-medium">
              {formatCOP(Number(e.amount))}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold">
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">
            {formatCOP(
              entries.reduce((s, e) => s + Number(e.amount), 0)
            )}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function PayrollDetailAccordion({
  entries,
  provisions,
  employerCost,
}: Props) {
  const incomes = entries.filter((e) => e.is_income);
  const deductions = entries.filter((e) => !e.is_income);

  return (
    <Accordion type="multiple" className="w-full">
      {/* 1. Devengado */}
      <AccordionItem value="devengado">
        <AccordionTrigger className="text-sm font-semibold">
          Devengado
        </AccordionTrigger>
        <AccordionContent>
          <EntriesTable entries={incomes} />
        </AccordionContent>
      </AccordionItem>

      {/* 2. Deducciones */}
      <AccordionItem value="deducciones">
        <AccordionTrigger className="text-sm font-semibold">
          Deducciones
        </AccordionTrigger>
        <AccordionContent>
          <EntriesTable entries={deductions} />
        </AccordionContent>
      </AccordionItem>

      {/* 3. Provisiones */}
      <AccordionItem value="provisiones">
        <AccordionTrigger className="text-sm font-semibold">
          Provisiones (acumulado a tu favor)
        </AccordionTrigger>
        <AccordionContent>
          {provisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Sin provisiones este periodo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Este mes</TableHead>
                  <TableHead className="text-right">Acumulado YTD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provisions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <ConceptTooltip concept={p.concept}>
                        <button
                          type="button"
                          className="text-sm text-left hover:underline focus:outline-none"
                        >
                          {PROVISION_LABELS[p.concept] ?? p.concept}
                        </button>
                      </ConceptTooltip>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCOP(Number(p.amount))}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCOP(Number(p.accumulated_ytd))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* 4. Costo empleador */}
      <AccordionItem value="costo-empleador">
        <AccordionTrigger className="text-sm font-semibold">
          Costo empleador
        </AccordionTrigger>
        <AccordionContent>
          <p className="text-xs text-muted-foreground mb-3">
            Esto es lo que la empresa paga adicional por ti — no sale de tu
            salario.
          </p>
          {!employerCost ? (
            <p className="text-sm text-muted-foreground">Sin datos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-sm">Salud empleador (8%)</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCOP(employerCost.health_employer)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm">
                    Pension empleador (12%)
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCOP(employerCost.pension_employer)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm">ARL</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCOP(employerCost.arl_employer)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm">
                    Parafiscales (Caja + SENA + ICBF)
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCOP(
                      employerCost.parafiscales_caja +
                        employerCost.parafiscales_sena +
                        employerCost.parafiscales_icbf
                    )}
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>Total costo empleador</TableCell>
                  <TableCell className="text-right">
                    {formatCOP(employerCost.total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
