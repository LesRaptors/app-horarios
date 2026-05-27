"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  enumerateMonthRange,
  meanStdDev,
  zScoreColor,
  coverageColor,
  requiredSlots,
  dayOfWeek,
  type ZScoreColor,
  type CoverageColor,
} from "@/lib/equity-helpers";
import type {
  Location,
  Profile,
  Position,
  ShiftTemplate,
  StaffingRequirement,
  EmployeeEquityRollup,
} from "@/lib/types";

type Role = "admin" | "manager" | "employee";

export interface CoverageByPosition {
  position_id: string;
  position_name: string;
  assigned: number;
  required: number;
  percent: number;
  color: CoverageColor;
}

export interface CoverageHeatmapCell {
  rowLabel: string;
  colLabel: string;
  rowKey: string;
  colKey: string;
  assigned: number;
  required: number;
  percent: number | null;
  color: CoverageColor | null;
}

export interface CoverageData {
  kpi: {
    assigned: number;
    required: number;
    percent: number;
    color: CoverageColor;
  };
  byPosition: CoverageByPosition[];
  heatmap: {
    rows: { key: string; label: string }[];
    cols: { key: string; label: string }[];
    cells: CoverageHeatmapCell[];
    mode: "single-month" | "multi-month";
  };
}

export interface EquityRow {
  employee: Profile;
  turnos: number;
  D: number;
  S: number;
  N: number;
  F: number;
  Horas: number;
  colors: {
    D: ZScoreColor;
    S: ZScoreColor;
    N: ZScoreColor;
    F: ZScoreColor;
    Horas: ZScoreColor;
  };
}

export interface EquityColumnStats {
  D: { mean: number; stdDev: number };
  S: { mean: number; stdDev: number };
  N: { mean: number; stdDev: number };
  F: { mean: number; stdDev: number };
  Horas: { mean: number; stdDev: number };
}

export interface SedeData {
  sede: Location;
  coverage: CoverageData | null;
  equity: { rows: EquityRow[]; columnStats: EquityColumnStats };
}

export interface UseEquidadDashboardResult {
  loading: boolean;
  sedes: Location[];
  byLocation: Map<string, SedeData>;
  refetch: () => void;
}

