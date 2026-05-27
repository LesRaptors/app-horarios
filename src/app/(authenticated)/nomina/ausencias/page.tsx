"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { canAdmin } from "@/lib/auth/can-manage";
import type { AbsenceRecord, AbsenceType, AbsencePayer, Location, Profile } from "@/lib/types";

// -------------------------------------------------------------------------------
// Labels
// -------------------------------------------------------------------------------

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  sick_eps: "Incapacidad EPS",
  sick_arl: "Incapacidad ARL",
  maternity: "Maternidad",
  paternity: "Paternidad",
  vacation: "Vacaciones",
  paid_leave: "Permiso remunerado",
  unpaid_leave: "Permiso no remunerado",
  suspension: "Suspensión",
};

const PAYER_LABELS: Record<AbsencePayer, string> = {
  employer: "Empleador",
  eps: "EPS",
  arl: "ARL",
  none: "Ninguno",
};

const PAYER_CLASS: Record<AbsencePayer, string> = {
  employer: "border-blue-400 text-blue-700 dark:text-blue-400",
  eps: "border-green-500 text-green-700 dark:text-green-400",
  arl: "border-amber-400 text-amber-700 dark:text-amber-400",
  none: "border-muted text-muted-foreground",
};

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function getYearFromAbsence(a: AbsenceRecord): number {
  return parseInt(a.start_date.split("-")[0], 10);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

// -------------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------------

interface AbsenceRowData extends AbsenceRecord {
  employee?: Profile;
  locationName?: string;
}

// -------------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------------

export default function AusenciasPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [absences, setAbsences] = useState<AbsenceRowData[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [appFlags, setAppFlags] = useState<{ managers_can_see_salaries: boolean }>({
    managers_can_see_salaries: false,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(String(CURRENT_YEAR));
  const [employeeSearch, setEmployeeSearch] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [
      { data: absencesData },
      { data: profilesData },
      { data: locationsData },
      { data: flagsData },
    ] = await Promise.all([
      supabase
        .from("absence_records")
        .select("*")
        .order("start_date", { ascending: false }),
      supabase.from("profiles").select("*").neq("role", "super_admin"),
      supabase.from("locations").select("*").order("name"),
      supabase.from("app_settings").select("value").eq("key", "app_flags").maybeSingle(),
    ]);

    const profileMap = new Map<string, Profile>(
      (profilesData ?? []).map((p: Profile) => [p.id, p])
    );
    const locationMap = new Map<string, Location>(
      (locationsData ?? []).map((l: Location) => [l.id, l])
    );

    const enriched: AbsenceRowData[] = (absencesData ?? []).map((a: AbsenceRecord) => {
      const emp = profileMap.get(a.employee_id);
      const locId = emp?.location_id;
      return {
        ...a,
        employee: emp,
        locationName: locId ? (locationMap.get(locId)?.name ?? "—") : "—",
      };
    });

    setAbsences(enriched);
    setLocations(locationsData ?? []);

    if (flagsData?.value) {
      setAppFlags({
        managers_can_see_salaries: flagsData.value.managers_can_see_salaries === true,
      });
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (authLoading || !profile) return;
    const isAdmin = canAdmin(profile.role);
    const isManagerWithAccess =
      profile.role === "manager" && appFlags.managers_can_see_salaries;
    if (!isAdmin && !isManagerWithAccess) {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router, appFlags]);

  const filteredAbsences = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return absences.filter((a) => {
      const typeMatch = typeFilter === "all" || a.type === typeFilter;
      const locationMatch =
        locationFilter === "all" ||
        a.employee?.location_id === locationFilter;
      const yearMatch =
        yearFilter === "all" || getYearFromAbsence(a) === parseInt(yearFilter, 10);
      const nameMatch =
        q === "" ||
        `${a.employee?.first_name ?? ""} ${a.employee?.last_name ?? ""}`.toLowerCase().includes(q);
      return typeMatch && locationMatch && yearMatch && nameMatch;
    });
  }, [absences, typeFilter, locationFilter, yearFilter, employeeSearch]);

  // Access guard render
  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = canAdmin(profile.role);
  const isManagerWithAccess = profile.role === "manager" && appFlags.managers_can_see_salaries;
  if (!isAdmin && !isManagerWithAccess) return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Ausencias e incapacidades</h1>
        <p className="text-muted-foreground">
          Vista consolidada de todas las ausencias registradas. Para registrar o editar, usa el panel del empleado.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Employee search */}
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(Object.entries(ABSENCE_TYPE_LABELS) as [AbsenceType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los años</SelectItem>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAbsences.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No hay ausencias para los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                )}
                {filteredAbsences.map((a) => {
                  const dias = daysBetween(a.start_date, a.end_date);
                  const payer = a.payer as AbsencePayer;
                  const isAuto = !!a.source_request_id;

                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.employee
                          ? `${a.employee.first_name} ${a.employee.last_name}`
                          : a.employee_id.slice(0, 8)}
                        {a.employee?.is_demo && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-xs font-normal text-yellow-600 border-yellow-400"
                          >
                            Demo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.locationName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(a.start_date)}
                        {a.start_date !== a.end_date && (
                          <> — {formatDate(a.end_date)}</>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {ABSENCE_TYPE_LABELS[a.type as AbsenceType] ?? a.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{dias}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={PAYER_CLASS[payer] ?? ""}
                        >
                          {PAYER_LABELS[payer] ?? payer}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isAuto ? (
                          <Badge variant="secondary" className="text-xs">
                            Auto desde solicitud
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Manual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push("/employees")}
                          title="Ver en empleado"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span className="sr-only">Ver en empleado</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
