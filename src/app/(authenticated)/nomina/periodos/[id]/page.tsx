"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { canAdmin } from "@/lib/auth/can-manage";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { PeriodSummaryTab } from "@/components/nomina/period-summary-tab";
import { PeriodEmployeeTab } from "@/components/nomina/period-employee-tab";
import { PeriodOverridesTab } from "@/components/nomina/period-overrides-tab";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollProvision,
  PayrollEmployerCost,
  Profile,
  Location,
} from "@/lib/types";

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950" },
  approved: { label: "Aprobado", className: "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950" },
  paid: { label: "Pagado", className: "border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950" },
};

const FREQUENCY_LABELS: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
};

// -------------------------------------------------------------------------------
// Page component
// -------------------------------------------------------------------------------

export default function PeriodoDetallePage() {
  const params = useParams<{ id: string }>();
  const periodId = params.id;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [provisions, setProvisions] = useState<PayrollProvision[]>([]);
  const [employerCosts, setEmployerCosts] = useState<PayrollEmployerCost[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [
      { data: periodData, error: periodError },
      { data: entriesData },
      { data: provisionsData },
      { data: costsData },
      { data: profilesData },
      { data: locationsData },
    ] = await Promise.all([
      supabase.from("payroll_periods").select("*").eq("id", periodId).maybeSingle(),
      supabase.from("payroll_entries").select("*").eq("payroll_period_id", periodId),
      supabase.from("payroll_provisions").select("*").eq("payroll_period_id", periodId),
      supabase.from("payroll_employer_cost").select("*").eq("payroll_period_id", periodId),
      supabase.from("profiles").select("*").eq("is_active", true).eq("is_terminated", false).neq("role", "super_admin"),
      supabase.from("locations").select("*").order("name"),
    ]);

    if (periodError || !periodData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchedEntries: PayrollEntry[] = entriesData ?? [];
    const fetchedCosts: PayrollEmployerCost[] = costsData ?? [];

    // Errores/advertencias del motor, persistidos por el builder en el período.
    const hardErrors: string[] = Array.isArray(periodData.compute_errors)
      ? (periodData.compute_errors as string[])
      : [];
    const softWarnings: string[] = Array.isArray(periodData.compute_warnings)
      ? (periodData.compute_warnings as string[])
      : [];

    // Narrow employees to those actually present in entries for this period
    const employeeIdsInPeriod = new Set(fetchedEntries.map((e) => e.employee_id));
    const filteredProfiles: Profile[] = (profilesData ?? []).filter((p: Profile) =>
      employeeIdsInPeriod.has(p.id)
    );

    setPeriod(periodData as PayrollPeriod);
    setEntries(fetchedEntries);
    setProvisions(provisionsData ?? []);
    setEmployerCosts(fetchedCosts);
    setEmployees(filteredProfiles);
    setLocations(locationsData ?? []);
    setErrors(hardErrors);
    setWarnings(softWarnings);
    setLoading(false);
  }, [supabase, periodId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!canAdmin(profile.role)) router.replace("/dashboard");
  }, [profile, authLoading, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canAdmin(profile.role)) return null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !period) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Período no encontrado</p>
        <button
          className="text-sm underline"
          onClick={() => router.push("/nomina/periodos")}
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[period.status] ?? STATUS_CONFIG.draft;
  const employeeCount = new Set(entries.map((e) => e.employee_id)).size;
  const overrides = entries.filter((e) => e.is_manual_override);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            Período {formatDate(period.period_start)} — {formatDate(period.period_end)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detalle completo del período de liquidación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {FREQUENCY_LABELS[period.frequency] ?? period.frequency}
          </Badge>
          <Badge variant="outline" className={statusCfg.className}>
            {statusCfg.label}
          </Badge>
        </div>
      </div>

      {/* 3 tabs */}
      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="empleados">Por empleado</TabsTrigger>
          <TabsTrigger value="ajustes">Ajustes manuales</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          <PeriodSummaryTab
            period={period}
            entries={entries}
            employerCosts={employerCosts}
            errors={errors}
            warnings={warnings}
            employeeCount={employeeCount}
            onChanged={fetchAll}
            userId={profile.id}
          />
        </TabsContent>

        <TabsContent value="empleados" className="mt-6">
          <PeriodEmployeeTab
            period={period}
            employees={employees}
            entries={entries}
            provisions={provisions}
            employerCosts={employerCosts}
            locations={locations}
            onChanged={fetchAll}
          />
        </TabsContent>

        <TabsContent value="ajustes" className="mt-6">
          <PeriodOverridesTab
            period={period}
            overrides={overrides}
            employees={employees}
            onChanged={fetchAll}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
