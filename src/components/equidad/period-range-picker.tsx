"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  start: string; // "YYYY-MM"
  end: string;   // "YYYY-MM"
  onChange: (next: { start: string; end: string }) => void;
}

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PeriodRangePicker({ start, end, onChange }: Props) {
  const today = currentMonthValue();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Mes inicio</span>
      <Input
        type="month"
        value={start}
        onChange={(e) => onChange({ start: e.target.value, end })}
        className="w-40"
      />
      <span className="text-sm text-muted-foreground">Mes fin</span>
      <Input
        type="month"
        value={end}
        onChange={(e) => onChange({ start, end: e.target.value })}
        className="w-40"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange({ start: today, end: today })}
      >
        Hoy
      </Button>
    </div>
  );
}
