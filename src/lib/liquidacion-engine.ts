import type {
  LiquidacionInput,
  LiquidacionOutput,
  ComputedLiquidacionItem,
} from "./types";

const INTEREST_RATE = 0.12; // intereses sobre cesantías = 12% anual

/**
 * Días entre dos fechas bajo la convención comercial de 360 días
 * (año = 360, mes = 30). Estándar 30/360 con tope de 30 en cada día.
 */
export function days360(from: string, to: string): number {
  const [y1, m1, d1raw] = from.split("-").map(Number);
  const [y2, m2, d2raw] = to.split("-").map(Number);
  const d1 = Math.min(d1raw, 30);
  const d2 = Math.min(d2raw, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

/**
 * Propone días de vacaciones pendientes: 15 días hábiles por año,
 * proporcional al tiempo desde el último disfrute. Editable por el admin.
 */
export function suggestVacationDays(cutoff: string, termination: string): number {
  const days = days360(cutoff, termination);
  return Math.round(((days * 15) / 360) * 100) / 100;
}

function round(n: number): number {
  return Math.round(n);
}

/** Inicio del semestre (ene-jun → 1-ene; jul-dic → 1-jul) que contiene `date`. */
function semesterStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return m <= 6 ? `${y}-01-01` : `${y}-07-01`;
}

export function computeLiquidacion(input: LiquidacionInput): LiquidacionOutput {
  const items: ComputedLiquidacionItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const smmlv = input.settings.smmlv;
  const aux = input.settings.aux_transport;

  const getsAux = input.base_salary <= 2 * smmlv;
  const baseConAux = input.base_salary + (getsAux ? aux : 0);
  const baseSinAux = input.base_salary;

  // 1. Cesantías (base CON auxilio). Salario integral no genera cesantías.
  if (!input.is_integral_salary) {
    const diasCes = days360(input.cesantias_cutoff, input.termination_date);
    const cesantias = round((baseConAux * diasCes) / 360);
    items.push({
      concept: "cesantias",
      base: baseConAux,
      days: diasCes,
      amount: cesantias,
      description: `Cesantías ${diasCes} días sobre base con auxilio`,
    });

    // 2. Intereses sobre cesantías = cesantías × díasCes × 0.12 / 360
    const intereses = round((cesantias * diasCes * INTEREST_RATE) / 360);
    items.push({
      concept: "cesantias_interest",
      base: cesantias,
      days: diasCes,
      amount: intereses,
      description: `Intereses sobre cesantías (12% anual)`,
    });

    // 3. Prima del semestre (base CON auxilio)
    const semStart = semesterStart(input.termination_date);
    const primaFrom = semStart > input.hire_date ? semStart : input.hire_date;
    const diasPrima = days360(primaFrom, input.termination_date);
    const prima = round((baseConAux * diasPrima) / 360);
    items.push({
      concept: "prima",
      base: baseConAux,
      days: diasPrima,
      amount: prima,
      description: `Prima proporcional ${diasPrima} días`,
    });
  }

  // 4. Vacaciones (base SIN auxilio) = (baseSinAux/30) × díasPendientes
  const vacaciones = round((baseSinAux / 30) * input.vacation_days_pending);
  items.push({
    concept: "vacaciones",
    base: baseSinAux,
    days: Math.round(input.vacation_days_pending),
    amount: vacaciones,
    description: `Vacaciones ${input.vacation_days_pending} días pendientes`,
  });

  const total = items.reduce((acc, i) => acc + i.amount, 0);
  return { items, total, errors, warnings };
}
