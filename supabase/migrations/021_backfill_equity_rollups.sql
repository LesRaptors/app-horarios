DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      se.employee_id,
      EXTRACT(YEAR FROM se.date)::INT  AS yr,
      EXTRACT(MONTH FROM se.date)::INT AS mo
    FROM schedule_entries se
  LOOP
    PERFORM recompute_equity_rollup(rec.employee_id, rec.yr, rec.mo);
  END LOOP;
END $$;
