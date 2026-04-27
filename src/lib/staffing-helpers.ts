export interface StaffingCell {
  position_id: string;
  shift_template_id: string;
  day_of_week: number;
  required_count: number;
}

export type CellKey = string;  // "positionId|shiftTemplateId|dayOfWeek"

export function makeCellKey(
  positionId: string,
  shiftTemplateId: string,
  dayOfWeek: number
): CellKey {
  return `${positionId}|${shiftTemplateId}|${dayOfWeek}`;
}

export function parseCellKey(key: CellKey): {
  position_id: string;
  shift_template_id: string;
  day_of_week: number;
} {
  const [position_id, shift_template_id, dayStr] = key.split("|");
  return {
    position_id,
    shift_template_id,
    day_of_week: Number(dayStr),
  };
}

export interface DiffResult {
  inserts: StaffingCell[];
  updates: StaffingCell[];
  deletes: StaffingCell[];
}

export function diffStaffing(
  persisted: Record<CellKey, number>,
  desired: Record<CellKey, number>
): DiffResult {
  const inserts: StaffingCell[] = [];
  const updates: StaffingCell[] = [];
  const deletes: StaffingCell[] = [];

  // Insert / update / sin-cambio: iterar sobre desired.
  for (const [key, value] of Object.entries(desired)) {
    if (value <= 0) continue;  // 0 no se inserta — se trata como delete abajo si existe
    const prev = persisted[key];
    const cell = { ...parseCellKey(key), required_count: value };
    if (prev === undefined) {
      inserts.push(cell);
    } else if (prev !== value) {
      updates.push(cell);
    }
  }

  // Delete: iterar sobre persisted que no estan en desired o estan con value <= 0.
  for (const [key, prev] of Object.entries(persisted)) {
    const desiredValue = desired[key];
    if (desiredValue === undefined || desiredValue <= 0) {
      deletes.push({ ...parseCellKey(key), required_count: prev });
    }
  }

  return { inserts, updates, deletes };
}

export function replicateAcrossDays(
  draft: Record<CellKey, number>,
  sourceDay: number,
  targetDays: number[],
  scope: { positionIds: string[]; shiftTemplateIds: string[] }
): Record<CellKey, number> {
  const out: Record<CellKey, number> = { ...draft };
  for (const positionId of scope.positionIds) {
    for (const shiftTemplateId of scope.shiftTemplateIds) {
      const sourceKey = makeCellKey(positionId, shiftTemplateId, sourceDay);
      const sourceValue = draft[sourceKey];
      if (sourceValue === undefined) continue;
      for (const targetDay of targetDays) {
        out[makeCellKey(positionId, shiftTemplateId, targetDay)] = sourceValue;
      }
    }
  }
  return out;
}

export function replicateShiftToShift(
  draft: Record<CellKey, number>,
  sourceShiftId: string,
  targetShiftId: string,
  scope: { positionIds: string[] }
): Record<CellKey, number> {
  const out: Record<CellKey, number> = { ...draft };
  for (const [key, value] of Object.entries(draft)) {
    const parsed = parseCellKey(key);
    if (parsed.shift_template_id !== sourceShiftId) continue;
    if (!scope.positionIds.includes(parsed.position_id)) continue;
    out[makeCellKey(parsed.position_id, targetShiftId, parsed.day_of_week)] = value;
  }
  return out;
}
