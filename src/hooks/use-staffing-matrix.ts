"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { makeCellKey, type CellKey } from "@/lib/staffing-helpers";
import type {
  Position,
  ShiftTemplate,
  StaffingRequirement,
} from "@/lib/types";

export interface UseStaffingMatrixResult {
  loading: boolean;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
  persisted: Record<CellKey, number>;
  capacity: Record<string, number>;
  recentCoverage: Record<CellKey, number[]>;
  refetch: () => void;
}

export function useStaffingMatrix(locationId: string | null): UseStaffingMatrixResult {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [persisted, setPersisted] = useState<Record<CellKey, number>>({});
  const [capacity, setCapacity] = useState<Record<string, number>>({});
  const [recentCoverage, setRecentCoverage] = useState<Record<CellKey, number[]>>({});

  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1-3 en paralelo: requirements, positions (con filtro location), shift_templates.
      const [reqRes, posRes, stRes] = await Promise.all([
        supabase.from("staffing_requirements").select("*").eq("location_id", locationId),
        supabase
          .from("positions")
          .select("*, department:departments(location_id)")
          .order("name"),
        supabase.from("shift_templates").select("*").eq("location_id", locationId).order("name"),
      ]);

      if (cancelled) return;

      const reqs = ((reqRes.data ?? []) as StaffingRequirement[]);
      const persistedMap: Record<CellKey, number> = {};
      for (const r of reqs) {
        persistedMap[makeCellKey(r.position_id, r.shift_template_id, r.day_of_week)] = r.required_count;
      }
      setPersisted(persistedMap);

      const allPositions = (posRes.data ?? []) as (Position & { department: { location_id: string } | null })[];
      const locationPositions = allPositions.filter(
        (p) => p.department?.location_id === locationId
      );
      setPositions(locationPositions);
      setShiftTemplates((stRes.data ?? []) as ShiftTemplate[]);

      // 4. Capacidad teórica: count de profiles activos por position_id (primaria + secundaria) en sede.
      const positionIds = locationPositions.map((p) => p.id);
      const capacityMap: Record<string, number> = {};
      if (positionIds.length > 0) {
        const [primaryRes, secondaryRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("position_id")
            .eq("location_id", locationId)
            .eq("is_active", true)
            .in("position_id", positionIds),
          supabase
            .from("employee_secondary_positions")
            .select("position_id, employee:profiles!inner(location_id, is_active)")
            .in("position_id", positionIds),
        ]);
        for (const row of (primaryRes.data ?? []) as Array<{ position_id: string | null }>) {
          if (!row.position_id) continue;
          capacityMap[row.position_id] = (capacityMap[row.position_id] ?? 0) + 1;
        }
        for (const row of (secondaryRes.data ?? []) as Array<{
          position_id: string;
          employee: { location_id: string; is_active: boolean } | null;
        }>) {
          if (!row.employee?.is_active || row.employee.location_id !== locationId) continue;
          capacityMap[row.position_id] = (capacityMap[row.position_id] ?? 0) + 1;
        }
      }
      setCapacity(capacityMap);

      // 5. Cobertura real reciente: schedule_entries últimas 4 semanas.
      const today = new Date();
      const fourWeeksAgo = new Date(today);
      fourWeeksAgo.setDate(today.getDate() - 28);
      const fromDate = fourWeeksAgo.toISOString().slice(0, 10);
      const toDate = today.toISOString().slice(0, 10);

      const { data: entriesData } = await supabase
        .from("schedule_entries")
        .select("date, position_id, shift_template_id, schedule:schedules!inner(location_id)")
        .gte("date", fromDate)
        .lte("date", toDate)
        .eq("schedules.location_id", locationId);

      const coverageBuckets: Record<CellKey, number[]> = {};
      for (const row of (entriesData ?? []) as Array<{
        date: string;
        position_id: string;
        shift_template_id: string;
      }>) {
        const d = new Date(row.date + "T00:00:00");
        const dow = d.getDay();
        const weekIdx = Math.floor((today.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weekIdx < 0 || weekIdx > 3) continue;
        const bucketIdx = 3 - weekIdx;  // 0 = w-3, 3 = esta semana
        const key = makeCellKey(row.position_id, row.shift_template_id, dow);
        if (!coverageBuckets[key]) coverageBuckets[key] = [0, 0, 0, 0];
        coverageBuckets[key][bucketIdx]++;
      }
      setRecentCoverage(coverageBuckets);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, locationId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { loading, positions, shiftTemplates, persisted, capacity, recentCoverage, refetch };
}
