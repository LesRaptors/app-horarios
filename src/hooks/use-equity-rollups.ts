"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { EmployeeEquityRollup } from "@/lib/types";

/**
 * Subscribes to employee_equity_rollups changes so the consuming page
 * stays in sync when another tab (or the server) mutates a rollup.
 * Fetches all rollups from (minYear ?? currentYear-1) onward — the
 * equity UI only ever looks at a rolling 3-month window, so one year
 * of history is always enough.
 */
export function useEquityRollups(minYear?: number) {
  const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
  const { user } = useAuth();
  const supabase = createClient();
  const effectiveMinYear = minYear ?? new Date().getFullYear() - 1;

  useEffect(() => {
    // Wait for auth before subscribing — supabase realtime pins the JWT
    // at channel creation time, and rollups RLS rejects anon, so an
    // unauthenticated channel would silently never fire.
    if (!user) return;

    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("employee_equity_rollups")
        .select("*")
        .gte("year", effectiveMinYear);
      if (!cancelled) {
        setRollups((data ?? []) as EmployeeEquityRollup[]);
      }
    })();

    const sameKey = (a: Partial<EmployeeEquityRollup>, b: Partial<EmployeeEquityRollup>) =>
      a.employee_id === b.employee_id && a.year === b.year && a.month === b.month;

    const channel = supabase
      .channel("equity-rollups")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_equity_rollups" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<EmployeeEquityRollup>;
            setRollups((prev) => prev.filter((r) => !sameKey(r, oldRow)));
            return;
          }
          const row = payload.new as EmployeeEquityRollup;
          if (row.year < effectiveMinYear) return;
          setRollups((prev) => {
            const idx = prev.findIndex((r) => sameKey(r, row));
            if (idx === -1) return [...prev, row];
            const next = prev.slice();
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, effectiveMinYear, user]);

  return rollups;
}
