-- Migración 036: reglas de descanso parametrizables por contract_type.

CREATE TABLE contract_rest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type_id UUID NOT NULL REFERENCES contract_types(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'work_cycle',
    'weekend_rotation',
    'post_night_rest',
    'max_consecutive_nights',
    'compensatory_day'
  )),
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_rest_rules_contract ON contract_rest_rules(contract_type_id);

ALTER TABLE contract_rest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_rules_select" ON contract_rest_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rest_rules_admin_write" ON contract_rest_rules
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager'))
  WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contract_rest_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
