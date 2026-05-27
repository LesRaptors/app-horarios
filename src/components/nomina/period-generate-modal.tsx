"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { assemblePayrollPeriod } from "@/lib/payroll-period-builder";
import type { PaymentFrequency } from "@/lib/types";

// Generate a list of "YYYY-MM" options for the last 24 months + next 2
function generateMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  for (let i = -24; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-based
    const mm = String(m + 1).padStart(2, "0");
    options.push({ value: `${y}-${mm}`, label: `${MONTH_NAMES[m]} ${y}` });
  }
  return options.reverse();
}

/** Last day of a given month (YYYY-MM-DD). */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 of next month = last day of this month
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frequency: PaymentFrequency;
}

export function PeriodGenerateModal({ open, onOpenChange, frequency }: Props) {
  const router = useRouter();
  const { effectiveOrgId } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const monthOptions = generateMonthOptions();
  const defaultMonth = monthOptions.find((o) => {
    const now = new Date();
    return o.value === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })?.value ?? monthOptions[0].value;

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [quincena, setQuincena] = useState<"q1" | "q2">("q1");
  const [loading, setLoading] = useState(false);

  function computeDateRange(): { start: string; end: string } {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-based

    if (frequency === "mensual") {
      return {
        start: `${year}-${monthStr}-01`,
        end: lastDayOfMonth(year, month),
      };
    }
    // quincenal
    if (quincena === "q1") {
      return {
        start: `${year}-${monthStr}-01`,
        end: `${year}-${monthStr}-15`,
      };
    }
    return {
      start: `${year}-${monthStr}-16`,
      end: lastDayOfMonth(year, month),
    };
  }

  async function handleCalcular() {
    setLoading(true);
    try {
      const { start, end } = computeDateRange();

      // Insert payroll_periods row
      const { data: period, error: insertError } = await supabase
        .from("payroll_periods")
        .insert({
          period_start: start,
          period_end: end,
          frequency,
          status: "draft",
          organization_id: effectiveOrgId ?? "",
        })
        .select("id")
        .single();

      if (insertError) {
        // DB trigger rejects overlapping ranges — surface a readable message
        const msg = insertError.message.includes("overlap")
          ? "Ya existe un período que se solapa con ese rango de fechas."
          : insertError.message;
        toast.error(msg);
        return;
      }

      const periodId: string = period.id;

      // Run engine for all active employees
      const result = await assemblePayrollPeriod(
        periodId,
        start,
        end,
        frequency,
        null,   // all active non-terminated
        false   // initial run — no rows to replace
      );

      if (result.errors.length > 0) {
        toast.warning(
          `Período generado con ${result.errors.length} error(es). Revisa el resumen antes de aprobar.`
        );
      } else {
        toast.success(
          `Período generado para ${result.employeesProcessed} empleado(s).`
        );
      }

      onOpenChange(false);
      router.push(`/nomina/periodos/${periodId}`);
    } catch (err) {
      toast.error("Error inesperado al generar el período.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generar nuevo período</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Mes y año</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar mes" />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {frequency === "quincenal" && (
            <div className="space-y-2">
              <Label>Quincena</Label>
              <Select
                value={quincena}
                onValueChange={(v) => setQuincena(v as "q1" | "q2")}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="q1">Q1 — del 1 al 15</SelectItem>
                  <SelectItem value="q2">Q2 — del 16 al fin de mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview of resolved range */}
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {(() => {
              const { start, end } = computeDateRange();
              return (
                <>
                  Período:{" "}
                  <span className="font-medium text-foreground">
                    {start}
                  </span>{" "}
                  al{" "}
                  <span className="font-medium text-foreground">
                    {end}
                  </span>
                </>
              );
            })()}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleCalcular} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Calcular preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
