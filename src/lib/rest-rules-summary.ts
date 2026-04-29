import type {
  RestRule,
  WorkCycleParams,
  MaxConsecutiveNightsParams,
} from "@/lib/types";

/**
 * Convierte un arreglo de RestRule a un texto resumen corto para UI.
 * Usado en tablas y badges.
 */
export function summarizeRules(rules: RestRule[]): string {
  if (rules.length === 0) return "Sin reglas";
  if (rules.length > 1) return `${rules.length} reglas activas`;

  const r = rules[0];
  switch (r.rule_type) {
    case "work_cycle": {
      const p = r.params as WorkCycleParams;
      return `Ciclo ${p.work_days}×${p.rest_days}`;
    }
    case "weekend_rotation":
      return "Findes alt.";
    case "post_night_rest":
      return "Post-noches";
    case "max_consecutive_nights": {
      const p = r.params as MaxConsecutiveNightsParams;
      return `Max ${p.max} noches`;
    }
    case "compensatory_day":
      return "Compensatorio";
    default:
      return "—";
  }
}
