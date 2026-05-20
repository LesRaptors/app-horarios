-- supabase/migrations/038_demo_requests.sql
-- Tabla para capturar solicitudes de demo desde la landing pública.
-- RLS: anon puede INSERT (form público), solo admin/manager SELECT/UPDATE.

BEGIN;

CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  empresa TEXT NOT NULL CHECK (length(empresa) BETWEEN 2 AND 120),
  telefono TEXT NOT NULL CHECK (length(telefono) BETWEEN 7 AND 30),
  sector TEXT NOT NULL CHECK (sector IN ('salud','retail','hoteleria','vigilancia','otro')),
  mensaje TEXT CHECK (mensaje IS NULL OR length(mensaje) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','contacted','converted','rejected')),
  ip_address INET,
  user_agent TEXT,
  contacted_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_created_at ON demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests (status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON demo_requests (email);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_requests_insert_public ON demo_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY demo_requests_select_admin ON demo_requests
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','manager'));

CREATE POLICY demo_requests_update_admin ON demo_requests
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','manager'))
  WITH CHECK (get_user_role() IN ('admin','manager'));

COMMIT;
