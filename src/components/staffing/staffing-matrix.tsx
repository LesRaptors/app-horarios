"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateDbError } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DAY_OF_WEEK_SHORT, WEEKDAYS_DISPLAY_ORDER } from "@/lib/constants";
import type {
  Position,
  ShiftTemplate,
  StaffingRequirement,
} from "@/lib/types";

interface StaffingMatrixProps {
  locationId: string;
  positions: Position[];
  shiftTemplates: ShiftTemplate[];
}

// key: "positionId_shiftTemplateId_dayOfWeek" -> required_count
type RequirementMap = Record<string, number>;

function makeKey(positionId: string, shiftTemplateId: string, dayOfWeek: number) {
  return `${positionId}_${shiftTemplateId}_${dayOfWeek}`;
}

export function StaffingMatrix({
  locationId,
  positions,
  shiftTemplates,
}: StaffingMatrixProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requirements, setRequirements] = useState<RequirementMap>({});
  const [originalRequirements, setOriginalRequirements] = useState<RequirementMap>({});

  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staffing_requirements")
      .select("*")
      .eq("location_id", locationId);

    if (error) {
      toast.error(translateDbError(error.message, "Error al cargar necesidades"));
      setLoading(false);
      return;
    }

    const map: RequirementMap = {};
    for (const req of (data as StaffingRequirement[]) || []) {
      const key = makeKey(req.position_id, req.shift_template_id, req.day_of_week);
      map[key] = req.required_count;
    }
    setRequirements(map);
    setOriginalRequirements(map);
    setLoading(false);
  }, [supabase, locationId]);

  useEffect(() => {
    if (locationId) fetchRequirements();
  }, [locationId, fetchRequirements]);

  function handleChange(positionId: string, shiftTemplateId: string, dayOfWeek: number, value: string) {
    const num = Math.max(0, parseInt(value) || 0);
    const key = makeKey(positionId, shiftTemplateId, dayOfWeek);
    setRequirements((prev) => ({ ...prev, [key]: num }));
  }

  const hasChanges = JSON.stringify(requirements) !== JSON.stringify(originalRequirements);

  async function handleSave() {
    setSaving(true);

    // Collect all non-zero requirements to upsert
    const rows: {
      location_id: string;
      position_id: string;
      shift_template_id: string;
      day_of_week: number;
      required_count: number;
    }[] = [];

    for (const template of shiftTemplates) {
      for (const pos of positions) {
        for (const dow of WEEKDAYS_DISPLAY_ORDER) {
          const key = makeKey(pos.id, template.id, dow);
          const count = requirements[key] ?? 0;
          rows.push({
            location_id: locationId,
            position_id: pos.id,
            shift_template_id: template.id,
            day_of_week: dow,
            required_count: count,
          });
        }
      }
    }

    // Delete existing and insert all (simpler than upsert per row)
    const { error: delError } = await supabase
      .from("staffing_requirements")
      .delete()
      .eq("location_id", locationId);

    if (delError) {
      toast.error(translateDbError(delError.message, "Error al guardar"));
      setSaving(false);
      return;
    }

    // Only insert rows with count > 0
    const toInsert = rows.filter((r) => r.required_count > 0);
    if (toInsert.length > 0) {
      const { error: insError } = await supabase
        .from("staffing_requirements")
        .insert(toInsert);

      if (insError) {
        toast.error(translateDbError(insError.message, "Error al guardar"));
        setSaving(false);
        return;
      }
    }

    toast.success("Necesidades de personal guardadas");
    setOriginalRequirements({ ...requirements });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (shiftTemplates.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No hay plantillas de turno para esta sede. Crea plantillas en la seccion de Turnos.
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No hay posiciones definidas. Crea posiciones en la seccion de Posiciones.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {shiftTemplates.map((template) => (
        <Card key={template.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: template.color }}
              />
              {template.name}
              <span className="text-sm font-normal text-muted-foreground">
                ({template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Posición
                    </th>
                    {WEEKDAYS_DISPLAY_ORDER.map((dow) => (
                      <th
                        key={dow}
                        className={`text-center py-2 px-1 font-medium text-muted-foreground min-w-[3.5rem] ${
                          dow === 0 || dow === 6 ? "text-red-500" : ""
                        }`}
                      >
                        {DAY_OF_WEEK_SHORT[dow]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos.id} className="border-t">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: pos.color }}
                          />
                          <span className="text-sm">{pos.name}</span>
                        </div>
                      </td>
                      {WEEKDAYS_DISPLAY_ORDER.map((dow) => {
                        const key = makeKey(pos.id, template.id, dow);
                        const value = requirements[key] ?? 0;
                        return (
                          <td key={dow} className="py-2 px-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={99}
                              value={value}
                              onChange={(e) =>
                                handleChange(pos.id, template.id, dow, e.target.value)
                              }
                              className="h-8 w-14 text-center mx-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar necesidades
        </Button>
      </div>
    </div>
  );
}
