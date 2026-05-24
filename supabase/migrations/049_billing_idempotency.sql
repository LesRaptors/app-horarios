-- Migración 049: Idempotencia de cobros — índice único parcial en facturas abiertas
-- y NOT NULL en billing_exempt para evitar pérdida silenciosa de ingresos.
--
-- Problema 1: Si el cron se ejecuta dos veces antes de que el webhook avance
--   current_period_end, se crearían dos facturas "open" para la misma suscripción
--   y se realizarían dos cobros reales a la tarjeta.
-- Problema 2: organizations.billing_exempt = NULL produce que la condición
--   .eq('billing_exempt', false) descarte la fila (NULL = false → NULL en Postgres),
--   silenciando el cobro a esa organización.

BEGIN;

-- ── IMPORTANT 1: backfill + NOT NULL en billing_exempt ────────────────────────
-- Garantiza que ningún org quede sin clasificar; el motor de cobro usa
-- .eq('billing_exempt', false) que con NOT NULL es correcto por construcción.
UPDATE organizations SET billing_exempt = false WHERE billing_exempt IS NULL;
ALTER TABLE organizations ALTER COLUMN billing_exempt SET NOT NULL;

-- ── BLOCKER: índice único parcial — sólo una factura abierta por suscripción ──
-- El índice aplica exclusivamente a filas con status = 'open'.
-- Facturas en estado draft / paid / failed / void no están restringidas.
-- prepare-checkout también crea facturas con status='open', lo cual es correcto:
-- si ya hay una factura abierta del widget, el cron no debe crear otra (doble cobro).
CREATE UNIQUE INDEX invoices_one_open_per_sub
  ON invoices (subscription_id)
  WHERE status = 'open';

COMMIT;
