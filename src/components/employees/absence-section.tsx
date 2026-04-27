"use client";

import { useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AbsenceForm } from "./absence-form";
import type { AbsenceRecord, AbsenceType, AbsencePayer } from "@/lib/types";

interface Props {
  employeeId: string;
  absences: AbsenceRecord[];
  canEdit: boolean;
  onChanged: () => void;
}

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  sick_eps: "Incapacidad EPS",
  sick_arl: "Incapacidad ARL",
  maternity: "Maternidad",
  paternity: "Paternidad",
  vacation: "Vacaciones",
  paid_leave: "Permiso remunerado",
  unpaid_leave: "Permiso no remunerado",
  suspension: "Suspensión",
};

const PAYER_LABELS: Record<AbsencePayer, string> = {
  employer: "Empleador",
  eps: "EPS",
  arl: "ARL",
  none: "Ninguno",
};

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function calcDays(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function fmtPct(pct: number): string {
  return `${Math.round(pct * 100)}%`;
}

export function AbsenceSection({ employeeId, absences, canEdit, onChanged }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  const today = todayISO();

  async function handleDelete(record: AbsenceRecord) {
    if (record.source_request_id) {
      toast.error("Eliminá la solicitud original primero");
      return;
    }
    const isPast = record.start_date < today;
    if (isPast && !confirm("Esta ausencia tiene fecha pasada. ¿Eliminar?")) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("absence_records")
      .delete()
      .eq("id", record.id);

    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Ausencia eliminada");
    onChanged();
  }

  const sorted = [...absences].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ausencias e incapacidades</p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Registrar ausencia
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin ausencias registradas.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => {
            const days = calcDays(a.start_date, a.end_date);
            return (
              <li key={a.id} className="rounded border p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">
                        {ABSENCE_TYPE_LABELS[a.type]}
                      </Badge>
                      <Badge variant="outline">
                        {PAYER_LABELS[a.payer]}
                      </Badge>
                      {a.source_request_id && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                          Auto desde solicitud
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {a.start_date} → {a.end_date} · {days} {days === 1 ? "día" : "días"} · {fmtPct(a.paid_pct)} pagado
                    </div>
                    {a.notes && <div className="italic text-muted-foreground">{a.notes}</div>}
                  </div>
                  {canEdit && (
                    <div className="flex-shrink-0">
                      {a.source_request_id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Eliminá la solicitud original primero"
                          onClick={() => toast.error("Eliminá la solicitud original primero")}
                          className="text-muted-foreground"
                        >
                          <AlertCircle className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(a)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AbsenceForm
        employeeId={employeeId}
        open={open}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
