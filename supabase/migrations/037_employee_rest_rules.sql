-- Migración 037: reglas de descanso a nivel empleado.
-- Override semántico: si el empleado tiene 1+ reglas individuales, se usan
-- en lugar de las del contract_type. Si no tiene, fallback a contract_rest_rules.

CREATE TABLE employee_rest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

CREATE INDEX idx_employee_rest_rules_employee ON employee_rest_rules(employee_id);

ALTER TABLE employee_rest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_rest_rules_select" ON employee_rest_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "employee_rest_rules_admin_write" ON employee_rest_rules
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'manager'))
  WITH CHECK (get_user_role() IN ('admin', 'manager'));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON employee_rest_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
