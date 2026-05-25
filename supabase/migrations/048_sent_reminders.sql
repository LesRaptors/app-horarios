-- Migration 048: Tabla de deduplicación de recordatorios de billing (sent_reminders)
--
-- ¿Qué hace?
--   - Crea la tabla sent_reminders para evitar enviar el mismo correo de billing
--     dos veces a la misma organización (dedup por organización + template + días_offset).
--   - El constraint UNIQUE (organization_id, template, days_offset) garantiza que
--     un recordatorio concreto (ej. "trial-ending a 3 días") solo se envíe una vez
--     por ciclo, incluso si el cron se ejecuta múltiples veces.
--   - RLS habilitado: solo super_admin puede operar directamente;
--     el cron/webhook usa service_role (bypassea RLS).
--
-- ¿Por qué?
--   El cron de billing que dispara recordatorios (trial-ending, payment-failed, etc.)
--   puede ejecutarse varias veces por día. Esta tabla actúa como registro de envío
--   para no duplicar correos hacia las organizaciones.
--
-- Side effects:
--   - Regenerar src/lib/supabase/database.types.ts (vía /regen-types)

BEGIN;

-- ============================================================
-- 1. Tabla sent_reminders
-- ============================================================
CREATE TABLE sent_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template        TEXT        NOT NULL,
  days_offset     INT         NOT NULL,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, template, days_offset)
);

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE sent_reminders ENABLE ROW LEVEL SECURITY;

-- Solo super_admin puede operar directamente desde cliente.
-- El cron/webhook usa service_role → bypassea RLS sin policy.
CREATE POLICY sr_super_admin ON sent_reminders
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;
