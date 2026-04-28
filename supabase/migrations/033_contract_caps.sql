-- Migración 033: caps de horas por tipo de contrato.

ALTER TABLE contract_types
  ADD COLUMN IF NOT EXISTS max_hours_per_day INT,
  ADD COLUMN IF NOT EXISTS max_hours_per_week INT;

COMMENT ON COLUMN contract_types.max_hours_per_day IS
  'Cap inviolable de horas por día. Si null, cae al global de labor_constraints. Útil para diferenciar personal asistencial (12h) vs administrativo (10h).';
COMMENT ON COLUMN contract_types.max_hours_per_week IS
  'Cap duro de horas por semana. Si null, cae a target_hours_per_week o al global. Distinto de target_hours_per_week (que es aspiracional).';
