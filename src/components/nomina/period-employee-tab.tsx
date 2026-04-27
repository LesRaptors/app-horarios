"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
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
import { toast } from "sonner";
import { formatCOP } from "@/lib/payroll-helpers";
import { assemblePayrollPeriod } from "@/lib/payroll-period-builder";
import type {
  PayrollPeriod,
  PayrollEntry,
  PayrollProvision,
  PayrollEmployerCost,
  Profile,
  Location,
} from "@/lib/types";

interface EmployeeRow {
  employee: Profile;
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCost: PayrollEmployerCost | null;
}

interface Props {
  period: PayrollPeriod;
  employees: Profile[];
  entries: PayrollEntry[];
  provisions: PayrollProvision[];
  employerCosts: PayrollEmployerCost[];
  locations: Location[];
  onChanged: () => void;
}

const CONCEPT_LABELS: Record<string, string> = {
  salary: "Salario base",
  transport: "Auxilio de transporte",
  surcharge_night: "Recargo nocturno",
  surcharge_sunday: "Recargo dominical",
  surcharge_holiday: "Recargo festivo",
  overtime_day: "Hora extra diurna",
  overtime_night: "Hora extra nocturna",
  bonus_salary: "Bonificación salarial",
  bonus_non_salary: "Bonificación no salarial",
  vacation_pay: "Pago vacaciones",
  prima: "Prima de servicios",
  cesantias_interest: "Intereses cesantías",
  health_employee: "Salud empleado (4%)",
  pension_employee: "Pensión empleado (4%)",
  solidarity_pension: "Fondo solidaridad",
  income_tax: "Retención en la fuente",
  embargo: "Embargo judicial",
  libranza: "Libranza / préstamo",
  voluntary_pension: "Pensión voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deducción",
};

const PROVISION_LABELS: Record<string, string> = {
  cesantias: "Cesantías",
  cesantias_interest: "Intereses cesantías",
  prima: "Prima de servicios",
  vacaciones: "Vacaciones",
};

