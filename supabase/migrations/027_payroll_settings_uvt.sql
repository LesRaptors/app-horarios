-- Migration 027: Add UVT (Unidad de Valor Tributario) to payroll_settings.
-- UVT 2026 = $52.374 (DIAN Resolución 000238 del 15 de diciembre de 2025).

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS uvt NUMERIC(10,2) NOT NULL DEFAULT 52374;

-- Make sure the seeded rows have the canonical 2026 UVT.
UPDATE payroll_settings SET uvt = 52374 WHERE period_start >= '2026-01-01';
