-- Migration 047: Cola de emisión DIAN asíncrona (dian_emit_jobs)
--
-- ¿Qué hace?
--   - Crea la tabla dian_emit_jobs para procesar de forma asíncrona la emisión
--     de facturas electrónicas al proveedor DIAN (Alegra, Siigo, etc.).
--   - Soporta reintentos exponenciales (hasta MAX_ATTEMPTS=3) gestionados desde
--     el procesador en src/lib/billing/dian-emit-job.ts.
--   - Cada trabajo referencia un invoice de la tabla invoices (CASCADE DELETE).
--   - RLS habilitado: solo super_admin puede operar directamente;
--     el cron/webhook usa service_role (bypassea RLS).
--
-- ¿Por qué?
--   El webhook de Wompi dispara la emisión DIAN cuando un pago es APPROVED.
--   La emisión puede fallar (timeouts, errores del proveedor) por lo que necesita
--   un mecanismo de cola con reintentos y backoff exponencial desacoplado del
--   handler HTTP.
--
-- Side effects:
--   - Regenerar src/lib/supabase/database.types.ts (vía /regen-types)

BEGIN;

-- ============================================================
-- 1. Tabla dian_emit_jobs
-- ============================================================
CREATE TABLE dian_emit_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','succeeded','failed')),
  attempt_count    INT         NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Índice para el procesador (poll por status + next_attempt_at)
-- ============================================================
CREATE INDEX dian_jobs_next_attempt_idx ON dian_emit_jobs(status, next_attempt_at);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE dian_emit_jobs ENABLE ROW LEVEL SECURITY;

-- Solo super_admin puede operar directamente desde cliente.
-- El webhook/cron usa service_role → bypassea RLS sin policy.
CREATE POLICY dian_jobs_super_admin ON dian_emit_jobs
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================
-- 4. Trigger updated_at (reutiliza set_updated_at de migración 039)
-- ============================================================
CREATE TRIGGER dian_emit_jobs_set_updated_at
  BEFORE UPDATE ON dian_emit_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
