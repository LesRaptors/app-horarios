"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { SalaryAdjustmentForm } from "./salary-adjustment-form";
import type { SalaryAdjustment } from "@/lib/types";

interface Props {
  employeeId: string;
  adjustments: SalaryAdjustment[];
  canEdit: boolean;
  onChanged: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryAdjustmentsSection({
  employeeId,
  adjustments,
  canEdit,
  onChanged,
}: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string, isPast: boolean) {
    if (isPast && !confirm("Este ajuste tiene fecha pasada. ¿Eliminar?")) return;
    const { error } = await supabase.from("salary_adjustments").delete().eq("id", id);
    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Ajuste eliminado");
    onChanged();
  }

  const today = todayISO();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ajustes salariales</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Agregar
          </Button>
        )}
      </div>

      {adjustments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin ajustes.</p>
      ) : (
        <ul className="space-y-2">
          {adjustments.map((a) => {
            const isPast = a.payment_date < today;
            return (
              <li key={a.id} className="rounded border p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCOP(a.amount)}</span>
                      <Badge variant={a.is_salary_component ? "default" : "secondary"}>
                        {a.is_salary_component ? "Salarial" : "No salarial"}
                      </Badge>
                      {isPast && <Badge variant="outline">Pasado</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      {a.payment_date} · {a.concept_label}
                    </div>
                    {a.description && <div className="italic">{a.description}</div>}
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(a.id, isPast)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SalaryAdjustmentForm
        employeeId={employeeId}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
