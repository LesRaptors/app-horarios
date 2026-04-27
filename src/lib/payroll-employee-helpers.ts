import type { PayrollEntry, PayrollProvision, PayrollConceptType } from "./types";

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  category: "origin" | "hub" | "destination";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const CONCEPT_LABELS: Record<PayrollConceptType, string> = {
  salary: "Salario base",
  transport: "Auxilio de transporte",
  surcharge_night: "Recargo nocturno",
  surcharge_sunday: "Recargo dominical",
  surcharge_holiday: "Recargo festivo",
  overtime_day: "Hora extra diurna",
  overtime_night: "Hora extra nocturna",
  bonus_salary: "Bonificacion salarial",
  bonus_non_salary: "Bonificacion no salarial",
  vacation_pay: "Pago de vacaciones",
  prima: "Prima",
  cesantias_interest: "Intereses cesantias",
  health_employee: "EPS Salud 4%",
  pension_employee: "Pension 4%",
  solidarity_pension: "Solidaridad pensional",
  income_tax: "Retencion en la fuente",
  embargo: "Embargo",
  libranza: "Libranza",
  voluntary_pension: "Pension voluntaria",
  afc: "AFC",
  union_fee: "Cuota sindical",
  other_deduction: "Otra deduccion",
};

export function aggregateEntriesForSankey(
  entries: PayrollEntry[],
  netToBank: number
): SankeyData {
  const incomes = entries.filter((e) => e.is_income && e.amount > 0);
  const deductions = entries.filter((e) => !e.is_income && e.amount > 0);

  if (incomes.length === 0 && deductions.length === 0 && netToBank === 0) {
    return { nodes: [], links: [] };
  }

  const totalDevengado = incomes.reduce((acc, e) => acc + Number(e.amount), 0);

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Origins
  for (const e of incomes) {
    nodes.push({
      id: `origin:${e.concept_type}`,
      label: CONCEPT_LABELS[e.concept_type] ?? e.concept_type,
      value: Number(e.amount),
      category: "origin",
    });
    links.push({
      source: `origin:${e.concept_type}`,
      target: "hub",
      value: Number(e.amount),
    });
  }

  // Hub
  if (incomes.length > 0) {
    nodes.push({
      id: "hub",
      label: "Devengado total",
      value: totalDevengado,
      category: "hub",
    });
  }

  // Destinations
  if (netToBank > 0) {
    nodes.push({
      id: "dest:bank",
      label: "Tu cuenta",
      value: netToBank,
      category: "destination",
    });
    links.push({ source: "hub", target: "dest:bank", value: netToBank });
  }
  for (const d of deductions) {
    nodes.push({
      id: `dest:${d.concept_type}`,
      label: CONCEPT_LABELS[d.concept_type] ?? d.concept_type,
      value: Number(d.amount),
      category: "destination",
    });
    links.push({
      source: "hub",
      target: `dest:${d.concept_type}`,
      value: Number(d.amount),
    });
  }

  return { nodes, links };
}

export function computeNetToBank(entries: PayrollEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.is_income) total += Number(e.amount);
    else total -= Number(e.amount);
  }
  return Math.max(0, total);
}

export interface YtdSummary {
  devengado: number;
  deducciones: number;
  neto: number;
  cesantiasYtd: number;
  primaYtd: number;
  vacacionesYtd: number;
  cesantiasInterestYtd: number;
}

export function computeYtdSummary(
  entries: PayrollEntry[],
  provisions: PayrollProvision[],
  year: number
): YtdSummary {
  let devengado = 0;
  let deducciones = 0;
  for (const e of entries) {
    if (e.is_income) devengado += Number(e.amount);
    else deducciones += Number(e.amount);
  }

  const lastByConcept: Record<string, number> = {};
  for (const p of provisions) {
    if (Number(p.accumulated_ytd) >= (lastByConcept[p.concept] ?? 0)) {
      lastByConcept[p.concept] = Number(p.accumulated_ytd);
    }
  }

  return {
    devengado,
    deducciones,
    neto: devengado - deducciones,
    cesantiasYtd: lastByConcept["cesantias"] ?? 0,
    primaYtd: lastByConcept["prima"] ?? 0,
    vacacionesYtd: lastByConcept["vacaciones"] ?? 0,
    cesantiasInterestYtd: lastByConcept["cesantias_interest"] ?? 0,
  };
}
