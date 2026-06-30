import type {
  Profile, ScheduleEntry, StaffingRequirement, LaborConstraints, RestRule, ContractType, ShiftTemplate, EmployeeRestRule, HolidayDate,
} from "./types";
import { isRestDay } from "./rest-rules";
import { isHoliday } from "./equity-helpers";

export interface SaturatedEmployee {
  employeeId: string;
  name: string;
  weekHoursPct: number;
  consecutiveDays: number;
  flags: ("near_weekly_cap" | "near_consecutive_cap" | "exceeded")[];
  restDays?: string[]; // fechas YYYY-MM-DD bloqueadas por regla este mes
}

export interface HealthGap {
  date: string;
  positionId: string;
  shiftTemplateId: string;
}

export interface HealthSummary {
  totalRequired: number;
  totalAssigned: number;
  totalAssignedNoExtras: number;
  totalPendingExtras: number;
  totalGaps: number;
  saturatedEmployees: SaturatedEmployee[];
  gapsByDay: HealthGap[];
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

function isoWeekKey(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() * 100 + weekNum;
}

function hoursDuration(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}

export function computeHealth(
  entries: ScheduleEntry[],
  employees: Profile[],
  staffing: StaffingRequirement[],
  constraints: LaborConstraints,
  locationId: string,
  year: number,
  month: number,
  restRules: RestRule[] = [],
  contractTypes: ContractType[] = [],
  employeeRestRules: EmployeeRestRule[] = [],
  holidays: HolidayDate[] = [],
): HealthSummary {
  // Filtrar entries que cuentan: no rejected
  const counted = entries.filter((e) => e.overtime_status !== "rejected");

  // Posiciones con perfil de festivo (≥1 fila is_holiday=true) para esta sede.
  // En un festivo, estas posiciones REEMPLAZAN su demanda con SOLO el perfil de festivo.
  const holidayPositions = new Set(
    staffing.filter((s) => s.location_id === locationId && s.is_holiday).map((s) => s.position_id),
  );

  // Total required del mes: sumar staffing × ocurrencias del day_of_week en el mes
  const days = getDaysInMonth(year, month);
  let totalRequired = 0;
  for (const day of days) {
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    const isHol = isHoliday(day, locationId, holidays);
    for (const sr of staffing) {
      if (sr.location_id !== locationId) continue;
      const usesHolidayProfile = isHol && holidayPositions.has(sr.position_id);
      const applies = usesHolidayProfile ? sr.is_holiday : (!sr.is_holiday && sr.day_of_week === dow);
      if (!applies) continue;
      totalRequired += sr.required_count;
    }
  }

  const totalAssigned = counted.length;
  const totalPendingExtras = counted.filter((e) => e.overtime_status === "pending").length;
  const totalAssignedNoExtras = totalAssigned - totalPendingExtras;
  const totalGaps = Math.max(0, totalRequired - totalAssigned);

  // Gaps: por (day, position, shift) — slots en staffing que no fueron cubiertos
  const gapsByDay: HealthGap[] = [];
  for (const day of days) {
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    const isHol = isHoliday(day, locationId, holidays);
    for (const sr of staffing) {
      if (sr.location_id !== locationId) continue;
      const usesHolidayProfile = isHol && holidayPositions.has(sr.position_id);
      const applies = usesHolidayProfile ? sr.is_holiday : (!sr.is_holiday && sr.day_of_week === dow);
      if (!applies) continue;
      // Acreditar por turno: una entry cubre un slot solo si su shift_template_id coincide.
      // En un festivo con perfil, el motor (auto-incluir) genera entries con el turno del
      // perfil festivo; un horario viejo con turnos de día de semana NO cumple el perfil
      // nuevo, así que su gap es real (debe regenerarse) — no se enmascara.
      const assignedHere = counted.filter(
        (e) => e.date === day && e.position_id === sr.position_id
          && e.shift_template_id === sr.shift_template_id,
      ).length;
      for (let i = assignedHere; i < sr.required_count; i++) {
        gapsByDay.push({ date: day, positionId: sr.position_id, shiftTemplateId: sr.shift_template_id });
      }
    }
  }

  // Saturación por empleado
  const byEmp = new Map<string, ScheduleEntry[]>();
  for (const e of counted) {
    const arr = byEmp.get(e.employee_id) ?? [];
    arr.push(e);
    byEmp.set(e.employee_id, arr);
  }

  const saturated: SaturatedEmployee[] = [];
  for (const emp of employees) {
    const empEntries = (byEmp.get(emp.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (empEntries.length === 0) continue;

    const effectiveWeekly = Math.min(
      constraints.maxHoursPerWeek,
      emp.max_hours_per_week,
    );

    // Max horas por semana ISO del mes
    let maxWeekPct = 0;
    const weekHours = new Map<number, number>();
    for (const e of empEntries) {
      const wk = isoWeekKey(e.date);
      const dur = hoursDuration(e.start_time, e.end_time);
      weekHours.set(wk, (weekHours.get(wk) ?? 0) + dur);
    }
    for (const h of Array.from(weekHours.values())) {
      const pct = effectiveWeekly > 0 ? h / effectiveWeekly : 0;
      if (pct > maxWeekPct) maxWeekPct = pct;
    }

    // Max días consecutivos (sin gap)
    let maxConsecutive = 0;
    let run = 0;
    let lastDate: string | null = null;
    for (const e of empEntries) {
      if (lastDate === null) {
        run = 1;
      } else {
        const expectedNext = (() => {
          const d = new Date(lastDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        run = e.date === expectedNext ? run + 1 : 1;
      }
      if (run > maxConsecutive) maxConsecutive = run;
      lastDate = e.date;
    }

    const flags: SaturatedEmployee["flags"] = [];
    if (maxWeekPct >= 0.85) flags.push("near_weekly_cap");
    if (maxConsecutive >= constraints.maxConsecutiveDays) flags.push("near_consecutive_cap");
    if (maxWeekPct > 1 || maxConsecutive > constraints.maxConsecutiveDays) flags.push("exceeded");

    if (flags.length > 0) {
      saturated.push({
        employeeId: emp.id,
        name: `${emp.first_name} ${emp.last_name}`,
        weekHoursPct: maxWeekPct,
        consecutiveDays: maxConsecutive,
        flags,
      });
    }
  }

  // Calcular restDays para cada empleado saturado (días bloqueados por regla de descanso).
  // Override semántica: si el empleado tiene reglas individuales se usan esas;
  // si no, fallback a las reglas del contract_type.
  if (restRules.length > 0 || employeeRestRules.length > 0) {
    // Agrupar reglas por contract_type_id
    const rulesByContract = new Map<string, RestRule[]>();
    for (const rule of restRules) {
      const arr = rulesByContract.get(rule.contract_type_id) ?? [];
      arr.push(rule);
      rulesByContract.set(rule.contract_type_id, arr);
    }

    // Agrupar reglas por employee_id
    const rulesByEmployee = new Map<string, EmployeeRestRule[]>();
    for (const rule of employeeRestRules) {
      const arr = rulesByEmployee.get(rule.employee_id) ?? [];
      arr.push(rule);
      rulesByEmployee.set(rule.employee_id, arr);
    }

    // Map de contract_type_id para lookup rápido
    const contractById = new Map<string, ContractType>();
    for (const ct of contractTypes) {
      contractById.set(ct.id, ct);
    }

    // Template dummy necesario para isRestDay (solo is_night importa; usar false como fallback)
    const dummyTemplate: ShiftTemplate = {
      id: "preview",
      name: "preview",
      start_time: "09:00",
      end_time: "17:00",
      color: "#000",
      location_id: locationId,
      is_night: false,
      break_minutes: 0,
      created_at: "",
    };

    // Map de entradas por empleado (todas las entradas, no solo counted)
    const allByEmp = new Map<string, ScheduleEntry[]>();
    for (const e of entries) {
      const arr = allByEmp.get(e.employee_id) ?? [];
      arr.push(e);
      allByEmp.set(e.employee_id, arr);
    }

    for (const sat of saturated) {
      const emp = employees.find((e) => e.id === sat.employeeId);
      if (!emp) continue;

      const empRules = rulesByEmployee.get(sat.employeeId) ?? [];
      const contractRules = emp.contract_type_id
        ? rulesByContract.get(emp.contract_type_id) ?? []
        : [];
      const effectiveRules: RestRule[] = empRules.length > 0
        ? empRules.map((r) => ({
            id: r.id, contract_type_id: "", rule_type: r.rule_type, params: r.params,
            created_at: r.created_at, updated_at: r.updated_at,
          }))
        : contractRules;

      if (effectiveRules.length === 0) continue;

      const empEntries = allByEmp.get(sat.employeeId) ?? [];
      const restDaysList: string[] = [];

      for (const day of days) {
        const blocked = effectiveRules.some((rule) =>
          isRestDay(rule, day, dummyTemplate, empEntries, (d) => isHoliday(d, locationId, holidays)),
        );
        if (blocked) restDaysList.push(day);
      }

      if (restDaysList.length > 0) {
        sat.restDays = restDaysList;
      }
    }
  }

  return {
    totalRequired,
    totalAssigned,
    totalAssignedNoExtras,
    totalPendingExtras,
    totalGaps,
    saturatedEmployees: saturated,
    gapsByDay,
  };
}
