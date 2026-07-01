-- Test: schedule_entries.break_minutes existe (integer nullable) y el trigger resta el
-- descanso en total_hours. Seguro contra prod (BEGIN...ROLLBACK).
BEGIN;

DO $$
DECLARE
  n int;
  fdef text;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_name = 'schedule_entries'
    AND column_name = 'break_minutes'
    AND data_type = 'integer'
    AND is_nullable = 'YES';
  IF n <> 1 THEN
    RAISE EXCEPTION 'schedule_entries.break_minutes ausente o no es integer nullable (encontré %)', n;
  END IF;

  fdef := pg_get_functiondef('public.recompute_equity_rollup(uuid, integer, integer)'::regprocedure);
  IF position('COALESCE(se.break_minutes, 0)' IN fdef) = 0 THEN
    RAISE EXCEPTION 'recompute_equity_rollup no resta COALESCE(se.break_minutes, 0) en total_hours';
  END IF;
  -- No debe haber perdido el COALESCE de is_night (regresión).
  IF position('COALESCE(se.is_night, st.is_night' IN fdef) = 0 THEN
    RAISE EXCEPTION 'recompute_equity_rollup perdió el COALESCE de is_night';
  END IF;
END $$;

ROLLBACK;
