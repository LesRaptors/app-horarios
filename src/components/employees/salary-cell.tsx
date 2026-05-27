"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  formatCOP,
  parseCOP,
  validateSalary,
  getCurrentSalary,
  getSettingsForDate,
  computeHourlyRate,
} from "@/lib/payroll-helpers";
import type { SalaryHistory, PayrollSettings } from "@/lib/types";

interface Props {
  employeeId: string;
  history: SalaryHistory[];
  payrollSettings: PayrollSettings[];
  canEdit: boolean;
  canRead: boolean;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function SalaryCell({
  employeeId,
  history,
  payrollSettings,
  canEdit,
  canRead,
  onSaved,
}: Props) {
  const { user, effectiveOrgId } = useAuth();
  const supabase = createClient();
  const today = todayISO();
  const current = getCurrentSalary(history, employeeId, today);
  const settingsToday = getSettingsForDate(payrollSettings, today);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!canRead) {
    return <span className="text-muted-foreground" title="Sin permisos para ver salarios">—</span>;
  }

  const tooltip = (() => {
    if (!current) return "Sin salario registrado";
    const settings220 = payrollSettings.find((s) => s.hourly_divisor === 220);
    const settings210 = payrollSettings.find((s) => s.hourly_divisor === 210);
    const h220 = settings220 ? computeHourlyRate(current.monthly_salary, 220) : 0;
    const h210 = settings210 ? computeHourlyRate(current.monthly_salary, 210) : 0;
    return `Hora ord. ${formatCOP(h220)} (220h) · ${formatCOP(h210)} (210h post-15-jul)`;
  })();

  async function commit() {
    if (committingRef.current) return;
    committingRef.current = true;
    try {
      const parsed = parseCOP(draft);
      if (parsed === null) {
        toast.error("Monto inválido");
        setEditing(false);
        return;
      }
      if (!settingsToday) {
        toast.error("No hay configuración de nómina para hoy");
        setEditing(false);
        return;
      }
      const isIntegral = current?.is_integral_salary ?? false;
      const v = validateSalary(parsed, settingsToday.smmlv, isIntegral);
      if (!v.ok) {
        toast.error(v.error ?? "Salario inválido");
        setEditing(false);
        return;
      }
      if (parsed === current?.monthly_salary) {
        setEditing(false);
        return;
      }
      setSaving(true);
      const { error } = await supabase.from("salary_history").insert({
        employee_id: employeeId,
        monthly_salary: parsed,
        is_integral_salary: isIntegral,
        transport_aux_override: current?.transport_aux_override ?? null,
        change_reason: "Edición rápida",
        effective_from: today,
        created_by: user?.id ?? null,
        organization_id: effectiveOrgId ?? "",
      });
      setSaving(false);
      setEditing(false);
      if (error) {
        toast.error(`No se pudo guardar: ${error.message}`);
        return;
      }
      toast.success("Salario actualizado");
      onSaved();
    } finally {
      committingRef.current = false;
    }
  }

  if (editing && canEdit) {
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={current ? String(current.monthly_salary) : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={saving}
        className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      title={tooltip}
      onClick={() => {
        if (!canEdit) return;
        setDraft(current ? String(current.monthly_salary) : "");
        setEditing(true);
      }}
      className={`text-left text-sm ${
        canEdit ? "cursor-pointer hover:underline" : "cursor-default"
      } ${current ? "" : "text-muted-foreground"}`}
    >
      {current ? formatCOP(current.monthly_salary) : "—"}
    </button>
  );
}
