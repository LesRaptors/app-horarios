"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStaffingMatrix } from "@/hooks/use-staffing-matrix";
import {
  replicateAcrossDays,
  replicateShiftToShift,
  parseCellKey,
  type CellKey,
} from "@/lib/staffing-helpers";
import { StaffingTabByShift } from "@/components/staffing/staffing-tab-by-shift";
import { StaffingTabByPosition } from "@/components/staffing/staffing-tab-by-position";
import { StaffingTabHeatmap } from "@/components/staffing/staffing-tab-heatmap";

interface StaffingMatrixProps {
  locationId: string;
}

export function StaffingMatrix({ locationId }: StaffingMatrixProps) {
  const supabase = createClient();
  const [draft, setDraft] = useState<Record<CellKey, number>>({});
  const [activeTab, setActiveTab] = useState<"shift" | "position" | "heatmap">("shift");
  const [saving, setSaving] = useState(false);

  const { loading, positions, shiftTemplates, persisted, capacity, recentCoverage, refetch } =
    useStaffingMatrix(locationId);

  function onCellChange(key: CellKey, value: number) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function onReplicateAcrossDays(
    sourceDay: number,
    targetDays: number[],
    scope: { positionIds: string[]; shiftTemplateIds: string[] }
  ) {
    const desired = { ...persisted, ...draft };
    const next = replicateAcrossDays(desired, sourceDay, targetDays, scope);
    const newDraft: Record<CellKey, number> = {};
    for (const [key, value] of Object.entries(next)) {
      if (persisted[key] !== value) newDraft[key] = value;
    }
    setDraft(newDraft);
  }

  function onReplicateShiftToShift(
    sourceShiftId: string,
    targetShiftId: string,
    scope: { positionIds: string[] }
  ) {
    const desired = { ...persisted, ...draft };
    const next = replicateShiftToShift(desired, sourceShiftId, targetShiftId, scope);
    const newDraft: Record<CellKey, number> = {};
    for (const [key, value] of Object.entries(next)) {
      if (persisted[key] !== value) newDraft[key] = value;
    }
    setDraft(newDraft);
  }

  async function handleSave() {
    setSaving(true);
    const desired = { ...persisted, ...draft };
    const rows = Object.entries(desired)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ ...parseCellKey(key), required_count: value }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("save_staffing_diff", {
      p_location_id: locationId,
      p_rows: rows,
    });

    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      const result = data as { inserted: number; updated: number; deleted: number } | null;
      const parts: string[] = [];
      if (result?.inserted) parts.push(`${result.inserted} nuevas`);
      if (result?.updated) parts.push(`${result.updated} modificadas`);
      if (result?.deleted) parts.push(`${result.deleted} borradas`);
      const summary = parts.length > 0 ? parts.join(", ") : "sin cambios netos";
      toast.success(`Necesidades guardadas — ${summary}`);
      refetch();
      setDraft({});
    }
    setSaving(false);
  }

  function handleDiscard() {
    const count = Object.keys(draft).length;
    if (count === 0) return;
    if (window.confirm(`Tienes ${count} cambios sin guardar — ¿descartar?`)) {
      setDraft({});
    }
  }

  const draftCount = Object.keys(draft).length;

  return (
    <div className="space-y-4">
      {/* Header sticky con conteo + botones */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 flex items-center justify-between border-b">
        {draftCount > 0 ? (
          <Badge variant="default" className="gap-1">
            <span className="font-mono">{draftCount}</span>
            <span>cambios sin guardar</span>
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Sin cambios pendientes</span>
        )}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleDiscard}
            disabled={draftCount === 0}
          >
            Descartar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || draftCount === 0}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="shift">Por turno</TabsTrigger>
            <TabsTrigger value="position">Por posición</TabsTrigger>
            <TabsTrigger value="heatmap">Heatmap demanda</TabsTrigger>
          </TabsList>

          <TabsContent value="shift">
            <StaffingTabByShift
              positions={positions}
              shiftTemplates={shiftTemplates}
              persisted={persisted}
              draft={draft}
              capacity={capacity}
              recentCoverage={recentCoverage}
              onCellChange={onCellChange}
              onReplicateAcrossDays={onReplicateAcrossDays}
              onReplicateShiftToShift={onReplicateShiftToShift}
            />
          </TabsContent>

          <TabsContent value="position">
            <StaffingTabByPosition
              positions={positions}
              shiftTemplates={shiftTemplates}
              persisted={persisted}
              draft={draft}
              capacity={capacity}
              recentCoverage={recentCoverage}
              onCellChange={onCellChange}
              onReplicateAcrossDays={onReplicateAcrossDays}
              onReplicateShiftToShift={onReplicateShiftToShift}
            />
          </TabsContent>

          <TabsContent value="heatmap">
            <StaffingTabHeatmap
              positions={positions}
              shiftTemplates={shiftTemplates}
              persisted={persisted}
              draft={draft}
              capacity={capacity}
              onCellChange={onCellChange}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
