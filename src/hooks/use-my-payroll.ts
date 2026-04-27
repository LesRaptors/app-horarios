"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollProvision,
  PayrollEmployerCost,
} from "@/lib/types";

export interface UseMyPayrollResult {
  loading: boolean;
  period: PayrollPeriod | null;
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
  availablePeriods: PayrollPeriod[];
  refetch: () => void;
}

export function useMyPayroll(periodId?: string): UseMyPayrollResult {
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = useMemo(() => createClient() as any, []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [provisions, setProvisions] = useState<PayrollProvision[]>([]);
  const [employerCost, setEmployerCost] = useState<PayrollEmployerCost | null>(null);
  const [availablePeriods, setAvailablePeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1. Fetch employee's available periods (only approved/paid).
      const { data: periodsData } = await supabase
        .from("payroll_periods")
        .select("*, payroll_entries!inner(employee_id)")
        .in("status", ["approved", "paid"])
        .eq("payroll_entries.employee_id", user.id)
        .order("period_start", { ascending: false });

      if (cancelled) return;
      const myPeriods = ((periodsData ?? []) as Array<PayrollPeriod & { payroll_entries: unknown }>)
        .map(({ payroll_entries: _ignore, ...rest }) => rest as PayrollPeriod);

      // dedupe by id (the inner join can return duplicates if multiple entries match)
      const seen = new Set<string>();
      const uniquePeriods = myPeriods.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      setAvailablePeriods(uniquePeriods);

      // 2. Resolve target period.
      const targetId = periodId ?? uniquePeriods[0]?.id ?? null;
      if (!targetId) {
        setPeriod(null);
        setEntries([]);
        setProvisions([]);
        setEmployerCost(null);
        setLoading(false);
        return;
      }

      const target = uniquePeriods.find((p) => p.id === targetId);
      if (!target) {
        setPeriod(null);
        setLoading(false);
        return;
      }
      setPeriod(target);

      // 3. Parallel fetch of entries / provisions / employer cost.
      const [entriesRes, provRes, costRes] = await Promise.all([
        supabase
          .from("payroll_entries")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id),
        supabase
          .from("payroll_provisions")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id),
        supabase
          .from("payroll_employer_cost")
          .select("*")
          .eq("payroll_period_id", targetId)
          .eq("employee_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setEntries((entriesRes.data ?? []) as PayrollEntry[]);
      setProvisions((provRes.data ?? []) as PayrollProvision[]);
      setEmployerCost((costRes.data ?? null) as PayrollEmployerCost | null);
      setLoading(false);
    })();

    // 4. Realtime subscription on payroll_periods.
    const channel = supabase
      .channel("my-payroll-periods")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payroll_periods" },
        () => setTick((t) => t + 1)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, user, periodId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return {
    loading,
    period,
    entries,
    provisions,
    employerCost,
    availablePeriods,
    refetch,
  };
}
