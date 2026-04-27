"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/payroll-helpers";
import { PeriodOverrideForm } from "./period-override-form";
import type { PayrollPeriod, PayrollEntry, Profile } from "@/lib/types";

const CONCEPT_LABELS: Record<string, string> = {
  income_tax: "Retención en la fuente",
  embargo: "Embargo judicial",
  libranza: "Libranza / préstamo",
  voluntary_pension: "Pensión voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deducción",
  bonus_non_salary: "Bonificación no salarial",
  bonus_salary: "Bonificación salarial",
};

interface Props {
  period: PayrollPeriod;
  overrides: PayrollEntry[]; // already filtered: is_manual_override=true
  employees: Profile[];
  onChanged: () => void;
}

export function PeriodOverridesTab({ period, overrides, employees, onChanged }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isDraft = period.status === "draft";

  // Build an employee lookup map
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este ajuste manual?")) return;
    setDeletingId(id);
    const { error } = await supabase
      .from("payroll_entries")
      .delete()
      .eq("id", id)
      .eq("is_manual_override", true);
    setDeletingId(null);
    if (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
      return;
    }
    toast.success("Ajuste eliminado.");
    onChanged();
  }

  return (
    <div className="space-y-4">
      {/* Header action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {overrides.length === 0
            ? "No hay ajustes manuales en este período."
            : `${overrides.length} ajuste(s) manual(es)`}
        </p>
        {isDraft && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar ajuste manual
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Razón</TableHead>
                {isDraft && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isDraft ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Sin ajustes manuales
                  </TableCell>
                </TableRow>
              )}
              {overrides.map((entry) => {
                const emp = employeeMap.get(entry.employee_id);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {emp
                        ? `${emp.first_name} ${emp.last_name}`
                        : entry.employee_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {CONCEPT_LABELS[entry.concept_type] ?? entry.concept_type}
                    </TableCell>
                    <TableCell>
                      {entry.is_income ? (
                        <Badge variant="default" className="text-xs">Ingreso</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Deducción</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.is_income ? (
                        <span className="text-green-600 dark:text-green-400">
                          +{formatCOP(entry.amount)}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">
                          -{formatCOP(entry.amount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                      {entry.description ?? "—"}
                    </TableCell>
                    {isDraft && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingId === entry.id}
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add override form modal */}
      <PeriodOverrideForm
        open={addOpen}
        onOpenChange={setAddOpen}
        periodId={period.id}
        employees={employees}
        onSaved={() => {
          setAddOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}
