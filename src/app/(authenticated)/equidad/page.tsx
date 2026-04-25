"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEquidadDashboard } from "@/hooks/use-equidad-dashboard";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PeriodRangePicker, currentMonthValue } from "@/components/equidad/period-range-picker";
import { CoverageSection } from "@/components/equidad/coverage-section";
import { EquityLeaderboard } from "@/components/equidad/equity-leaderboard";
import { EmployeeEquityPanel } from "@/components/schedule/employee-equity-panel";
import { createClient } from "@/lib/supabase/client";
import type { ContractType, Position, Profile, EmployeeEquityRollup } from "@/lib/types";

export default function EquidadPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [start, setStart] = useState(currentMonthValue());
  const [end, setEnd] = useState(currentMonthValue());
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const { loading, sedes, byLocation, refetch } = useEquidadDashboard(
    start,
    end,
    includeDrafts
  );

  const [activeTab, setActiveTab] = useState<string>("");
  useEffect(() => {
    if (!activeTab && sedes.length > 0) setActiveTab(sedes[0].id);
  }, [sedes, activeTab]);

  const [panelEmp, setPanelEmp] = useState<Profile | null>(null);
  const [contracts, setContracts] = useState<ContractType[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [allRollups, setAllRollups] = useState<EmployeeEquityRollup[]>([]);

  useEffect(() => {
    (async () => {
      const [cts, pos, rolls] = await Promise.all([
        supabase.from("contract_types").select("*"),
        supabase.from("positions").select("*"),
        supabase
          .from("employee_equity_rollups")
          .select("*")
          .gte("year", new Date().getFullYear() - 1),
      ]);
      setContracts((cts.data ?? []) as ContractType[]);
      setPositions((pos.data ?? []) as Position[]);
      setAllRollups((rolls.data ?? []) as EmployeeEquityRollup[]);
    })();
  }, [supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) return;
    if (profile.role === "employee") {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.role === "employee") return null;

  const now = new Date();
  const panelContract = panelEmp
    ? contracts.find((c) => c.id === panelEmp.contract_type_id)
    : undefined;
  const panelPosition = panelEmp
    ? positions.find((p) => p.id === panelEmp.position_id)
    : undefined;
  const panelRollups = panelEmp
    ? allRollups.filter((r) => r.employee_id === panelEmp.id)
    : [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Equidad</h1>
        <p className="text-muted-foreground">
          Cobertura operativa y distribución de carga por sede.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <PeriodRangePicker
          start={start}
          end={end}
          onChange={(next) => {
            setStart(next.start);
            setEnd(next.end);
          }}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-drafts"
            checked={includeDrafts}
            onCheckedChange={(c) => setIncludeDrafts(c === true)}
          />
          <Label htmlFor="include-drafts">Incluir borradores</Label>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} title="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sedes.length === 0 ? (
        <p className="text-muted-foreground">No hay sedes visibles para tu rol.</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {sedes.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {sedes.map((s) => {
            const data = byLocation.get(s.id);
            if (!data) return null;
            return (
              <TabsContent key={s.id} value={s.id} className="space-y-6">
                <CoverageSection coverage={data.coverage} />
                <EquityLeaderboard
                  rows={data.equity.rows}
                  columnStats={data.equity.columnStats}
                  onRowClick={setPanelEmp}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <Sheet open={!!panelEmp} onOpenChange={(o) => !o && setPanelEmp(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {panelEmp && (
            <EmployeeEquityPanel
              employee={panelEmp}
              position={panelPosition}
              contract={panelContract}
              rollups={panelRollups}
              currentYear={now.getFullYear()}
              currentMonth={now.getMonth() + 1}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
