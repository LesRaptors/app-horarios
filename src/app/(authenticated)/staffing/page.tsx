"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { StaffingMatrix } from "@/components/staffing/staffing-matrix";
import type { Location, Position, ShiftTemplate } from "@/lib/types";

export default function StaffingPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const fetchLocations = useCallback(async () => {
    const { data } = await supabase.from("locations").select("*").order("name");
    if (data) {
      setLocations(data as Location[]);
      if (data.length > 0 && !selectedLocationId) {
        setSelectedLocationId(data[0].id);
      }
    }
    setLoadingData(false);
  }, [supabase, selectedLocationId]);

  const fetchLocationData = useCallback(async () => {
    if (!selectedLocationId) return;

    const [posRes, stRes] = await Promise.all([
      supabase.from("positions").select("*, department:departments(location_id)").order("name"),
      supabase.from("shift_templates").select("*").eq("location_id", selectedLocationId).order("name"),
    ]);

    // Filter positions to those belonging to departments in this location
    const allPositions = (posRes.data ?? []) as (Position & { department: { location_id: string } | null })[];
    const locationPositions = allPositions.filter(
      (p) => p.department?.location_id === selectedLocationId
    );
    setPositions(locationPositions);
    setShiftTemplates((stRes.data ?? []) as ShiftTemplate[]);
  }, [supabase, selectedLocationId]);

  useEffect(() => {
    if (!authLoading && profile) fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  useEffect(() => {
    if (selectedLocationId) fetchLocationData();
  }, [selectedLocationId, fetchLocationData]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile || !["admin", "manager"].includes(profile.role)) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No tienes permisos para ver esta pagina.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Necesidades de personal</h1>
        <p className="text-muted-foreground">
          Define cuantos empleados de cada posicion necesitas por turno y dia de la semana
        </p>
      </div>

      {/* Location selector */}
      <div className="max-w-xs">
        <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar sede" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Matrix */}
      {loadingData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : selectedLocationId ? (
        <StaffingMatrix
          key={selectedLocationId}
          locationId={selectedLocationId}
          positions={positions}
          shiftTemplates={shiftTemplates}
        />
      ) : (
        <p className="text-muted-foreground">Selecciona una sede para configurar las necesidades.</p>
      )}
    </div>
  );
}
