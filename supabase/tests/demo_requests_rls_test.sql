-- supabase/tests/demo_requests_rls_test.sql
-- Verifica RLS:
--   1) anon puede INSERT
--   2) anon NO puede SELECT
--   3) admin SÍ puede SELECT
--   4) employee NO puede SELECT
-- Usa BEGIN/ROLLBACK — seguro contra prod.
-- NOTA: INSERT en auth.users dispara handle_new_user() que crea el perfil
--       automáticamente; se usa raw_user_meta_data para pasar el rol.

BEGIN;

-- Crear usuarios de prueba: el trigger on_auth_user_created crea los profiles.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local',
   '{"role":"admin","first_name":"Admin","last_name":"Test"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'emp@test.local',
   '{"role":"employee","first_name":"Employee","last_name":"Test"}');

-- TEST 1: anon puede INSERT
SET ROLE anon;
INSERT INTO demo_requests (nombre, email, empresa, telefono, sector)
VALUES ('Test Lead', 'test@example.com', 'Acme', '+57 300 1234567', 'salud');

-- TEST 2: anon NO puede SELECT
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL: anon vio % rows', row_count;
  END IF;
END $$;

-- TEST 3: admin SÍ puede SELECT
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count < 1 THEN
    RAISE EXCEPTION 'FAIL: admin no pudo ver demo_requests (count=%)', row_count;
  END IF;
END $$;

-- TEST 4: employee NO puede SELECT
SET request.jwt.claims TO '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL: employee vio % rows', row_count;
  END IF;
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'Todos los tests RLS de demo_requests pasaron'; END $$;

ROLLBACK;
