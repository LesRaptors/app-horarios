-- Migration 031: el trigger de aprobación generaba meses en inglés ("April")
-- porque el locale del DB esta en en_US. Mapeamos manualmente a español.

CREATE OR REPLACE FUNCTION notify_employees_on_period_approval()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  emp_id UUID;
  month_label TEXT;
  month_names TEXT[] := ARRAY[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
BEGIN
  IF NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  month_label := initcap(month_names[EXTRACT(MONTH FROM NEW.period_start)::int])
                 || ' ' || EXTRACT(YEAR FROM NEW.period_start)::text;

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
