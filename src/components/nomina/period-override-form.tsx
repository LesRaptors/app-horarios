"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseCOP, formatCOP } from "@/lib/payroll-helpers";
import type { Profile, PayrollConceptType } from "@/lib/types";

/** Subset of concept_types that make sense as manual overrides. */
const OVERRIDE_CONCEPTS: Array<{ value: PayrollConceptType; label: string; is_income: boolean }> = [
  { value: "income_tax",       label: "Retención en la fuente",   is_income: false },
  { value: "embargo",          label: "Embargo judicial",          is_income: false },
  { value: "libranza",         label: "Libranza / préstamo",       is_income: false },
  { value: "voluntary_pension",label: "Pensión voluntaria",        is_income: false },
  { value: "afc",              label: "AFC",                       is_income: false },
  { value: "union_fee",        label: "Cuota sindical",            is_income: false },
  { value: "other_deduction",  label: "Otra deducción",            is_income: false },
  { value: "bonus_non_salary", label: "Bonificación no salarial",  is_income: true },
  { value: "bonus_salary",     label: "Bonificación salarial",     is_income: true },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  employees: Profile[];
  onSaved: () => void;
}

export function PeriodOverrideForm({ open, onOpenChange, periodId, employees, onSaved }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { effectiveOrgId } = useAuth();

  const [employeeId, setEmployeeId] = useState("");
  const [conceptType, setConceptType] = useState<PayrollConceptType>("other_deduction");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setEmployeeId("");
      setConceptType("other_deduction");
      setAmount("");
      setReason("");
    }
  }, [open]);

  async function handleSave() {
    if (!employeeId) {
      toast.error("Selecciona un empleado.");
      return;
    }
    const parsedAmount = parseCOP(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      toast.error("Ingresa un monto válido mayor a cero.");
      return;
    }
    if (!reason.trim()) {
      toast.error("La razón es obligatoria.");
      return;
    }

    const conceptConfig = OVERRIDE_CONCEPTS.find((c) => c.value === conceptType);
    const is_income = conceptConfig?.is_income ?? false;

    setSaving(true);
    const { error } = await supabase.from("payroll_entries").insert({
      payroll_period_id: periodId,
      employee_id: employeeId,
      concept_type: conceptType,
      is_income,
      base: null,
      rate: null,
      amount: parsedAmount,
      description: reason.trim(),
      is_manual_override: true,
      organization_id: effectiveOrgId ?? "",
    });
    setSaving(false);

    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Ajuste manual guardado.");
    onSaved();
    onOpenChange(false);
  }

  const selectedConcept = OVERRIDE_CONCEPTS.find((c) => c.value === conceptType);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar ajuste manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee */}
          <div className="space-y-2">
            <Label htmlFor="ov-emp">Empleado</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={saving}>
              <SelectTrigger id="ov-emp">
                <SelectValue placeholder="Seleccionar empleado" />
              </SelectTrigger>
              <SelectContent className="max-h-56 overflow-y-auto">
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Concept type */}
          <div className="space-y-2">
            <Label htmlFor="ov-concept">Concepto</Label>
            <Select
              value={conceptType}
              onValueChange={(v) => setConceptType(v as PayrollConceptType)}
              disabled={saving}
            >
              <SelectTrigger id="ov-concept">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_CONCEPTS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedConcept && (
              <p className="text-xs text-muted-foreground">
                Tipo: {selectedConcept.is_income ? "Ingreso (devengado)" : "Deducción"}
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="ov-amount">Monto (COP)</Label>
            <Input
              id="ov-amount"
              placeholder="Ej: 150000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
            {amount && parseCOP(amount) !== null && (
              <p className="text-xs text-muted-foreground">
                {formatCOP(parseCOP(amount)!)}
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="ov-reason">Razón</Label>
            <Textarea
              id="ov-reason"
              placeholder="Describe el motivo del ajuste..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
