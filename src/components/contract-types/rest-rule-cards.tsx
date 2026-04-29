"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, RotateCw, Moon, Sun, CalendarOff, Calendar } from "lucide-react";
import type {
  RestRule, RestRuleType,
  WorkCycleParams, WeekendRotationParams, PostNightRestParams,
  MaxConsecutiveNightsParams, CompensatoryDayParams,
} from "@/lib/types";

interface RestRuleCardsProps {
  rules: RestRule[];
  onUpdate: (index: number, params: RestRule["params"]) => void;
  onRemove: (index: number) => void;
}

export function RestRuleCards({ rules, onUpdate, onRemove }: RestRuleCardsProps) {
  return (
    <div className="space-y-3">
      {rules.map((rule, idx) => (
        <RuleCard
          key={rule.id || idx}
          rule={rule}
          onUpdate={(params) => onUpdate(idx, params)}
          onRemove={() => onRemove(idx)}
        />
      ))}
    </div>
  );
}

const ICONS: Record<RestRuleType, React.ComponentType<{ className?: string }>> = {
  work_cycle: RotateCw,
  weekend_rotation: Calendar,
  post_night_rest: Moon,
  max_consecutive_nights: Sun,
  compensatory_day: CalendarOff,
};

const TITLES: Record<RestRuleType, string> = {
  work_cycle: "Ciclo trabajo/descanso",
  weekend_rotation: "Rotación de fines de semana",
  post_night_rest: "Descanso post-noches",
  max_consecutive_nights: "Máximo turnos nocturnos consecutivos",
  compensatory_day: "Día compensatorio",
};

function RuleCard({
  rule, onUpdate, onRemove,
}: { rule: RestRule; onUpdate: (params: RestRule["params"]) => void; onRemove: () => void }) {
  const Icon = ICONS[rule.rule_type];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4" />
          {TITLES[rule.rule_type]}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {rule.rule_type === "work_cycle" && (
          <WorkCycleEditor params={rule.params as WorkCycleParams} onUpdate={(p) => onUpdate(p)} />
        )}
        {rule.rule_type === "weekend_rotation" && (
          <WeekendRotationEditor params={rule.params as WeekendRotationParams} onUpdate={(p) => onUpdate(p)} />
        )}
        {rule.rule_type === "post_night_rest" && (
          <PostNightRestEditor params={rule.params as PostNightRestParams} onUpdate={(p) => onUpdate(p)} />
        )}
        {rule.rule_type === "max_consecutive_nights" && (
          <MaxConsecutiveNightsEditor params={rule.params as MaxConsecutiveNightsParams} onUpdate={(p) => onUpdate(p)} />
        )}
        {rule.rule_type === "compensatory_day" && (
          <CompensatoryDayEditor params={rule.params as CompensatoryDayParams} onUpdate={(p) => onUpdate(p)} />
        )}
      </CardContent>
    </Card>
  );
}

function WorkCycleEditor({ params, onUpdate }: { params: WorkCycleParams; onUpdate: (p: WorkCycleParams) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Trabaja (días)</Label>
          <Input type="number" min={1} max={30} value={params.work_days}
            onChange={(e) => onUpdate({ ...params, work_days: Number(e.target.value) || 1 })} />
        </div>
        <div>
          <Label>Descansa (días)</Label>
          <Input type="number" min={1} max={30} value={params.rest_days}
            onChange={(e) => onUpdate({ ...params, rest_days: Number(e.target.value) || 1 })} />
        </div>
      </div>
      <div>
        <Label>Inicio del ciclo</Label>
        <Input type="date" value={params.cycle_start_date}
          onChange={(e) => onUpdate({ ...params, cycle_start_date: e.target.value })} />
      </div>
    </div>
  );
}

function WeekendRotationEditor({ params, onUpdate }: { params: WeekendRotationParams; onUpdate: (p: WeekendRotationParams) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label>Cada cuántas semanas</Label>
        <Input type="number" min={2} max={4} value={params.every_n_weeks}
          onChange={(e) => onUpdate({ ...params, every_n_weeks: Number(e.target.value) || 2 })} />
      </div>
      <div>
        <Label>Grupo (offset)</Label>
        <Select value={String(params.offset)} onValueChange={(v) => onUpdate({ ...params, offset: Number(v) as 0 | 1 })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">A (semanas pares)</SelectItem>
            <SelectItem value="1">B (semanas impares)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label>Incluir sábado</Label>
        <Switch checked={params.include_saturday}
          onCheckedChange={(v) => onUpdate({ ...params, include_saturday: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Incluir domingo</Label>
        <Switch checked={params.include_sunday}
          onCheckedChange={(v) => onUpdate({ ...params, include_sunday: v })} />
      </div>
    </div>
  );
}

function PostNightRestEditor({ params, onUpdate }: { params: PostNightRestParams; onUpdate: (p: PostNightRestParams) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Tras N noches</Label>
        <Input type="number" min={1} max={7} value={params.nights_threshold}
          onChange={(e) => onUpdate({ ...params, nights_threshold: Number(e.target.value) || 1 })} />
      </div>
      <div>
        <Label>Días de descanso</Label>
        <Input type="number" min={1} max={7} value={params.rest_days_required}
          onChange={(e) => onUpdate({ ...params, rest_days_required: Number(e.target.value) || 1 })} />
      </div>
    </div>
  );
}

function MaxConsecutiveNightsEditor({ params, onUpdate }: { params: MaxConsecutiveNightsParams; onUpdate: (p: MaxConsecutiveNightsParams) => void }) {
  return (
    <div>
      <Label>Máximo noches seguidas</Label>
      <Input type="number" min={1} max={7} value={params.max}
        onChange={(e) => onUpdate({ ...params, max: Number(e.target.value) || 1 })} />
    </div>
  );
}

function CompensatoryDayEditor({ params, onUpdate }: { params: CompensatoryDayParams; onUpdate: (p: CompensatoryDayParams) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <Label>Aplica a</Label>
        <Select value={params.applies_to} onValueChange={(v) => onUpdate({ ...params, applies_to: v as CompensatoryDayParams["applies_to"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sundays">Solo domingos</SelectItem>
            <SelectItem value="holidays">Solo festivos</SelectItem>
            <SelectItem value="both">Domingos y festivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Dentro de N días</Label>
        <Input type="number" min={3} max={14} value={params.within_days}
          onChange={(e) => onUpdate({ ...params, within_days: Number(e.target.value) || 7 })} />
      </div>
    </div>
  );
}
