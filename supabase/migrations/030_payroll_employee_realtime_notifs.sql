-- Migration 030: Payroll employee colilla — realtime + notifications + advance flag + payment_mode.

-- 1. Mark Q1 advance periods (model B).
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS is_advance BOOLEAN NOT NULL DEFAULT false;

-- 2. Realtime: subscribe to payroll_periods status changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payroll_periods'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_periods;
  END IF;
END $$;
ALTER TABLE payroll_periods REPLICA IDENTITY FULL;

-- 3. Notification trigger on approval.
CREATE OR REPLACE FUNCTION notify_employees_on_period_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  emp_id UUID;
  month_label TEXT;
BEGIN
  IF NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  month_label := to_char(NEW.period_start, 'TMMonth YYYY');

  FOR emp_id IN
    SELECT DISTINCT employee_id FROM payroll_entries
    WHERE payroll_period_id = NEW.id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      emp_id,
      'general',
      'Tu pago de ' || month_label || ' está disponible',
      'Ya podés ver el detalle de tu liquidación en Mi Pago.',
      '/mi-pago?period=' || NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_employees_on_period_approval_trg ON payroll_periods;
CREATE TRIGGER notify_employees_on_period_approval_trg
  AFTER UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION notify_employees_on_period_approval();

-- 4. payment_mode in app_flags (default independent for backwards compat).
UPDATE app_settings
   SET value = jsonb_set(
     COALESCE(value, '{}'::jsonb),
     '{payment_mode}',
     '"independent"'::jsonb,
     true
   )
 WHERE key = 'app_flags';
