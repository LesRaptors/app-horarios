-- Migration 026: Reject overlapping period ranges in payroll_settings.
-- Companion to 025; the spec promised this guarantee but it was missing.

CREATE OR REPLACE FUNCTION payroll_settings_reject_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_end DATE;
BEGIN
  new_end := COALESCE(NEW.period_end, '9999-12-31'::date);

  IF EXISTS (
    SELECT 1 FROM payroll_settings
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND period_start <= new_end
      AND COALESCE(period_end, '9999-12-31'::date) >= NEW.period_start
  ) THEN
    RAISE EXCEPTION 'El período se solapa con otro período de configuración existente';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_settings_reject_overlap_trg
  BEFORE INSERT OR UPDATE ON payroll_settings
  FOR EACH ROW EXECUTE FUNCTION payroll_settings_reject_overlap();