export function useEquidadDashboard(
  periodStart: string,
  periodEnd: string,
  includeDrafts: boolean
): UseEquidadDashboardResult {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const [locations, setLocations] = useState<Location[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [staffingReqs, setStaffingReqs] = useState<StaffingRequirement[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [rollups, setRollups] = useState<EmployeeEquityRollup[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<
    Array<{ id: string; schedule_id: string; employee_id: string; date: string; shift_template_id: string; position_id: string; }>
  >([]);
  const [scheduleByLocation, setScheduleByLocation] = useState<
    Map<string, string[]>
  >(new Map());

  const months = useMemo(
    () => enumerateMonthRange(periodStart, periodEnd),
    [periodStart, periodEnd]
  );

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const role = profile.role as Role;
      const allowedStatuses = (
        includeDrafts ? ["published", "draft"] : ["published"]
      ) as ("draft" | "published" | "archived")[];

      const ymOr = months
        .map((m) => `and(year.eq.${m.year},month.eq.${m.month})`)
        .join(",");

      const [
        locsRes,
        profsRes,
        posRes,
        srRes,
        stRes,
        schedRes,
        rollRes,
      ] = await Promise.all([
        supabase.from("locations").select("*").order("name"),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .neq("role", "admin")
          .neq("role", "super_admin")
          .order("last_name"),
        supabase.from("positions").select("*"),
        supabase.from("staffing_requirements").select("*"),
        supabase.from("shift_templates").select("*").order("start_time"),
        supabase
          .from("schedules")
          .select("id, location_id, status, year, month")
          .in("status", allowedStatuses)
          .or(ymOr),
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .or(ymOr),
      ]);

      if (cancelled) return;

      const visibleLocations = (locsRes.data ?? []) as Location[];
      const filteredLocs =
        role === "manager" && profile.location_id
          ? visibleLocations.filter((l) => l.id === profile.location_id)
          : visibleLocations;

      setLocations(filteredLocs);
      setProfiles((profsRes.data ?? []) as Profile[]);
      setPositions((posRes.data ?? []) as Position[]);
      setStaffingReqs((srRes.data ?? []) as StaffingRequirement[]);
      setShiftTemplates((stRes.data ?? []) as ShiftTemplate[]);
      setRollups((rollRes.data ?? []) as EmployeeEquityRollup[]);

      const scheds = (schedRes.data ?? []) as Array<{
        id: string;
        location_id: string;
        status: string;
        year: number;
        month: number;
      }>;
      const byLoc = new Map<string, string[]>();
      for (const s of scheds) {
        const arr = byLoc.get(s.location_id) ?? [];
        arr.push(s.id);
        byLoc.set(s.location_id, arr);
      }
      setScheduleByLocation(byLoc);

      const scheduleIds = scheds.map((s) => s.id);
      if (scheduleIds.length === 0) {
        setScheduleEntries([]);
      } else {
        const entriesRes = await supabase
          .from("schedule_entries")
          .select("id, schedule_id, employee_id, date, shift_template_id, position_id")
          .in("schedule_id", scheduleIds)
          .neq("overtime_status", "rejected");
        if (cancelled) return;
        setScheduleEntries(
          (entriesRes.data ?? []) as Array<{
            id: string;
            schedule_id: string;
            employee_id: string;
            date: string;
            shift_template_id: string;
            position_id: string;
          }>
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, profile, months, includeDrafts, tick]);

  const byLocation = useMemo<Map<string, SedeData>>(() => {
    const out = new Map<string, SedeData>();
    if (!profile) return out;

    const allDates: string[] = [];
    for (const { year, month } of months) {
      const last = new Date(year, month, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        allDates.push(ds);
      }
    }

    for (const sede of locations) {
      const sedeEmps = profiles.filter((p) => p.location_id === sede.id);
      const sedeEmpIds = new Set(sedeEmps.map((p) => p.id));

      const sedeReqs = staffingReqs.filter((r) => r.location_id === sede.id);
      const sedePosIds = new Set(sedeReqs.map((r) => r.position_id));
      const sedePositions = positions.filter((p) => sedePosIds.has(p.id));

      const sedeTemplates = shiftTemplates.filter((t) => t.location_id === sede.id);

      const sedeSchedIds = new Set(scheduleByLocation.get(sede.id) ?? []);
      const sedeEntries = scheduleEntries.filter((e) => sedeSchedIds.has(e.schedule_id));

      let coverage: CoverageData | null = null;
      if (sedeReqs.length > 0) {
        const required = requiredSlots(
          sedeReqs.map((r) => ({
            day_of_week: r.day_of_week,
            required_count: r.required_count,
          })),
          allDates
        );
        const assigned = sedeEntries.length;
        const percent = required === 0 ? 0 : (assigned / required) * 100;

        const byPosition: CoverageByPosition[] = sedePositions
          .map((pos) => {
            const reqsForPos = sedeReqs.filter((r) => r.position_id === pos.id);
            const reqCount = requiredSlots(
              reqsForPos.map((r) => ({
                day_of_week: r.day_of_week,
                required_count: r.required_count,
              })),
              allDates
            );
            const assignedForPos = sedeEntries.filter(
              (e) => e.position_id === pos.id
            ).length;
            return {
              position_id: pos.id,
              position_name: pos.name,
              assigned: assignedForPos,
              required: reqCount,
              percent: reqCount === 0 ? 0 : (assignedForPos / reqCount) * 100,
              color: coverageColor(reqCount === 0 ? 0 : (assignedForPos / reqCount) * 100),
            };
          })
          .filter((p) => p.required > 0)
          .sort((a, b) => a.percent - b.percent);

        const isMulti = months.length > 1;
        const rows = sedeTemplates.map((t) => ({ key: t.id, label: t.name }));
        let cols: { key: string; label: string }[];
        const cells: CoverageHeatmapCell[] = [];

        if (!isMulti) {
          const { year, month } = months[0];
          const lastDay = new Date(year, month, 0).getDate();
          cols = Array.from({ length: lastDay }, (_, i) => ({
            key: String(i + 1),
            label: String(i + 1),
          }));

          for (const t of sedeTemplates) {
            for (let d = 1; d <= lastDay; d++) {
              const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const dow = dayOfWeek(ds);
              const reqRows = sedeReqs.filter(
                (r) => r.shift_template_id === t.id && r.day_of_week === dow
              );
              const reqCount = reqRows.reduce((a, r) => a + r.required_count, 0);
              const assignedCount = sedeEntries.filter(
                (e) => e.shift_template_id === t.id && e.date === ds
              ).length;
              const cellPercent =
                reqCount === 0 ? null : (assignedCount / reqCount) * 100;
              cells.push({
                rowLabel: t.name,
                colLabel: String(d),
                rowKey: t.id,
                colKey: String(d),
                assigned: assignedCount,
                required: reqCount,
                percent: cellPercent,
                color: cellPercent === null ? null : coverageColor(cellPercent),
              });
            }
          }
        } else {
          const dowLabels = ["D", "L", "M", "X", "J", "V", "S"];
          const displayOrder = [1, 2, 3, 4, 5, 6, 0];
          cols = displayOrder.map((d) => ({
            key: String(d),
            label: dowLabels[d],
          }));

          for (const t of sedeTemplates) {
            for (const dow of displayOrder) {
              const datesForDow = allDates.filter((ds) => dayOfWeek(ds) === dow);
              const reqPerOcc = sedeReqs
                .filter((r) => r.shift_template_id === t.id && r.day_of_week === dow)
                .reduce((a, r) => a + r.required_count, 0);
              const reqCount = reqPerOcc * datesForDow.length;
              const assignedCount = sedeEntries.filter((e) => {
                if (e.shift_template_id !== t.id) return false;
                return dayOfWeek(e.date) === dow;
              }).length;
              const cellPercent =
                reqCount === 0 ? null : (assignedCount / reqCount) * 100;
              cells.push({
                rowLabel: t.name,
                colLabel: dowLabels[dow],
                rowKey: t.id,
                colKey: String(dow),
                assigned: assignedCount,
                required: reqCount,
                percent: cellPercent,
                color: cellPercent === null ? null : coverageColor(cellPercent),
              });
            }
          }
        }

        coverage = {
          kpi: {
            assigned,
            required,
            percent,
            color: coverageColor(percent),
          },
          byPosition,
          heatmap: {
            rows,
            cols,
            cells,
            mode: isMulti ? "multi-month" : "single-month",
          },
        };
      }

      const sedeRollups = rollups.filter((r) => sedeEmpIds.has(r.employee_id));

      const aggMap = new Map<
        string,
        { D: number; S: number; N: number; F: number; Horas: number; turnos: number }
      >();
      for (const emp of sedeEmps) {
        aggMap.set(emp.id, { D: 0, S: 0, N: 0, F: 0, Horas: 0, turnos: 0 });
      }
      for (const r of sedeRollups) {
        const cur = aggMap.get(r.employee_id);
        if (!cur) continue;
        cur.D += r.sundays_worked;
        cur.S += r.saturdays_worked;
        cur.N += r.nights_worked;
        cur.F += r.holidays_worked;
        cur.Horas += Number(r.total_hours);
      }
      for (const e of sedeEntries) {
        const cur = aggMap.get(e.employee_id);
        if (!cur) continue;
        cur.turnos += 1;
      }

      const allD = sedeEmps.map((e) => aggMap.get(e.id)!.D);
      const allS = sedeEmps.map((e) => aggMap.get(e.id)!.S);
      const allN = sedeEmps.map((e) => aggMap.get(e.id)!.N);
      const allF = sedeEmps.map((e) => aggMap.get(e.id)!.F);
      const allH = sedeEmps.map((e) => aggMap.get(e.id)!.Horas);
      const colStats: EquityColumnStats = {
        D: meanStdDev(allD),
        S: meanStdDev(allS),
        N: meanStdDev(allN),
        F: meanStdDev(allF),
        Horas: meanStdDev(allH),
      };

      const rowsEquity: EquityRow[] = sedeEmps.map((emp) => {
        const a = aggMap.get(emp.id)!;
        return {
          employee: emp,
          turnos: a.turnos,
          D: a.D,
          S: a.S,
          N: a.N,
          F: a.F,
          Horas: a.Horas,
          colors: {
            D: zScoreColor(a.D, colStats.D.mean, colStats.D.stdDev),
            S: zScoreColor(a.S, colStats.S.mean, colStats.S.stdDev),
            N: zScoreColor(a.N, colStats.N.mean, colStats.N.stdDev),
            F: zScoreColor(a.F, colStats.F.mean, colStats.F.stdDev),
            Horas: zScoreColor(a.Horas, colStats.Horas.mean, colStats.Horas.stdDev),
          },
        };
      });

      out.set(sede.id, { sede, coverage, equity: { rows: rowsEquity, columnStats: colStats } });
    }

    return out;
  }, [
    profile,
    months,
    locations,
    profiles,
    positions,
    staffingReqs,
    shiftTemplates,
    scheduleByLocation,
    scheduleEntries,
    rollups,
  ]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { loading, sedes: locations, byLocation, refetch };
}
