-- =============================================================================
-- Test: esquema sent_reminders (migration 048)
-- Verifica: insert, UNIQUE constraint, FK CASCADE on org delete.
-- Pattern: BEGIN ... ROLLBACK — seguro contra prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Setup: org de prueba
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES ('00000000-0000-0000-0000-000000000e01', 'Test Sent Reminders Org', 'test-sent-reminders', 'starter', 'active', 'CO', 'America/Bogota');

-- =============================================================================
-- Test 1: INSERT válido → registro creado con defaults correctos
-- =============================================================================
DO $$
DECLARE
  rec_id   UUID;
  rec_tmpl TEXT;
BEGIN
  INSERT INTO sent_reminders (organization_id, template, days_offset)
  VALUES ('00000000-0000-0000-0000-000000000e01', 'trial-ending', 3)
  RETURNING id, template INTO rec_id, rec_tmpl;

  IF rec_id IS NULL THEN
    RAISE EXCEPTION 'FAIL test 1: id nulo después del INSERT';
  END IF;
  IF rec_tmpl <> 'trial-ending' THEN
    RAISE EXCEPTION 'FAIL test 1: template incorrecto (%)', rec_tmpl;
  END IF;

  RAISE NOTICE 'PASS test 1: INSERT válido creó registro (id=%, template=%)', rec_id, rec_tmpl;
END $$;

-- =============================================================================
-- Test 2: UNIQUE constraint rechaza duplicado (org + template + days_offset)
-- =============================================================================
DO $$
DECLARE unique_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO sent_reminders (organization_id, template, days_offset)
    VALUES ('00000000-0000-0000-0000-000000000e01', 'trial-ending', 3);
  EXCEPTION WHEN unique_violation THEN
    unique_blocked := true;
  END;
  IF NOT unique_blocked THEN
    RAISE EXCEPTION 'FAIL test 2: UNIQUE constraint no rechazó el duplicado';
  END IF;
  RAISE NOTICE 'PASS test 2: UNIQUE constraint rechaza (org, template, days_offset) duplicado';
END $$;

-- =============================================================================
-- Test 3: ON DELETE CASCADE — eliminar org elimina sus sent_reminders
-- =============================================================================
DO $$
DECLARE rec_count INT;
BEGIN
  SELECT COUNT(*) INTO rec_count
  FROM sent_reminders
  WHERE organization_id = '00000000-0000-0000-0000-000000000e01';

  IF rec_count < 1 THEN
    RAISE EXCEPTION 'FAIL test 3 setup: no hay registros para la org antes del DELETE';
  END IF;

  DELETE FROM organizations WHERE id = '00000000-0000-0000-0000-000000000e01';

  SELECT COUNT(*) INTO rec_count
  FROM sent_reminders
  WHERE organization_id = '00000000-0000-0000-0000-000000000e01';

  IF rec_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 3: sent_reminders no fue eliminado por CASCADE (count=%)', rec_count;
  END IF;

  RAISE NOTICE 'PASS test 3: ON DELETE CASCADE elimina sent_reminders al borrar org';
END $$;

ROLLBACK;

SELECT 'All 3 sent_reminders_schema tests PASSED' AS result;
