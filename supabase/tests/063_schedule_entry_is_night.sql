-- Test: schedule_entries.is_night existe (boolean, nullable) y el trigger cuenta noches
-- desde el carácter efectivo del entry con fallback al flag de la plantilla (COALESCE).
-- Seguro contra prod (BEGIN...ROLLBACK).
BEGIN;

DO $$
DECLARE
  n int;
  fdef text;
BEGIN
  -- Columna persistida del carácter nocturno (nullable: NULL = fallback al flag).
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_name = 'schedule_entries'
    AND column_name = 'is_night'
    AND data_type = 'boolean'
    AND is_nullable = 'YES';
  IF n <> 1 THEN
    RAISE EXCEPTION 'schedule_entries.is_night ausente o no es boolean nullable (encontré %)', n;
  END IF;

  -- El trigger cuenta noches con COALESCE(se.is_night, st.is_night): efectivo del entry
  -- con fallback al flag de la plantilla.
  fdef := pg_get_functiondef('public.recompute_equity_rollup(uuid, integer, integer)'::regprocedure);
  IF position('COALESCE(se.is_night, st.is_night' IN fdef) = 0 THEN
    RAISE EXCEPTION 'recompute_equity_rollup no cuenta nights con COALESCE(se.is_night, st.is_night)';
  END IF;
END $$;

ROLLBACK;
