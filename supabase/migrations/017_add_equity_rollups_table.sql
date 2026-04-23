CREATE TABLE employee_equity_rollups (
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  sundays_worked   INT NOT NULL DEFAULT 0,
  saturdays_worked INT NOT NULL DEFAULT 0,
  nights_worked    INT NOT NULL DEFAULT 0,
  holidays_worked  INT NOT NULL DEFAULT 0,
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, year, month)
);

CREATE INDEX idx_rollups_employee_ym
  ON employee_equity_rollups(employee_id, year, month DESC);

ALTER TABLE employee_equity_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY rollups_read ON employee_equity_rollups FOR SELECT USING (
  get_user_role() = 'admin'
  OR (
    get_user_role() = 'manager'
    AND employee_id IN (SELECT id FROM profiles WHERE location_id = get_user_location_id())
  )
  OR employee_id = auth.uid()
);
