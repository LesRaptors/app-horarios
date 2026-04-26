"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { startOfWeekISO, endOfWeekISO } from "@/lib/equity-helpers";
import type {
  ContractType,
  EmployeeEquityRollup,
  Position,
  Profile,
} from "@/lib/types";

export interface UpcomingShift {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  position_name: string | null;
  position_color: string | null;
}

export interface UseMyEquityDashboardResult {
  loading: boolean;
  profile: Profile | null;
  contract: ContractType | null;
  position: Position | null;
  rollups: EmployeeEquityRollup[];
  upcomingShifts: UpcomingShift[];
  shiftsThisMonth: number;
  hoursThisWeek: number;
  hoursWeekMax: number;
  saturdaysThisMonth: number;
  nightsThisMonth: number;
}

export function useMyEquityDashboard(): UseMyEquityDashboardResult {
  const { user, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  const [contract, setContract] = useState<ContractType | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [shiftsThisMonth, setShiftsThisMonth] = useState(0);
  const [hoursThisWeek, setHoursThisWeek] = useState(0);
  const [saturdaysThisMonth, setSaturdaysThisMonth] = useState(0);
  const [nightsThisMonth, setNightsThisMonth] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const weekStart = startOfWeekISO(now);
      const weekEnd = endOfWeekISO(now);

      const ct = profile.contract_type_id
        ? supabase
            .from("contract_types")
            .select("*")
            .eq("id", profile.contract_type_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: ContractType | null });

      const pos = profile.position_id
        ? supabase
            .from("positions")
            .select("*")
            .eq("id", profile.position_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: Position | null });

      const [
        ctRes,
        posRes,
        rollRes,
        upcomingRes,
        thisMonthRes,
        thisWeekRes,
      ] = await Promise.all([
        ct,
        pos,
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .eq("employee_id", user.id)
          .gte("year", currentYear - 1),
        supabase
          .from("schedule_entries")
          .select(
            "id, date, start_time, end_time, position:positions(name, color), schedule:schedules!inner(status)"
          )
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .gte("date", today)
          .order("date")
          .limit(7),
        supabase
          .from("schedule_entries")
          .select(
            "id, date, start_time, end_time, shift_template:shift_templates(is_night), schedule:schedules!inner(status, year, month)",
            { count: "exact" }
          )
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .eq("schedule.year", currentYear)
          .eq("schedule.month", currentMonth),
        supabase
          .from("schedule_entries")
          .select("start_time, end_time, schedule:schedules!inner(status)")
          .eq("employee_id", user.id)
          .neq("overtime_status", "rejected")
          .eq("schedule.status", "published")
          .gte("date", weekStart)
          .lte("date", weekEnd),
      ]);

      if (cancelled) return;

      setContract((ctRes.data ?? null) as ContractType | null);
      setPosition((posRes.data ?? null) as Position | null);
      setRollups((rollRes.data ?? []) as EmployeeEquityRollup[]);

      const upcomingRows = (upcomingRes.data ?? []) as Array<{
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        position: { name: string; color: string } | null;
      }>;
      setUpcomingShifts(
        upcomingRows.map((r) => ({
          id: r.id,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          position_name: r.position?.name ?? null,
          position_color: r.position?.color ?? null,
        }))
      );

      const monthRows = (thisMonthRes.data ?? []) as Array<{
        date: string;
        shift_template: { is_night: boolean } | null;
      }>;
      setShiftsThisMonth(thisMonthRes.count ?? monthRows.length);
      let saturdays = 0;
      let nights = 0;
      for (const e of monthRows) {
        const dow = new Date(e.date + "T00:00:00").getDay();
        if (dow === 6) saturdays += 1;
        if (e.shift_template?.is_night) nights += 1;
      }
      setSaturdaysThisMonth(saturdays);
      setNightsThisMonth(nights);

      const weekRows = (thisWeekRes.data ?? []) as Array<{
        start_time: string;
        end_time: string;
      }>;
      let totalMin = 0;
      for (const e of weekRows) {
        const [sh, sm] = e.start_time.split(":").map(Number);
        const [eh, em] = e.end_time.split(":").map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        totalMin += mins;
      }
      setHoursThisWeek(Math.round((totalMin / 60) * 10) / 10);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user, profile]);

  return {
    loading,
    profile,
    contract,
    position,
    rollups,
    upcomingShifts,
    shiftsThisMonth,
    hoursThisWeek,
    hoursWeekMax: profile?.max_hours_per_week ?? 40,
    saturdaysThisMonth,
    nightsThisMonth,
  };
}
