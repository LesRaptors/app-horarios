"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RestRuleCards } from "@/components/contract-types/rest-rule-cards";
import type { EmployeeRestRule, RestRuleType, RestRuleParams } from "@/lib/types";

interface Props {
  rules: EmployeeRestRule[];
  onChange: (rules: EmployeeRestRule[]) => void;
  employeeId: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_PARAMS: Record<RestRuleType, () => RestRuleParams> = {
  work_cycle: () => ({ work_days: 4, rest_days: 3, cycle_start_date: todayISO() }),
  weekend_rotation: () => ({ every_n_weeks: 2, offset: 0, include_saturday: true, include_sunday: true }),
  post_night_rest: () => ({ nights_threshold: 3, rest_days_required: 2 }),
  max_consecutive_nights: () => ({ max: 3 }),
  compensatory_day: () => ({ applies_to: "sundays", within_days: 7 }),
};

export function EmployeeRestRulesEditor({ rules, onChange, employeeId }: Props) {
  function addRule(type: RestRuleType) {
    const newRule: EmployeeRestRule = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      employee_id: employeeId,
      rule_type: type,
      params: DEFAULT_PARAMS[type](),
      created_at: "",
      updated_at: "",
    };
    onChange([...rules, newRule]);
  }

  function updateRule(idx: number, params: RestRuleParams) {
    const next = rules.slice();
    next[idx] = { ...next[idx], params };
    onChange(next);
  }

  function removeRule(idx: number) {
    onChange(rules.filter((_, i) => i !== idx));
  }

  // RestRuleCards espera RestRule[] (con contract_type_id). El shape compartido
  // de rule_type + params es lo que importa; contract_type_id queda como dummy.
  const adapted = rules.map((r) => ({
    id: r.id,
    contract_type_id: "",
    rule_type: r.rule_type,
    params: r.params,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return (
    <div className="space-y-3">
      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin reglas individuales — el empleado usa las reglas del tipo de contrato.
        </p>
      )}
      <RestRuleCards
        rules={adapted}
        onUpdate={(idx, params) => updateRule(idx, params)}
        onRemove={removeRule}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("weekend_rotation")}>
          <Plus className="mr-1 h-3 w-3" /> Rotación findes
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("work_cycle")}>
          <Plus className="mr-1 h-3 w-3" /> Ciclo trabajo/descanso
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("post_night_rest")}>
          <Plus className="mr-1 h-3 w-3" /> Post-noches
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("max_consecutive_nights")}>
          <Plus className="mr-1 h-3 w-3" /> Máx. noches seguidas
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRule("compensatory_day")}>
          <Plus className="mr-1 h-3 w-3" /> Día compensatorio
        </Button>
      </div>
    </div>
  );
}
