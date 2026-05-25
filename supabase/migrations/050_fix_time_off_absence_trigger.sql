-- Migración 050 — Fix del trigger time_off_to_absence_record (bug P1)
--
-- La migración 029 creó la función time_off_to_absence_record() referenciando
-- NEW.type, pero time_off_requests NUNCA tuvo esa columna. Además el INSERT a
-- absence_records omitía organization_id, que pasó a NOT NULL en la migración 039.
-- Resultado: CUALQUIER INSERT/UPDATE en time_off_requests fallaba con
-- "record new has no field type" → el flujo de solicitudes de ausencia (/requests)
-- quedó roto en producción.
--
-- Fix: time_off_requests no distingue tipos de ausencia, así que las solicitudes
-- aprobadas se registran como ausencia remunerada por el empleador (vacation,
-- paid_pct=1, payer=employer). Se incluye organization_id desde NEW. Refinar el
-- mapeo de tipos reales (columna type + UI) queda como feature futuro.

BEGIN;

CREATE OR REPLACE FUNCTION public.time_off_to_absence_record()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_type TEXT := 'vacation';
  v_paid_pct NUMERIC(4,3) := 1;
  v_payer TEXT := 'employer';
BEGIN
  -- 1. Aprobación (no estaba aprobada, ahora sí)
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved') THEN
    INSERT INTO absence_records
      (employee_id, start_date, end_date, type, paid_pct, payer, source_request_id, organization_id)
    VALUES
      (NEW.employee_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id, NEW.organization_id);
    RETURN NEW;
  END IF;

  -- 2. Des-aprobación (estaba aprobada, ahora no)
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 3. Cambio de rango de fechas estando aprobada: reemplazar.
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND
     (OLD.start_date <> NEW.start_date OR OLD.end_date <> NEW.end_date) THEN
    DELETE FROM absence_records WHERE source_request_id = NEW.id;
    INSERT INTO absence_records
      (employee_id, start_date, end_date, type, paid_pct, payer, source_request_id, organization_id)
    VALUES
      (NEW.employee_id, NEW.start_date, NEW.end_date, v_type, v_paid_pct, v_payer, NEW.id, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
