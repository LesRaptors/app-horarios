"use client";

import { useMemo } from "react";
import { isRestDay } from "@/lib/rest-rules";
import type { RestRule, ShiftTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RestRulePreviewProps {
  rules: RestRule[];
  startDate?: string;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS_SHOWN = 14;
const dummyTemplate: ShiftTemplate = {
  id: "preview",
  name: "preview",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 60,
  color: "#000",
  location_id: "",
  is_night: false,
  created_at: "",
};

export function RestRulePreview({ rules, startDate }: RestRulePreviewProps) {
  const today = startDate ?? new Date().toISOString().slice(0, 10);

  const days = useMemo(() => {
    const result: { date: string; rest: boolean; dow: number }[] = [];
    const start = new Date(today + "T00:00:00Z");
    for (let i = 0; i < DAYS_SHOWN; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const rest = rules.some((r) => isRestDay(r, dateStr, dummyTemplate, []));
      result.push({ date: dateStr, rest, dow: d.getUTCDay() });
    }
    return result;
  }, [rules, today]);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Próximos {DAYS_SHOWN} días desde {today}
      </p>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {days.map((d) => (
          <div
            key={d.date}
            className={cn(
              "rounded border px-1 py-1 text-center",
              d.rest
                ? "bg-muted text-muted-foreground border-dashed"
                : "bg-emerald-50 text-emerald-900 border-emerald-200"
            )}
            title={`${d.date} — ${d.rest ? "descanso por regla" : "puede trabajar"}`}
          >
            <div className="font-medium">{DAY_LABELS[d.dow]}</div>
            <div className="text-[10px] tabular-nums">
              {Number(d.date.slice(8, 10))}
            </div>
            <div className="text-[10px]">{d.rest ? "—" : "✓"}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground flex gap-3">
        <span>✓ puede trabajar</span>
        <span>— descanso por regla</span>
      </p>
    </div>
  );
}
