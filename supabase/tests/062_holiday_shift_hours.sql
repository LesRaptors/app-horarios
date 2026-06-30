-- Test: las 3 columnas de horario de festivo existen y son nullables.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_name = 'shift_templates'
    AND column_name IN ('holiday_start_time', 'holiday_end_time', 'holiday_break_minutes')
    AND is_nullable = 'YES';
  IF n <> 3 THEN
    RAISE EXCEPTION 'Esperaba 3 columnas holiday_* nullables en shift_templates, encontré %', n;
  END IF;

  -- Verifica los tipos esperados.
  PERFORM 1 FROM information_schema.columns
  WHERE table_name = 'shift_templates' AND column_name = 'holiday_start_time' AND data_type = 'time without time zone';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_start_time no es de tipo time'; END IF;

  PERFORM 1 FROM information_schema.columns
  WHERE table_name = 'shift_templates' AND column_name = 'holiday_end_time' AND data_type = 'time without time zone';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_end_time no es de tipo time'; END IF;

  PERFORM 1 FROM information_schema.columns
  WHERE table_name = 'shift_templates' AND column_name = 'holiday_break_minutes' AND data_type = 'integer';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_break_minutes no es de tipo integer'; END IF;
END $$;

ROLLBACK;
