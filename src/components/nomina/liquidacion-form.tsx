"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { assembleLiquidacion } from "@/lib/liquidacion-builder";
import { suggestVacationDays } from "@/lib/liquidacion-engine";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmployeeOption {
  id: string;
  full_name: string;
  hire_date: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LiquidacionForm({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const vacHintId = useId();

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [reason, setReason] = useState("sin_justa_causa");
  const [contractKind, setContractKind] = useState("indefinido");
  const [contractEndDate, setContractEndDate] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [cesantiasCutoff, setCesantiasCutoff] = useState("");
  const [vacationsCutoff, setVacationsCutoff] = useState("");
  const [vacationDays, setVacationDays] = useState("0");
  const [baseSalary, setBaseSalary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, hire_date")
        .eq("is_active", true)
        .order("full_name");
      setEmployees((data ?? []) as EmployeeOption[]);
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!employeeId) return;
    void (async () => {
      const emp = employees.find((e) => e.id === employeeId);
      if (emp?.hire_date) setHireDate(emp.hire_date);
      const { data: salaries } = await supabase
        .from("salary_history")
        .select("monthly_salary")
        .eq("employee_id", employeeId)
        .order("effective_from", { ascending: false })
        .limit(1);
      const latest = (salaries ?? [])[0];
      if (latest) setBaseSalary(String(latest.monthly_salary));
    })();
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (vacationsCutoff && terminationDate && vacationsCutoff <= terminationDate) {
      setVacationDays(String(suggestVacationDays(vacationsCutoff, terminationDate)));
    }
  }, [vacationsCutoff, terminationDate]);

  function reset() {
    setEmployeeId("");
    setTerminationDate("");
    setReason("sin_justa_causa");
    setContractKind("indefinido");
    setContractEndDate("");
    setHireDate("");
    setCesantiasCutoff("");
    setVacationsCutoff("");
    setVacationDays("0");
    setBaseSalary("");
  }

  async function handleSave() {
    if (!profile?.organization_id) {
      toast.error("No se pudo determinar la organización. Recarga la página.");
      return;
    }
    if (
      !employeeId ||
      !terminationDate ||
      !hireDate ||
      !cesantiasCutoff ||
      !vacationsCutoff ||
      !baseSalary
    ) {
      toast.error("Completa todos los campos obligatorios.");
      return;
    }
    const needsEnd =
      contractKind === "fijo" ||
      contractKind === "obra_labor" ||
      reason === "fin_contrato";
    if (needsEnd && !contractEndDate) {
      toast.error("Ingresa la fecha de finalización del contrato.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("liquidations")
      .insert({
        organization_id: profile.organization_id,
        employee_id: employeeId,
        termination_date: terminationDate,
        reason,
        contract_kind: contractKind,
        contract_end_date: contractEndDate || null,
        hire_date: hireDate,
        cesantias_cutoff: cesantiasCutoff,
        vacations_cutoff: vacationsCutoff,
        vacation_days_pending: parseFloat(vacationDays) || 0,
        base_salary: parseFloat(baseSalary),
        status: "draft",
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      toast.error(`No se pudo crear la liquidación: ${error?.message ?? ""}`);
      return;
    }

    await assembleLiquidacion(data.id);
    setSaving(false);
    toast.success("Liquidación creada.");
    reset();
    onOpenChange(false);
    router.push(`/nomina/liquidaciones/${data.id}`);
  }

  const needsEnd =
    contractKind === "fijo" ||
    contractKind === "obra_labor" ||
    reason === "fin_contrato";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva liquidación</DialogTitle>
        </DialogHeader>

        {/* Live region announces save progress to screen readers */}
        <div role="status" aria-live="polite" className="sr-only">
          {saving ? "Calculando y creando liquidación…" : ""}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Empleado — full width */}
          <div className="col-span-2 space-y-2">
            <Label htmlFor="liq-emp">
              Empleado <span aria-hidden="true">*</span>
            </Label>
            <Select value={employeeId} onValueChange={setEmployeeId} required>
              <SelectTrigger id="liq-emp" aria-required="true">
                <SelectValue placeholder="Selecciona un empleado" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-hire">
              Fecha de ingreso <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="liq-hire"
              type="date"
              required
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-term">
              Fecha de terminación <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="liq-term"
              type="date"
              required
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-reason">
              Motivo <span aria-hidden="true">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason} required>
              <SelectTrigger id="liq-reason" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="renuncia">Renuncia</SelectItem>
                <SelectItem value="mutuo_acuerdo">Mutuo acuerdo</SelectItem>
                <SelectItem value="justa_causa">Justa causa</SelectItem>
                <SelectItem value="sin_justa_causa">Sin justa causa</SelectItem>
                <SelectItem value="fin_contrato">Fin de contrato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-kind">
              Tipo de contrato <span aria-hidden="true">*</span>
            </Label>
            <Select value={contractKind} onValueChange={setContractKind} required>
              <SelectTrigger id="liq-kind" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="indefinido">Indefinido</SelectItem>
                <SelectItem value="fijo">Término fijo</SelectItem>
                <SelectItem value="obra_labor">Obra o labor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsEnd && (
            <div className="space-y-2">
              <Label htmlFor="liq-end">
                Fecha fin de contrato <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="liq-end"
                type="date"
                required
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="liq-ces">
              Corte de cesantías <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="liq-ces"
              type="date"
              required
              value={cesantiasCutoff}
              onChange={(e) => setCesantiasCutoff(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-vac">
              Último disfrute de vacaciones <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="liq-vac"
              type="date"
              required
              value={vacationsCutoff}
              onChange={(e) => setVacationsCutoff(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-vacdays">Días de vacaciones pendientes</Label>
            {/* Hint above the input so autocomplete popovers don't cover it */}
            <p id={vacHintId} className="text-xs text-muted-foreground">
              Calculado automáticamente desde el último disfrute; ajusta si es necesario.
            </p>
            <Input
              id="liq-vacdays"
              type="number"
              step="0.01"
              min="0"
              aria-describedby={vacHintId}
              value={vacationDays}
              onChange={(e) => setVacationDays(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-base">
              Salario base mensual <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="liq-base"
              type="number"
              required
              min="0"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
            {saving && (
              <Loader2
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
              />
            )}
            Calcular y crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
