-- Migration 028: Add hire/termination/ARL columns to profiles.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hire_date DATE NULL,
  ADD COLUMN IF NOT EXISTS termination_date DATE NULL,
  ADD COLUMN IF NOT EXISTS is_terminated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arl_risk_class SMALLINT NULL
    CHECK (arl_risk_class IS NULL OR arl_risk_class BETWEEN 1 AND 5);