export function PeriodEmployeeTab({
  period,
  employees,
  entries,
  provisions,
  employerCosts,
  locations,
  onChanged,
}: Props) {
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recalcLoading, setRecalcLoading] = useState<string | null>(null);

  // Build per-employee rows
  const rows: EmployeeRow[] = useMemo(
    () =>
      employees.map((emp) => ({
        employee: emp,
        entries: entries.filter((e) => e.employee_id === emp.id),
        provisions: provisions.filter((p) => p.employee_id === emp.id),
        employerCost: employerCosts.find((c) => c.employee_id === emp.id) ?? null,
      })),
    [employees, entries, provisions, employerCosts]
  );

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const name = `${r.employee.first_name} ${r.employee.last_name}`.toLowerCase();
      const matchesSearch = q === "" || name.includes(q);
      const matchesLocation =
        locationFilter === "all" || r.employee.location_id === locationFilter;
      return matchesSearch && matchesLocation;
    });
  }, [rows, search, locationFilter]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleRecalcEmployee(employeeId: string) {
    setRecalcLoading(employeeId);
    try {
      const result = await assemblePayrollPeriod(
        period.id,
        period.period_start,
        period.period_end,
        period.frequency,
        [employeeId],
        true
      );
      toast.success(
        result.errors.length > 0
          ? "Recalculado con errores — revisa el resumen."
          : "Empleado recalculado correctamente."
      );
      onChanged();
    } catch (err) {
      toast.error("Error al recalcular este empleado.");
      console.error(err);
    } finally {
      setRecalcLoading(null);
    }
  }

  function empDevengado(row: EmployeeRow) {
    return row.entries.filter((e) => e.is_income).reduce((s, e) => s + e.amount, 0);
  }
  function empDeducciones(row: EmployeeRow) {
    return row.entries.filter((e) => !e.is_income).reduce((s, e) => s + e.amount, 0);
  }

  const isDraft = period.status === "draft";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las sedes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Empleado</TableHead>
                <TableHead className="text-right">Devengado</TableHead>
                <TableHead className="text-right">Deducciones</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                {isDraft && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isDraft ? 6 : 5} className="text-center text-muted-foreground py-8">
                    Sin empleados para mostrar
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => {
                const isExpanded = expanded.has(row.employee.id);
                const dev = empDevengado(row);
                const ded = empDeducciones(row);
                const net = dev - ded;

                return (
                  <>
                    <TableRow
                      key={row.employee.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpanded(row.employee.id)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.employee.first_name} {row.employee.last_name}
                        {row.employee.is_demo && (
                          <Badge variant="outline" className="ml-2 text-xs font-normal text-yellow-600 border-yellow-400">
                            Demo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCOP(dev)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">
                        -{formatCOP(ded)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCOP(net)}</TableCell>
                      {isDraft && (
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={recalcLoading === row.employee.id}
                            onClick={() => handleRecalcEmployee(row.employee.id)}
                          >
                            {recalcLoading === row.employee.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Recalcular"
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <TableRow key={`${row.employee.id}-detail`}>
                        <TableCell colSpan={isDraft ? 6 : 5} className="bg-muted/20 px-8 py-4">
                          <EmployeeDetail row={row} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeDetail({ row }: { row: EmployeeRow }) {
  const incomeEntries = row.entries.filter((e) => e.is_income);
  const deductionEntries = row.entries.filter((e) => !e.is_income);
  const ec = row.employerCost;

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {/* Devengados */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Devengados
        </p>
        <table className="w-full text-sm">
          <tbody>
            {incomeEntries.map((e) => (
              <tr key={e.id}>
                <td className="py-0.5 pr-2 text-muted-foreground">
                  {CONCEPT_LABELS[e.concept_type] ?? e.concept_type}
                  {e.is_manual_override && (
                    <Badge variant="outline" className="ml-1 text-[10px]">manual</Badge>
                  )}
                </td>
                <td className="py-0.5 text-right font-medium">{formatCOP(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deducciones */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deducciones
        </p>
        <table className="w-full text-sm">
          <tbody>
            {deductionEntries.map((e) => (
              <tr key={e.id}>
                <td className="py-0.5 pr-2 text-muted-foreground">
                  {CONCEPT_LABELS[e.concept_type] ?? e.concept_type}
                  {e.is_manual_override && (
                    <Badge variant="outline" className="ml-1 text-[10px]">manual</Badge>
                  )}
                </td>
                <td className="py-0.5 text-right font-medium text-red-600 dark:text-red-400">
                  -{formatCOP(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Provisiones */}
      {row.provisions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Provisiones
          </p>
          <table className="w-full text-sm">
            <tbody>
              {row.provisions.map((p) => (
                <tr key={p.id}>
                  <td className="py-0.5 pr-2 text-muted-foreground">
                    {PROVISION_LABELS[p.concept] ?? p.concept}
                  </td>
                  <td className="py-0.5 text-right font-medium">{formatCOP(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Costo empleador */}
      {ec && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Costo empleador
          </p>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Salud empleador (8.5%)", ec.health_employer],
                ["Pensión empleador (12%)", ec.pension_employer],
                ["ARL", ec.arl_employer],
                ["Caja compensación (4%)", ec.parafiscales_caja],
                ["SENA (2%)", ec.parafiscales_sena],
                ["ICBF (3%)", ec.parafiscales_icbf],
              ].map(([label, val]) =>
                (val as number) > 0 ? (
                  <tr key={label as string}>
                    <td className="py-0.5 pr-2 text-muted-foreground">{label}</td>
                    <td className="py-0.5 text-right font-medium">{formatCOP(val as number)}</td>
                  </tr>
                ) : null
              )}
              <tr className="border-t">
                <td className="py-0.5 pr-2 font-semibold">Total</td>
                <td className="py-0.5 text-right font-semibold">{formatCOP(ec.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
