CREATE OR REPLACE FUNCTION recompute_equity_rollup(
  p_employee_id UUID,
  p_year INT,
  p_month INT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO employee_equity_rollups (
    employee_id, year, month,
    sundays_worked, saturdays_worked, nights_worked, holidays_worked, total_hours
  )
  SELECT
    p_employee_id, p_year, p_month,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 0)::INT,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM se.date) = 6)::INT,
    COUNT(*) FILTER (WHERE st.is_night = true)::INT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.date = se.date
        AND (h.location_id IS NULL OR h.location_id = (
          SELECT s.location_id FROM schedules s WHERE s.id = se.schedule_id
        ))
    ))::INT,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (
        (se.date + se.end_time) +
          CASE WHEN se.end_time < se.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END
        - (se.date + se.start_time)
      )) / 3600
    ), 0)::NUMERIC(6,2)
  FROM schedule_entries se
  LEFT JOIN shift_templates st ON st.id = se.shift_template_id
  WHERE se.employee_id = p_employee_id
    AND EXTRACT(YEAR FROM se.date) = p_year
    AND EXTRACT(MONTH FROM se.date) = p_month
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    sundays_worked   = EXCLUDED.sundays_worked,
    saturdays_worked = EXCLUDED.saturdays_worked,
    nights_worked    = EXCLUDED.nights_worked,
    holidays_worked  = EXCLUDED.holidays_worked,
    total_hours      = EXCLUDED.total_hours,
    updated_at       = now();
END;
$$;

CREATE OR REPLACE FUNCTION trg_recompute_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_equity_rollup(
      OLD.employee_id,
      EXTRACT(YEAR FROM OLD.date)::INT,
      EXTRACT(MONTH FROM OLD.date)::INT
    );
    RETURN OLD;
  END IF;

  PERFORM recompute_equity_rollup(
    NEW.employee_id,
    EXTRACT(YEAR FROM NEW.date)::INT,
    EXTRACT(MONTH FROM NEW.date)::INT
  );

  IF TG_OP = 'UPDATE' AND (
    OLD.employee_id <> NEW.employee_id OR OLD.date <> NEW.date
  ) THEN
    PERFORM recompute_equity_rollup(
      OLD.employee_id,
      EXTRACT(YEAR FROM OLD.date)::INT,
      EXTRACT(MONTH FROM OLD.date)::INT
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_entries_rollup_trigger
  AFTER INSERT OR UPDATE OR DELETE ON schedule_entries
  FOR EACH ROW EXECUTE FUNCTION trg_recompute_rollup();

CREATE OR REPLACE FUNCTION trg_holidays_cascade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  rec RECORD;
  affected_date DATE;
BEGIN
  affected_date := COALESCE(NEW.date, OLD.date);
  FOR rec IN
    SELECT DISTINCT
      se.employee_id,
      EXTRACT(YEAR FROM se.date)::INT  AS yr,
      EXTRACT(MONTH FROM se.date)::INT AS mo
    FROM schedule_entries se
    WHERE se.date = affected_date
  LOOP
    PERFORM recompute_equity_rollup(rec.employee_id, rec.yr, rec.mo);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER holidays_cascade_trigger
  AFTER INSERT OR UPDATE OR DELETE ON holidays
  FOR EACH ROW EXECUTE FUNCTION trg_holidays_cascade();
