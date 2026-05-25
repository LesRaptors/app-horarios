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
