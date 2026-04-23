CREATE TABLE contract_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  max_sundays_per_quarter  INT NOT NULL DEFAULT 6,
  max_holidays_per_quarter INT NOT NULL DEFAULT 3,
  target_saturdays_per_month INT,
  target_nights_per_month    INT,
  target_hours_per_week      INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contract_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ct_read  ON contract_types FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY ct_write ON contract_types FOR ALL    USING (get_user_role() = 'admin');

INSERT INTO contract_types (id, name, description, max_sundays_per_quarter, max_holidays_per_quarter) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Sin definir',
   'Tipo por defecto. Sin hard caps efectivos. El admin debe asignar un tipo real.',
   999, 999);

INSERT INTO contract_types (name, max_sundays_per_quarter, max_holidays_per_quarter,
                             target_saturdays_per_month, target_nights_per_month, target_hours_per_week) VALUES
  ('Full-time',      6,  3, 2, 4, 40),
  ('Part-time',      3,  1, 1, 2, 24),
  ('Fin de semana', 13,  3, 4, 0, 24);

CREATE TRIGGER trg_contract_types_updated_at
  BEFORE UPDATE ON contract_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
