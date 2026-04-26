"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  formatCOP,
  parseCOP,
  validateSalary,
  getSettingsForDate,
} from "@/lib/payroll-helpers";
import type { PayrollSettings } from "@/lib/types";

interface Props {
  employeeId: string;
  payrollSettings: PayrollSettings[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function SalaryChangeForm({
  employeeId,
  payrollSettings,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const supabase = createClient();
  const [amount, setAmount] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayISO());
  const [reason, setReason] = useState<string>("");
  const [isIntegral, setIsIntegral] = useState<boolean>(false);
  const [transportOverride, setTransportOverride] = useState<"auto" | "yes" | "no">("auto");
  const [saving, setSaving] = useState(false);

  function reset() {
    setAmount("");
    setEffectiveFrom(todayISO());
    setReason("");
    setIsIntegral(false);
    setTransportOverride("auto");
  }

  async function handleSave() {
    const parsed = parseCOP(amount);
    if (parsed === null) {
      toast.error("Monto inválido");
      return;
    }
    const settings = getSettingsForDate(payrollSettings, effectiveFrom);
    if (!settings) {
      toast.error("No hay configuración de nómina para esa fecha");
      return;
    }
    const v = validateSalary(parsed, settings.smmlv, isIntegral);
    if (!v.ok) {
      toast.error(v.error ?? "Salario inválido");
      return;
    }
    if (v.warning) {
      toast.warning(v.warning);
    }

    setSaving(true);
    const { error } = await supabase.from("salary_history").insert({
      employee_id: employeeId,
      monthly_salary: parsed,
      is_integral_salary: isIntegral,
      transport_aux_override:
        transportOverride === "auto" ? null : transportOverride === "yes",
      change_reason: reason || null,
      effective_from: effectiveFrom,
      created_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Cambio salarial registrado");
    reset();
    onSaved();
    onOpenChange(false);
  }

  const isPast = effectiveFrom < todayISO();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cambio salarial</DialogTitle>
          <DialogDescription>
            Cierra el período salarial vigente y abre uno nuevo desde la fecha indicada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Salario mensual</Label>
            <Input
              id="amount"
              placeholder="$2.800.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const p = parseCOP(amount);
                if (p !== null) setAmount(formatCOP(p));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective-from">Vigente desde</Label>
            <Input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            {isPast && (
              <p className="text-xs text-amber-600">
                Estás registrando un cambio retroactivo.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Razón (opcional)</Label>
            <Input
              id="reason"
              placeholder="Aumento legal SMMLV"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="integral"
              checked={isIntegral}
              onCheckedChange={(c) => setIsIntegral(c === true)}
            />
            <Label htmlFor="integral">Salario integral</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transport">Auxilio de transporte</Label>
            <Select
              value={transportOverride}
              onValueChange={(v) => setTransportOverride(v as "auto" | "yes" | "no")}
            >
              <SelectTrigger id="transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (≤ 2 SMMLV)</SelectItem>
                <SelectItem value="yes">Siempre aplica</SelectItem>
                <SelectItem value="no">No aplica</SelectItem>
              </SelectContent>
            </Select>
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
