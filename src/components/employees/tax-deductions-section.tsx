"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/payroll-helpers";
import { TaxDeductionsForm } from "./tax-deductions-form";
import type { TaxPersonalDeduction } from "@/lib/types";

interface Props {
  employeeId: string;
  deductions: TaxPersonalDeduction[];
  canEdit: boolean;
  onChanged: () => void;
}

function fmtRange(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → vigente`;
}

function DeductionRow({ d }: { d: TaxPersonalDeduction }) {
  return (
    <div className="rounded border p-2 text-xs space-y-1">
      <div className="text-muted-foreground">{fmtRange(d.effective_from, d.effective_to)}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">Dependientes</span>
        <span className="text-right">{d.dependents_count}</span>
        <span className="text-muted-foreground">Intereses hipoteca</span>
        <span className="text-right">{formatCOP(d.mortgage_interest_monthly)}</span>
        <span className="text-muted-foreground">Salud prepagada</span>
        <span className="text-right">{formatCOP(d.prepaid_health_monthly)}</span>
        <span className="text-muted-foreground">Pensión voluntaria</span>
        <span className="text-right">{formatCOP(d.voluntary_pension_monthly)}</span>
        <span className="text-muted-foreground">AFC</span>
        <span className="text-right">{formatCOP(d.afc_monthly)}</span>
      </div>
    </div>
  );
}

export function TaxDeductionsSection({ employeeId, deductions, canEdit, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const current = deductions.find((d) => d.effective_to === null) ?? null;
  const history = deductions
    .filter((d) => d.effective_to !== null)
    .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Deducciones personales (retención)</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Actualizar declaración
          </Button>
        )}
      </div>

      {current ? (
        <DeductionRow d={current} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin declaración vigente. Se asume cero deducciones.
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {historyOpen ? "Ocultar histórico" : `Ver histórico (${history.length})`}
          </button>
          {historyOpen && (
            <ul className="space-y-2">
              {history.map((d) => (
                <li key={d.id}>
                  <DeductionRow d={d} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <TaxDeductionsForm
        employeeId={employeeId}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
