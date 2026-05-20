"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCOP, parseCOP } from "@/lib/payroll-helpers";

interface Props {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function TaxDeductionsForm({ employeeId, open, onOpenChange, onSaved }: Props) {
  const { user, profile } = useAuth();
  const supabase = createClient();

  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const [dependentsCount, setDependentsCount] = useState("0");
  const [mortgageInterest, setMortgageInterest] = useState("");
  const [prepaidHealth, setPrepaidHealth] = useState("");
  const [voluntaryPension, setVoluntaryPension] = useState("");
  const [afc, setAfc] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setEffectiveFrom(todayISO());
    setDependentsCount("0");
    setMortgageInterest("");
    setPrepaidHealth("");
    setVoluntaryPension("");
    setAfc("");
  }

  function parseCOPOrZero(val: string): number {
    if (!val.trim()) return 0;
    return parseCOP(val) ?? 0;
  }

  async function handleSave() {
    const deps = parseInt(dependentsCount, 10);
    if (isNaN(deps) || deps < 0) {
      toast.error("El número de dependientes debe ser 0 o mayor");
      return;
    }

    const mortgage = parseCOPOrZero(mortgageInterest);
    const health = parseCOPOrZero(prepaidHealth);
    const vPension = parseCOPOrZero(voluntaryPension);
    const afcVal = parseCOPOrZero(afc);

    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tax_personal_deductions").insert({
      employee_id: employeeId,
      effective_from: effectiveFrom,
      dependents_count: deps,
      mortgage_interest_monthly: mortgage,
      prepaid_health_monthly: health,
      voluntary_pension_monthly: vPension,
      afc_monthly: afcVal,
      created_by: user?.id ?? null,
      organization_id: profile?.organization_id ?? "",
    });
    setSaving(false);

    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Declaración de deducciones actualizada");
    reset();
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar declaración</DialogTitle>
          <DialogDescription>
            Deducciones personales para el cálculo de retención en la fuente.
            El período anterior se cierra automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="td-from">Vigente desde</Label>
            <Input
              id="td-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-deps">Número de dependientes</Label>
            <Input
              id="td-deps"
              type="number"
              min={0}
              value={dependentsCount}
              onChange={(e) => setDependentsCount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-mortgage">Intereses hipotecarios mensuales</Label>
            <Input
              id="td-mortgage"
              placeholder="$0"
              value={mortgageInterest}
              onChange={(e) => setMortgageInterest(e.target.value)}
              onBlur={() => {
                const p = parseCOP(mortgageInterest);
                if (p !== null) setMortgageInterest(formatCOP(p));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Intereses pagados sobre crédito de vivienda. Tope legal 100 UVT/mes ≈ $5.2M.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-health">Salud prepagada mensual</Label>
            <Input
              id="td-health"
              placeholder="$0"
              value={prepaidHealth}
              onChange={(e) => setPrepaidHealth(e.target.value)}
              onBlur={() => {
                const p = parseCOP(prepaidHealth);
                if (p !== null) setPrepaidHealth(formatCOP(p));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Aportes a salud prepagada/medicina prepagada. Tope 16 UVT/mes ≈ $838K.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-vpension">Pensión voluntaria mensual</Label>
            <Input
              id="td-vpension"
              placeholder="$0"
              value={voluntaryPension}
              onChange={(e) => setVoluntaryPension(e.target.value)}
              onBlur={() => {
                const p = parseCOP(voluntaryPension);
                if (p !== null) setVoluntaryPension(formatCOP(p));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Aportes voluntarios a pensión. Junto con AFC tope 30% del ingreso.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="td-afc">AFC mensual</Label>
            <Input
              id="td-afc"
              placeholder="$0"
              value={afc}
              onChange={(e) => setAfc(e.target.value)}
              onBlur={() => {
                const p = parseCOP(afc);
                if (p !== null) setAfc(formatCOP(p));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Ahorro Fomento Construcción. Junto con AFP voluntaria tope 30% del ingreso.
            </p>
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
