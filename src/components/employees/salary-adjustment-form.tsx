"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCOP, parseCOP } from "@/lib/payroll-helpers";

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryAdjustmentForm({ employeeId, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [conceptLabel, setConceptLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [isSalary, setIsSalary] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setPaymentDate(todayISO());
    setConceptLabel("");
    setAmount("");
    setIsSalary(true);
    setDescription("");
  }

  async function handleSave() {
    const parsed = parseCOP(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!conceptLabel.trim()) {
      toast.error("Indicá un concepto");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("salary_adjustments").insert({
      employee_id: employeeId,
      payment_date: paymentDate,
      concept_label: conceptLabel.trim(),
      amount: parsed,
      is_salary_component: isSalary,
      description: description.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Ajuste registrado");
    reset();
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ajuste salarial</DialogTitle>
          <DialogDescription>
            Bonificación, comisión, premio o cualquier pago ad-hoc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-date">Fecha de pago</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="concept">Concepto</Label>
            <Input
              id="concept"
              placeholder="Comisión febrero"
              value={conceptLabel}
              onChange={(e) => setConceptLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-amount">Monto</Label>
            <Input
              id="adj-amount"
              placeholder="$200.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const p = parseCOP(amount);
                if (p !== null) setAmount(formatCOP(p));
              }}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="is-salary"
              checked={isSalary}
              onCheckedChange={(c) => setIsSalary(c === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="is-salary">Constituye salario</Label>
              <p className="text-xs text-muted-foreground">
                Si está activo, entra en base de salud, pensión, prima, cesantías y vacaciones.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-desc">Descripción (opcional)</Label>
            <Textarea
              id="adj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
