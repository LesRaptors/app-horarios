import type { ShiftTemplate } from "../types";

/**
 * Factory compartida de `ShiftTemplate` para los tests puros.
 * Incluye TODOS los campos por default (incluidos los `holiday_*` en null) para
 * que ningún test tenga que re-listar el shape a mano. Pasa `overrides` para
 * ajustar los campos relevantes a cada caso.
 */
export function makeTemplate(overrides: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id: "tpl-morn",
    name: "Morning",
    start_time: "09:00:00",
    end_time: "17:00:00",
    break_minutes: 0,
    color: "#000",
    location_id: "loc-1",
    is_night: false,
    holiday_start_time: null,
    holiday_end_time: null,
    holiday_break_minutes: null,
    created_at: "",
    ...overrides,
  };
}
