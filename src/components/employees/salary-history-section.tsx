"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatCOP } from "@/lib/payroll-helpers";
import { SalaryChangeForm } from "./salary-change-form";
import type { SalaryHistory, PayrollSettings } from "@/lib/types";

type SalaryHistoryWithCreator = SalaryHistory & {
  creator?: { first_name: string; last_name: string } | null;
};

interface Props {
  employeeId: string;
  history: SalaryHistoryWithCreator[];
  payrollSettings: PayrollSettings[];
  canEdit: boolean;
  onChanged: () => void;
}

function fmtRange(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → vigente`;
}

export function SalaryHistorySection({
  employeeId,
  history,
  payrollSettings,
  canEdit,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Historial salarial</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Nuevo cambio
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin registros.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded border p-2 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{formatCOP(h.monthly_salary)}</span>
                {h.is_integral_salary && (
                  <span className="text-muted-foreground">integral</span>
                )}
              </div>
              <div className="text-muted-foreground">{fmtRange(h.effective_from, h.effective_to)}</div>
              {h.change_reason && <div className="italic">{h.change_reason}</div>}
              {h.creator && (
                <div className="text-muted-foreground">
                  por {h.creator.first_name} {h.creator.last_name}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <SalaryChangeForm
        employeeId={employeeId}
        payrollSettings={payrollSettings}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
