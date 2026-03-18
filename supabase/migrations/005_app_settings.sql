-- App Settings table (key-value with JSONB)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: everyone can read, only admin can write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read settings"
  ON app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON app_settings FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Seed default labor constraints
INSERT INTO app_settings (key, value) VALUES (
  'labor_constraints',
  '{"maxHoursPerWeek": 40, "maxHoursPerDay": 10, "minRestHoursBetweenShifts": 12, "maxConsecutiveDays": 6}'::jsonb
) ON CONFLICT (key) DO NOTHING;
