"use client";

import { PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConceptTooltip } from "./concept-tooltip";
import { formatCOP } from "@/lib/payroll-helpers";
import type { PayrollProvision } from "@/lib/types";
import type { YtdSummary } from "@/lib/payroll-employee-helpers";

interface Props {
  provisions: PayrollProvision[];
  ytdSummary: YtdSummary;
}

interface ProvisionCard {
  concept: string;
  label: string;
  thisPeriod: number;
  ytd: number;
  paymentNote: string;
}

export function PayrollProvisionsSection({ provisions, ytdSummary }: Props) {
  const byConceptThisPeriod = (concept: string): number => {
    const row = provisions.find((p) => p.concept === concept);
    return row ? Number(row.amount) : 0;
  };

  const cards: ProvisionCard[] = [
    {
      concept: "cesantias",
      label: "Cesantías",
      thisPeriod: byConceptThisPeriod("cesantias"),
      ytd: ytdSummary.cesantiasYtd,
      paymentNote: "Se consignan al fondo en febrero",
    },
    {
      concept: "cesantias_interest",
      label: "Intereses cesantías",
      thisPeriod: byConceptThisPeriod("cesantias_interest"),
      ytd: ytdSummary.cesantiasInterestYtd,
      paymentNote: "Se pagan en febrero",
    },
    {
      concept: "prima",
      label: "Prima de servicios",
      thisPeriod: byConceptThisPeriod("prima"),
      ytd: ytdSummary.primaYtd,
      paymentNote: "Se paga en junio y diciembre",
    },
    {
      concept: "vacaciones",
      label: "Vacaciones",
      thisPeriod: byConceptThisPeriod("vacaciones"),
      ytd: ytdSummary.vacacionesYtd,
      paymentNote: "Se pagan al momento de tomarlas",
    },
  ];

  const totalThisPeriod = cards.reduce((s, c) => s + c.thisPeriod, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank className="h-5 w-5 text-amber-500" />
          Tu plata acumulada (provisiones)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Estos valores no entran a tu cuenta este mes — la empresa los guarda y
          te los paga después.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div
              key={c.concept}
              className="rounded-lg border bg-muted/30 p-4 space-y-2"
            >
              <ConceptTooltip concept={c.concept}>
                <button
                  type="button"
                  className="text-sm font-semibold text-left hover:underline focus:outline-none w-full"
                >
                  {c.label}
                </button>
              </ConceptTooltip>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Este mes</span>
                  <span className="font-medium text-foreground">
                    {formatCOP(c.thisPeriod)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Acumulado YTD</span>
                  <span className="font-medium text-foreground">
                    {formatCOP(c.ytd)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground italic border-t pt-2">
                {c.paymentNote}
              </p>
            </div>
          ))}
        </div>

        {/* Footer: total this period */}
        <div className="mt-4 pt-3 border-t flex justify-between items-center">
          <span className="text-sm font-medium">
            Total apartado este mes
          </span>
          <span className="text-sm font-semibold text-amber-700">
            {formatCOP(totalThisPeriod)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
