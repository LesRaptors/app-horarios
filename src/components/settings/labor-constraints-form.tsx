"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { translateDbError } from "@/lib/utils";

export function LaborConstraintsForm() {
  const { constraints, loading, updateConstraints } = useSettings();
  const [saving, setSaving] = useState(false);

  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(constraints.maxHoursPerWeek);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(constraints.maxHoursPerDay);
  const [minRestHours, setMinRestHours] = useState(constraints.minRestHoursBetweenShifts);
  const [maxConsecutive, setMaxConsecutive] = useState(constraints.maxConsecutiveDays);

  // Sync when settings load
  useState(() => {
    if (!loading) {
      setMaxHoursPerWeek(constraints.maxHoursPerWeek);
      setMaxHoursPerDay(constraints.maxHoursPerDay);
      setMinRestHours(constraints.minRestHoursBetweenShifts);
      setMaxConsecutive(constraints.maxConsecutiveDays);
    }
  });

  async function handleSave() {
    if (maxHoursPerWeek < 1 || maxHoursPerDay < 1 || minRestHours < 0 || maxConsecutive < 1) {
      toast.error("Todos los valores deben ser positivos");
      return;
    }

    setSaving(true);
    const { error } = await updateConstraints({
      maxHoursPerWeek,
      maxHoursPerDay,
      minRestHoursBetweenShifts: minRestHours,
      maxConsecutiveDays: maxConsecutive,
    });

    if (error) {
      toast.error(translateDbError(error.message, "Error al guardar configuración"));
    } else {
      toast.success("Restricciones laborales actualizadas");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restricciones laborales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Máximo horas por semana</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={maxHoursPerWeek}
              onChange={(e) => setMaxHoursPerWeek(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Máximo horas por día</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={maxHoursPerDay}
              onChange={(e) => setMaxHoursPerDay(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mínimo horas de descanso entre turnos</Label>
            <Input
              type="number"
              min={0}
              max={48}
              value={minRestHours}
              onChange={(e) => setMinRestHours(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Máximo días consecutivos</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={maxConsecutive}
              onChange={(e) => setMaxConsecutive(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar cambios
        </Button>
      </CardContent>
    </Card>
  );
}
