-- Migración 051 — Persistir errores/advertencias del motor en payroll_periods
--
-- El motor (computePayroll) devuelve errors[] y warnings[] por empleado (ej. "sin
-- salario vigente"), pero solo se mostraban en un toast efímero al generar. Al
-- recargar el detalle, el tab Resumen los perdía y mostraba "Sin errores" aunque
-- hubiera empleados que fallaron. Se persisten en columnas jsonb para que el panel
-- los muestre siempre.

BEGIN;

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS compute_errors   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compute_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
