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
  // Variante simplificada (clamp ambos a 30), no la regla US/NASD de fin de mes.
  // En esta app los cortes suelen caer en día 1, donde ambas coinciden.
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

  // ── Validaciones que bloquean la aprobación ──────────────────
  if (input.base_salary <= 0) {
    errors.push("Empleado sin salario vigente: no se puede calcular la liquidación.");
  }
  if (input.termination_date < input.hire_date) {
    errors.push("La fecha de terminación es anterior a la fecha de ingreso.");
  }
  if (input.cesantias_cutoff > input.termination_date) {
    errors.push("El corte de cesantías es posterior a la fecha de terminación.");
  }
  if (input.vacations_cutoff > input.termination_date) {
    errors.push("El corte de vacaciones es posterior a la fecha de terminación.");
  }
  if (input.vacation_days_pending < 0) {
    errors.push("Los días de vacaciones pendientes no pueden ser negativos.");
  }
  const needsEndDate =
    input.contract_kind === "fijo" ||
    input.contract_kind === "obra_labor" ||
    input.reason === "fin_contrato";
  if (needsEndDate && !input.contract_end_date) {
    errors.push(
      "Falta la fecha de finalización del contrato (requerida para contrato fijo/obra o motivo fin de contrato)."
    );
  }
  if (
    input.contract_kind === "fijo" &&
    input.contract_end_date &&
    input.contract_end_date < input.termination_date
  ) {
    errors.push(
      "La fecha de finalización del contrato es anterior a la fecha de terminación."
    );
  }
  if (errors.length > 0) {
    return { items: [], total: 0, errors, warnings };
  }

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

  // 5. Indemnización por despido sin justa causa (Art. 64 CST)
  const diaIndem = baseSinAux / 30;
  if (input.reason === "sin_justa_causa") {
    let diasIndem = 0;
    if (input.contract_kind === "fijo") {
      const diasRestantes = input.contract_end_date
        ? days360(input.termination_date, input.contract_end_date)
        : 0;
      diasIndem = diasRestantes; // valor = baseSinAux × días/30 = diaIndem × días
    } else if (input.contract_kind === "obra_labor") {
      diasIndem = 15; // V1: mínimo legal; no se estima duración de la obra
      warnings.push(
        "Contrato de obra/labor: se aplicó el mínimo de 15 días. Verifique el tiempo restante estimado de la obra y ajuste con override manual si corresponde."
      );
    } else {
      // indefinido
      const aniosServicio = days360(input.hire_date, input.termination_date) / 360;
      const altaRenta = baseSinAux >= 10 * smmlv;
      const baseDias = altaRenta ? 20 : 30;
      const adicional = altaRenta ? 15 : 20;
      diasIndem =
        aniosServicio <= 1 ? baseDias : baseDias + adicional * (aniosServicio - 1);
    }
    items.push({
      concept: "indemnizacion",
      base: baseSinAux,
      days: Math.round(diasIndem),
      amount: round(diaIndem * diasIndem),
      description: `Indemnización (${input.contract_kind}, sin justa causa)`,
    });
  } else {
    warnings.push(
      `No se calcula indemnización: el motivo de terminación es "${input.reason}" (la indemnización del Art. 64 solo aplica a despido sin justa causa).`
    );
  }

  if (input.is_integral_salary) {
    warnings.push(
      "Salario integral: no genera cesantías ni prima (van incluidas en el salario)."
    );
  }
  warnings.push(
    "Recordatorio: descuente las cesantías ya consignadas al fondo. Si el corte de cesantías está bien definido, el cálculo ya refleja solo lo pendiente."
  );
  warnings.push(
    "Recordatorio: si el pago de la liquidación se demora, puede causarse indemnización moratoria (Art. 65 CST). Este motor no la calcula."
  );

  const total = items.reduce((acc, i) => acc + i.amount, 0);
  return { items, total, errors, warnings };
}
