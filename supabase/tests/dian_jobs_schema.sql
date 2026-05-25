-- =============================================================================
-- Test: esquema dian_emit_jobs (migration 047)
-- Verifica: defaults, CHECK constraint, CASCADE DELETE, índice.
-- Pattern: BEGIN ... ROLLBACK — seguro contra prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Setup: org + subscription + invoice de prueba (requisitos de FK)
-- =============================================================================
INSERT INTO organizations (id, name, slug, plan, status, country, timezone)
VALUES ('00000000-0000-0000-0000-000000000d01', 'Test DIAN Jobs Org', 'test-dian-jobs', 'starter', 'active', 'CO', 'America/Bogota');

INSERT INTO subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end)
VALUES ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d01', 'starter', 'active', now(), now() + INTERVAL '30 days');

INSERT INTO invoices (id, organization_id, subscription_id, plan_id, period_start, period_end, amount_cop, iva_cop, total_cop, status, due_date)
VALUES ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000d02',
        'starter', now(), now() + INTERVAL '30 days', 99000, 18810, 117810, 'open', now() + INTERVAL '5 days');

-- =============================================================================
-- Test 1: INSERT con invoice_id válido → defaults aplicados correctamente
-- =============================================================================
DO $$
DECLARE
  job_id       UUID;
  job_status   TEXT;
  job_attempts INT;
BEGIN
  INSERT INTO dian_emit_jobs (invoice_id)
  VALUES ('00000000-0000-0000-0000-000000000d03')
  RETURNING id INTO job_id;

  SELECT status, attempt_count INTO job_status, job_attempts
  FROM dian_emit_jobs WHERE id = job_id;

  IF job_status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL test 1a: status esperado pending, obtenido %', job_status;
  END IF;
  IF job_attempts <> 0 THEN
    RAISE EXCEPTION 'FAIL test 1b: attempt_count esperado 0, obtenido %', job_attempts;
  END IF;

  RAISE NOTICE 'PASS test 1: INSERT con defaults correctos (status=%, attempt_count=%)', job_status, job_attempts;
END $$;

-- =============================================================================
-- Test 2: CHECK constraint rechaza status inválido
-- =============================================================================
DO $$
DECLARE check_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO dian_emit_jobs (invoice_id, status)
    VALUES ('00000000-0000-0000-0000-000000000d03', 'invalid_status');
  EXCEPTION WHEN check_violation THEN
    check_blocked := true;
  END;
  IF NOT check_blocked THEN
    RAISE EXCEPTION 'FAIL test 2: CHECK constraint no rechazó status inválido';
  END IF;
  RAISE NOTICE 'PASS test 2: CHECK constraint rechaza status inválido';
END $$;

-- =============================================================================
-- Test 3: ON DELETE CASCADE — eliminar invoice elimina sus jobs
-- =============================================================================
DO $$
DECLARE
  job_id     UUID;
  job_count  INT;
BEGIN
  -- Insertar un job
  INSERT INTO dian_emit_jobs (invoice_id)
  VALUES ('00000000-0000-0000-0000-000000000d03')
  RETURNING id INTO job_id;

  -- Confirmar que existe
  SELECT COUNT(*) INTO job_count FROM dian_emit_jobs WHERE id = job_id;
  IF job_count <> 1 THEN
    RAISE EXCEPTION 'FAIL test 3 setup: job no encontrado antes del DELETE';
  END IF;

  -- Eliminar el invoice → debe cascadear
  DELETE FROM invoices WHERE id = '00000000-0000-0000-0000-000000000d03';

  SELECT COUNT(*) INTO job_count FROM dian_emit_jobs WHERE id = job_id;
  IF job_count <> 0 THEN
    RAISE EXCEPTION 'FAIL test 3: job no fue eliminado por CASCADE (count=%)', job_count;
  END IF;

  RAISE NOTICE 'PASS test 3: ON DELETE CASCADE elimina jobs al borrar invoice';
END $$;

-- =============================================================================
-- Test 4: Índice dian_jobs_next_attempt_idx existe
-- =============================================================================
DO $$
DECLARE idx_count INT;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE tablename = 'dian_emit_jobs'
    AND indexname  = 'dian_jobs_next_attempt_idx';

  IF idx_count <> 1 THEN
    RAISE EXCEPTION 'FAIL test 4: índice dian_jobs_next_attempt_idx no encontrado';
  END IF;
  RAISE NOTICE 'PASS test 4: índice dian_jobs_next_attempt_idx existe';
END $$;

ROLLBACK;

SELECT 'All 4 dian_jobs_schema tests PASSED' AS result;
