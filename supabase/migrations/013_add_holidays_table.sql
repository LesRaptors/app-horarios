CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, location_id)
);

CREATE INDEX idx_holidays_date ON holidays(date);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY holidays_read ON holidays FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY holidays_write ON holidays FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (get_user_role() = 'manager' AND location_id = get_user_location_id())
  );

INSERT INTO holidays (date, name, location_id) VALUES
  ('2026-01-01', 'Año Nuevo', NULL),
  ('2026-01-12', 'Día de los Reyes Magos', NULL),
  ('2026-03-23', 'Día de San José', NULL),
  ('2026-04-02', 'Jueves Santo', NULL),
  ('2026-04-03', 'Viernes Santo', NULL),
  ('2026-05-01', 'Día del Trabajo', NULL),
  ('2026-05-18', 'Día de la Ascensión', NULL),
  ('2026-06-08', 'Corpus Christi', NULL),
  ('2026-06-15', 'Sagrado Corazón', NULL),
  ('2026-06-29', 'San Pedro y San Pablo', NULL),
  ('2026-07-20', 'Día de la Independencia', NULL),
  ('2026-08-07', 'Batalla de Boyacá', NULL),
  ('2026-08-17', 'Asunción de la Virgen', NULL),
  ('2026-10-12', 'Día de la Raza', NULL),
  ('2026-11-02', 'Día de Todos los Santos', NULL),
  ('2026-11-16', 'Independencia de Cartagena', NULL),
  ('2026-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2026-12-25', 'Navidad', NULL),
  ('2027-01-01', 'Año Nuevo', NULL),
  ('2027-01-11', 'Día de los Reyes Magos', NULL),
  ('2027-03-22', 'Día de San José', NULL),
  ('2027-03-25', 'Jueves Santo', NULL),
  ('2027-03-26', 'Viernes Santo', NULL),
  ('2027-05-01', 'Día del Trabajo', NULL),
  ('2027-05-10', 'Día de la Ascensión', NULL),
  ('2027-05-31', 'Corpus Christi', NULL),
  ('2027-06-07', 'Sagrado Corazón', NULL),
  ('2027-07-05', 'San Pedro y San Pablo', NULL),
  ('2027-07-20', 'Día de la Independencia', NULL),
  ('2027-08-07', 'Batalla de Boyacá', NULL),
  ('2027-08-16', 'Asunción de la Virgen', NULL),
  ('2027-10-18', 'Día de la Raza', NULL),
  ('2027-11-01', 'Día de Todos los Santos', NULL),
  ('2027-11-15', 'Independencia de Cartagena', NULL),
  ('2027-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2027-12-25', 'Navidad', NULL),
  ('2028-01-01', 'Año Nuevo', NULL),
  ('2028-01-10', 'Día de los Reyes Magos', NULL),
  ('2028-03-20', 'Día de San José', NULL),
  ('2028-04-13', 'Jueves Santo', NULL),
  ('2028-04-14', 'Viernes Santo', NULL),
  ('2028-05-01', 'Día del Trabajo', NULL),
  ('2028-05-29', 'Día de la Ascensión', NULL),
  ('2028-06-19', 'Corpus Christi', NULL),
  ('2028-06-26', 'Sagrado Corazón', NULL),
  ('2028-07-03', 'San Pedro y San Pablo', NULL),
  ('2028-07-20', 'Día de la Independencia', NULL),
  ('2028-08-07', 'Batalla de Boyacá', NULL),
  ('2028-08-21', 'Asunción de la Virgen', NULL),
  ('2028-10-16', 'Día de la Raza', NULL),
  ('2028-11-06', 'Día de Todos los Santos', NULL),
  ('2028-11-13', 'Independencia de Cartagena', NULL),
  ('2028-12-08', 'Día de la Inmaculada Concepción', NULL),
  ('2028-12-25', 'Navidad', NULL);
