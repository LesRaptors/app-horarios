-- Add is_demo flag to profiles for placeholder employees
ALTER TABLE profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

-- Partial index for quick demo lookups
CREATE INDEX idx_profiles_is_demo ON profiles (is_demo) WHERE is_demo = true;
